import "server-only";
import { z } from "zod";
import { generate } from "@/lib/claude";
import { sanitizePromptField } from "@/lib/prompt-safety";
import { loadPrompt } from "@/lib/prompts";
import { parseModelJson, type QuizQuestionT } from "@/lib/schemas";
import { createSourceLocator } from "@/lib/source-grounding";

interface VerifyUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface QuizVerificationResult {
  kept: QuizQuestionT[];
  dropped: Array<{ questionId: number; reason: string; evidence: string }>;
  technicalFailure: boolean;
  modelId: string | null;
  usage: VerifyUsage;
}

const BATCH_SIZE = 20;
const Verdicts = z.object({
  verdicts: z
    .array(
      z.object({
        questionId: z.number().int().positive(),
        citationSupported: z.boolean(),
        correctChoiceKeys: z.array(z.enum(["A", "B", "C", "D"])).max(4),
        answerSupported: z.boolean(),
        explanationSupported: z.boolean(),
        valid: z.boolean(),
        reason: z.string().min(2).max(180),
      }),
    )
    .max(BATCH_SIZE),
});

export async function verifyQuizQuestions(opts: {
  questions: QuizQuestionT[];
  sourceText: string;
  scope?: string;
}): Promise<QuizVerificationResult> {
  if (opts.questions.length === 0) return emptyResult();
  if (new Set(opts.questions.map((q) => q.id)).size !== opts.questions.length) {
    return {
      ...emptyResult(),
      technicalFailure: true,
      dropped: opts.questions.map((q) => drop(q, "검수 입력의 문항 번호가 중복됨")),
    };
  }
  const locate = createSourceLocator(opts.sourceText);
  const grounded: Array<{ question: QuizQuestionT; sourceContext: string }> = [];
  const missingSource: QuizVerificationResult["dropped"] = [];
  for (const q of opts.questions) {
    const source = locate(q.evidence ?? "");
    if (!source) missingSource.push(drop(q, "인용의 실제 자료 위치를 확인하지 못함"));
    else
      grounded.push({
        question: { ...q, evidencePage: source.page },
        sourceContext: source.context,
      });
  }
  const batches: Array<typeof grounded> = [];
  for (let i = 0; i < grounded.length; i += BATCH_SIZE)
    batches.push(grounded.slice(i, i + BATCH_SIZE));
  const results = await Promise.all(batches.map((batch) => verifyBatch(batch, opts.scope)));
  return {
    kept: results.flatMap((r) => r.kept),
    dropped: [...missingSource, ...results.flatMap((r) => r.dropped)],
    technicalFailure: results.some((r) => r.technicalFailure),
    modelId: results.find((r) => r.modelId)?.modelId ?? null,
    usage: results.reduce(
      (total, r) => ({
        inputTokens: total.inputTokens + r.usage.inputTokens,
        outputTokens: total.outputTokens + r.usage.outputTokens,
        cacheReadTokens: total.cacheReadTokens + r.usage.cacheReadTokens,
        cacheCreationTokens: total.cacheCreationTokens + r.usage.cacheCreationTokens,
      }),
      zeroUsage(),
    ),
  };
}

async function verifyBatch(
  batch: Array<{ question: QuizQuestionT; sourceContext: string }>,
  scope?: string,
): Promise<QuizVerificationResult> {
  let usage = zeroUsage();
  let modelId: string | null = null;
  try {
    const items = batch.map(({ question: q, sourceContext }) => ({
      questionId: q.id,
      kind: q.kind ?? "multiple-choice",
      difficulty: q.difficulty,
      sourceContext,
      evidence: q.evidence,
      stem: q.stem,
      choices: q.choices ?? null,
      answer: q.answer,
      explanation: q.explanation,
    }));
    const generated = await generate({
      tool: "quiz-verify",
      rulePrompt: loadPrompt("quiz-verify"),
      responseSchema: Verdicts,
      dynamicContext: `허용 questionId: ${items.map((item) => item.questionId).join(", ")}\n각 문항을 한 번씩 판정한다.${scope?.trim() ? `\n범위 데이터: <user_scope>${sanitizePromptField(scope, 200)}</user_scope>` : ""}`,
      userInput: JSON.stringify({ items }),
      temperature: 0,
      maxTokens: 700 + items.length * 250,
    });
    usage = generated.usage ?? zeroUsage();
    modelId = generated.modelId ?? null;
    const parsed = parseModelJson(Verdicts, generated.text);
    const allowedIds = new Set(batch.map(({ question: q }) => q.id));
    const byId = new Map<number, z.infer<typeof Verdicts>["verdicts"][number]>();
    const duplicateIds = new Set<number>();
    for (const verdict of parsed.verdicts) {
      if (!allowedIds.has(verdict.questionId)) continue;
      if (byId.has(verdict.questionId)) duplicateIds.add(verdict.questionId);
      else byId.set(verdict.questionId, verdict);
    }
    const kept: QuizQuestionT[] = [];
    const dropped: QuizVerificationResult["dropped"] = [];
    for (const { question: q } of batch) {
      const verdict = byId.get(q.id);
      const mcqMatches =
        (q.kind ?? "multiple-choice") !== "multiple-choice" ||
        (verdict?.correctChoiceKeys.length === 1 && verdict.correctChoiceKeys[0] === q.answer);
      if (duplicateIds.has(q.id))
        dropped.push(drop(q, "2차 품질 검수에 중복 판정이 있어 문항을 보류함"));
      else if (
        verdict?.valid &&
        verdict.citationSupported &&
        verdict.answerSupported &&
        verdict.explanationSupported &&
        mcqMatches
      )
        kept.push(q);
      else
        dropped.push(
          drop(
            q,
            !verdict
              ? "2차 품질 검수 응답에서 문항 판정이 누락됨"
              : !mcqMatches
                ? "검수자가 직접 판정한 유일한 정답과 생성 답안이 일치하지 않음"
                : verdict.reason,
          ),
        );
    }
    return { kept, dropped, technicalFailure: false, modelId, usage };
  } catch {
    // Never print the provider error/raw response: it may contain private source text.
    return {
      kept: [],
      dropped: batch.map(({ question }) =>
        drop(question, "2차 품질 검수를 완료하지 못해 문항을 저장하지 않음"),
      ),
      technicalFailure: true,
      modelId,
      usage,
    };
  }
}

function drop(question: QuizQuestionT, reason: string) {
  return { questionId: question.id, reason, evidence: question.stem.slice(0, 120) };
}
function zeroUsage(): VerifyUsage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
}
function emptyResult(): QuizVerificationResult {
  return { kept: [], dropped: [], technicalFailure: false, modelId: null, usage: zeroUsage() };
}
