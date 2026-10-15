import "server-only";
import { z } from "zod";
import { generate } from "@/lib/claude";
import { loadPrompt } from "@/lib/prompts";
import { parseModelJson } from "@/lib/schemas";
import {
  type GradedQuiz,
  type GradedResult,
  violatesRequestedScript,
} from "@/lib/services/grade-quiz";

/**
 * 자유 입력 답안 보조 채점.
 *
 * 단답형은 정확 매칭에 실패했지만 의미가 완전히 같은 표현만 정답으로 승격한다.
 * 서술형은 모범답안의 필수 포인트와 논리 관계를 기준으로 재판정해, 단어만
 * 나열한 답이나 문맥이 반대인 답이 키워드 포함만으로 통과하지 않게 한다.
 *
 * 모델 실패·형식 오류 시 기존 판정에 재확인이 필요함을 표시한다.
 * 객관식과 이미 정답으로 확인된 단답은 모델에 보내지 않는다.
 */

interface AssistedResult extends GradedResult {
  llmPromoted?: boolean;
  llmGraded?: boolean;
}

export interface LlmAssistedGraded {
  score: number;
  total: number;
  results: AssistedResult[];
  llmCalled: boolean;
  promotedCount: number;
  essayGradedCount: number;
}

interface JudgeItem {
  questionId: number;
  kind: "short-answer" | "essay";
  stem: string;
  answer: string;
  submitted: string;
  evidence: string;
}

const JudgeResponse = z.object({
  verdicts: z
    .array(
      z.object({
        questionId: z.number().int().positive(),
        correct: z.boolean(),
        reason: z.string().min(2).max(180),
      }),
    )
    .max(50),
});

type JudgeVerdict = z.infer<typeof JudgeResponse>["verdicts"][number];

export async function gradeWithLlmAssist(
  graded: GradedQuiz,
  questions: Array<{ id: number; kind?: string; stem: string }>,
): Promise<LlmAssistedGraded> {
  const candidates: JudgeItem[] = [];
  for (const result of graded.results) {
    if (result.kind === "multiple-choice") continue;
    if (result.submitted === null || result.submitted.trim().length === 0) continue;
    if (result.kind === "short-answer" && result.correct) continue;
    const question = questions.find((item) => item.id === result.questionId);
    if (!question || violatesRequestedScript(question.stem, result.submitted)) continue;
    candidates.push({
      questionId: result.questionId,
      kind: result.kind,
      stem: question.stem,
      answer: result.answer,
      submitted: result.submitted,
      evidence: result.evidence,
    });
  }

  if (candidates.length === 0) return unchanged(graded, false);

  let verdicts: JudgeVerdict[];
  try {
    verdicts = await judgeWithModel(candidates);
  } catch {
    // Provider errors may contain the private question or submitted answer.
    console.warn("[quiz-grade] 보조 채점을 완료하지 못해 기존 판정과 재확인 안내를 유지합니다.");
    const candidateIds = new Set(candidates.map((item) => item.questionId));
    return {
      ...unchanged(graded, true),
      results: graded.results.map((result) =>
        candidateIds.has(result.questionId)
          ? {
              ...result,
              gradingNote:
                "AI 의미 검토를 완료하지 못했어요. 원문과 해설을 확인하고 정답 인정으로 판정을 조정할 수 있어요.",
            }
          : result,
      ),
    };
  }

  const verdictById = new Map(verdicts.map((verdict) => [verdict.questionId, verdict]));
  let promotedCount = 0;
  let essayGradedCount = 0;

  const results: AssistedResult[] = graded.results.map((result) => {
    const verdict = verdictById.get(result.questionId);
    if (!verdict) return result;

    if (result.kind === "essay") {
      essayGradedCount += 1;
      return {
        ...result,
        correct: verdict.correct,
        llmGraded: true,
        llmPromoted: undefined,
        whyWrong: verdict.correct ? undefined : verdict.reason,
        gradingNote: verdict.reason,
      };
    }

    // 단답형은 false → true 승격만 가능하다. 모델은 기존 정답을 뒤집지 않는다.
    if (!verdict.correct || result.correct)
      return {
        ...result,
        llmGraded: true,
        whyWrong: result.correct ? undefined : verdict.reason,
        gradingNote: verdict.reason,
      };
    promotedCount += 1;
    return {
      ...result,
      correct: true,
      llmPromoted: true,
      partial: result.partial
        ? {
            ...result.partial,
            matchedParts: [...result.partial.matchedParts, ...result.partial.missingParts],
            missingParts: [],
          }
        : undefined,
      whyWrong: undefined,
      gradingNote: `표현은 다르지만 의미가 같아 정답으로 인정: ${verdict.reason}`,
    };
  });

  return {
    score: results.filter((result) => result.correct).length,
    total: graded.total,
    results,
    llmCalled: true,
    promotedCount,
    essayGradedCount,
  };
}

function unchanged(graded: GradedQuiz, llmCalled: boolean): LlmAssistedGraded {
  return {
    score: graded.score,
    total: graded.total,
    results: graded.results,
    llmCalled,
    promotedCount: 0,
    essayGradedCount: 0,
  };
}

async function judgeWithModel(items: JudgeItem[]): Promise<JudgeVerdict[]> {
  const result = await generate({
    tool: "quiz-grade",
    rulePrompt: loadPrompt("quiz-grade"),
    responseSchema: JudgeResponse,
    dynamicContext: `채점할 항목 수: ${items.length}\n단답형과 서술형을 kind별 규칙으로 모두 판정한다.\n허용 questionId: ${items
      .map((item) => item.questionId)
      .join(", ")}\n모든 항목을 한 번씩 판정하고 확신이 없으면 correct=false로 답한다.`,
    userInput: JSON.stringify({ items }),
    temperature: 0,
    maxTokens: Math.min(4096, 512 + items.length * 140),
  });

  const parsed = parseModelJson(JudgeResponse, result.text);
  const allowedIds = new Set(items.map((item) => item.questionId));
  const counts = new Map<number, number>();
  for (const verdict of parsed.verdicts) {
    counts.set(verdict.questionId, (counts.get(verdict.questionId) ?? 0) + 1);
  }
  return parsed.verdicts.filter((verdict) => {
    return allowedIds.has(verdict.questionId) && counts.get(verdict.questionId) === 1;
  });
}
