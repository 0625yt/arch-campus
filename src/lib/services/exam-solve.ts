import "server-only";
import { estimateCost, generate, getModelVendor } from "@/lib/claude";
import { loadPrompt } from "@/lib/prompts";
import {
  type ExamExtractedQuestionT,
  ExamSolveOutput,
  type ExamSolveOutputT,
  hasWatermark,
  parseModelJson,
} from "@/lib/schemas";
import { getAdminSupabase } from "@/lib/supabase/admin";

/**
 * 기출 풀이 서비스 — 추출(exam-extract) 직후, 본문에 정답이 없던 문제(answer=null)를
 * 추론 강한 모델(Sonnet / Gemini Pro)로 직접 풀어 "AI 추정" 정답을 채운다.
 *
 * 책임:
 *   - answer=null 문제만 추려 exam-solve 프롬프트로 1회 호출
 *   - 결과를 id로 매핑해 원래 문제 배열에 answer·explanation·answerSource="ai" 머지
 *   - confidence 낮으면 needsManualCheck=true (UI 강한 경고)
 *   - generations 기록 (tool='exam-solve')
 *
 * 치팅 라인 (CLAUDE.md §4):
 *   - 푼 정답은 본문 근거가 아니라 추론 → answerSource="ai"로 박아 UI가 "AI 추정" 경고를 단다
 *   - 워터마크 필수 검증
 *
 * 설계 결정:
 *   - 실패해도 추출 자체를 깨지 않는다. 풀이는 부가 단계 — 실패 시 원본(answer=null) 그대로 반환.
 *   - 풀 문제가 없으면 LLM 호출 자체를 건너뛴다 (비용 0).
 */

export interface ExamSolveOutcome {
  /** 머지 완료된 전체 문제 배열 (풀린 문제는 answerSource="ai"로 채워짐). */
  questions: ExamExtractedQuestionT[];
  /** 이번 풀이로 답이 채워진 문제 수. 0이면 호출 안 했거나 다 못 품. */
  solvedCount: number;
  costUsd: number;
}

export interface ExamSolveInput {
  ownerId: string;
  materialId: string;
  questions: ExamExtractedQuestionT[];
}

/** 모델에 풀이용으로 보낼 최소 필드만. sourceQuote·sourcePageNum 등은 노이즈라 제외. */
type SolvePayloadItem = {
  id: number;
  kind: ExamExtractedQuestionT["kind"];
  stem: string;
  choices?: Array<{ key: string; text: string }> | null;
};

export async function runExamSolve(input: ExamSolveInput): Promise<ExamSolveOutcome> {
  // 본문에 답이 없던 문제만 추린다. (answer != null인 문제는 본문 근거가 있으니 건드리지 않음)
  const toSolve = input.questions.filter((q) => q.answer == null);

  // 풀 게 없으면 호출 자체를 건너뛴다 — 비용 0.
  if (toSolve.length === 0) {
    return { questions: input.questions, solvedCount: 0, costUsd: 0 };
  }

  const payload: SolvePayloadItem[] = toSolve.map((q) => ({
    id: q.id,
    kind: q.kind,
    stem: q.stem,
    choices: q.kind === "multiple-choice" ? (q.choices ?? null) : undefined,
  }));

  const rulePrompt = loadPrompt("exam-solve");
  const dynamicContext = [
    "아래 <user_input>은 학생 기출 자료에서 본문에 정답이 적혀있지 않은 문제들입니다.",
    `풀어야 할 문제 수: ${toSolve.length}개.`,
    "각 문제를 직접 풀어 추정 정답·근거·confidence를 매기세요. 본문은 볼 수 없으니 가짜 출처 인용 금지.",
  ].join("\n");

  let result: Awaited<ReturnType<typeof generate>>;
  try {
    result = await generate({
      tool: "exam-solve",
      rulePrompt,
      dynamicContext,
      userInput: JSON.stringify(payload),
      // 100문제 × (answer+explanation+confidence) ≈ 200~250토큰 → 최대 ~25K 출력.
      maxTokens: 32_000,
      temperature: 0.2, // 풀이는 결정적이어야. 약간의 추론 여지만.
    });
  } catch (e) {
    await logGeneration({
      ownerId: input.ownerId,
      materialId: input.materialId,
      modelId: "exam-solve-error",
      status: "error",
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    // 풀이 실패해도 추출 결과는 살린다 — 원본 그대로 반환.
    return { questions: input.questions, solvedCount: 0, costUsd: 0 };
  }

  let solved: ExamSolveOutputT;
  try {
    solved = parseModelJson(ExamSolveOutput, result.text);
  } catch (e) {
    await logGeneration({
      ownerId: input.ownerId,
      materialId: input.materialId,
      modelId: result.modelId,
      usage: result.usage,
      cost: estimateCost(result.usage, result.modelId),
      status: "error",
      errorMessage: `Zod 검증 실패: ${e instanceof Error ? e.message : String(e)}`,
      payload: { rawText: result.text.slice(0, 4000) },
    });
    return { questions: input.questions, solvedCount: 0, costUsd: 0 };
  }

  // 워터마크 검증 — 빠지면 풀이를 신뢰하지 않고 버린다 (CLAUDE.md §4).
  if (!hasWatermark(solved)) {
    await logGeneration({
      ownerId: input.ownerId,
      materialId: input.materialId,
      modelId: result.modelId,
      usage: result.usage,
      cost: estimateCost(result.usage, result.modelId),
      status: "error",
      errorMessage: "워터마크 누락 또는 변형 — 풀이 폐기",
      payload: { watermark: solved.watermark },
    });
    return { questions: input.questions, solvedCount: 0, costUsd: 0 };
  }

  // id → 풀이 결과 맵. 입력에 있던 id만 신뢰 (모델이 만든 가짜 id 무시).
  const validIds = new Set(toSolve.map((q) => q.id));
  const byId = new Map<number, ExamSolveOutputT["answers"][number]>();
  for (const a of solved.answers) {
    if (validIds.has(a.id)) byId.set(a.id, a);
  }

  let solvedCount = 0;
  const merged = input.questions.map((q) => {
    if (q.answer != null) return q; // 본문 근거 답은 그대로
    const a = byId.get(q.id);
    if (!a || a.answer == null) return q; // 모델이 못 푼 문제 — answer=null 유지
    solvedCount++;
    return {
      ...q,
      answer: a.answer,
      explanation: a.explanation,
      answerSource: "ai" as const,
      // confidence 0.6 미만이면 "확인 필요" 강하게. AI 추정은 본래 확인 권장이라 보수적으로.
      needsManualCheck: a.confidence < 0.6 ? true : q.needsManualCheck,
    };
  });

  const costUsd = estimateCost(result.usage, result.modelId);
  await logGeneration({
    ownerId: input.ownerId,
    materialId: input.materialId,
    modelId: result.modelId,
    usage: result.usage,
    cost: costUsd,
    status: "ok",
    payload: { attempted: toSolve.length, solvedCount },
  });

  return { questions: merged, solvedCount, costUsd };
}

async function logGeneration(opts: {
  ownerId: string;
  materialId: string;
  modelId: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
  cost?: number;
  status: "ok" | "error";
  errorMessage?: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const admin = getAdminSupabase();
  const { error } = await admin.from("generations").insert({
    owner_id: opts.ownerId,
    material_id: opts.materialId,
    tool: "exam-solve",
    model_id: opts.modelId,
    model_provider: getModelVendor(opts.modelId),
    input_tokens: opts.usage?.inputTokens ?? 0,
    output_tokens: opts.usage?.outputTokens ?? 0,
    cache_read_tokens: opts.usage?.cacheReadTokens ?? 0,
    cache_creation_tokens: opts.usage?.cacheCreationTokens ?? 0,
    cost_usd: opts.cost ?? 0,
    status: opts.status,
    error_message: opts.errorMessage ?? null,
    payload: opts.payload ?? {},
  });
  if (error) {
    console.error("generations 기록 실패(exam-solve):", error.message);
  }
}
