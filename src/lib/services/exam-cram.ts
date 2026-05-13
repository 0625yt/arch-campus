import "server-only";
import { generate, estimateCost } from "@/lib/claude";
import { loadPrompt } from "@/lib/prompts";
import {
  ExamCramOutput,
  evidenceMatches,
  parseModelJson,
  type ExamCramOutputT,
} from "@/lib/schemas";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { breakdown } from "@/lib/tokens";

/**
 * 시험 벼락치기 서비스 — `/api/wizards/exam-cram`에서 호출.
 *
 * 사활: 잘못된 단원 추천은 신뢰도 즉시 붕괴.
 * 따라서:
 *  - topics[].evidence가 materials[*].fullText 중 하나에 substring 매칭되는지 검증
 *  - basedOnMaterialIds가 실제 materials.id에 존재하는지 검증
 *  - schedule durationMin 합이 remainingMin ±10% 인지 검증
 * 위 셋 중 하나라도 어기면 ok=false (validation stage).
 */

export interface ExamCramMaterialInput {
  id: string;
  title: string;
  pages?: number | null;
  fullText: string;
  extractedKeywords?: string[] | null;
}

/**
 * 사용자가 실제로 틀렸던 문제의 단원·해설 — 자료 텍스트보다 강한 신호.
 * Topic priority·schedule mode가 weak-spot 우선이 되도록 프롬프트에 직접 박힌다.
 */
export interface ExamCramWrongHint {
  /** 어느 자료에서 나온 오답인지 — basedOnMaterialIds 추론 보조 */
  materialId: string | null;
  /** 퀴즈 제목 = 보통 자료 제목과 비슷 */
  quizTitle: string;
  /** 사용자가 자주 틀린 문제 수 */
  wrongCount: number;
  /** 오답 해설 — 단원 명을 끌어오는 데 좋음 */
  topicSamples: string[];
}

export interface ExamCramInput {
  ownerId: string;
  subject: string;
  remainingMin: number;
  weakSpots?: string;
  materials: ExamCramMaterialInput[];
  /** 비어 있어도 됨 — 있으면 priority 가중치가 weak-spot 단원으로 쏠림 */
  wrongHints?: ExamCramWrongHint[];
}

export type ExamCramResult =
  | {
      ok: true;
      output: ExamCramOutputT;
      modelId: string;
      usage: {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        cacheCreationTokens: number;
      };
      costUsd: number;
      tokenBudget: ReturnType<typeof breakdown>;
    }
  | {
      ok: false;
      stage: "input" | "ai" | "validation";
      error: string;
    };

export async function runExamCram(input: ExamCramInput): Promise<ExamCramResult> {
  // 입력 가드 (UI에서도 막지만 라우트 직접 호출 대비)
  if (input.remainingMin < 30) {
    return { ok: false, stage: "input", error: "남은 시간이 30분 미만이면 새 단원을 못 봐요." };
  }
  if (input.remainingMin > 4320) {
    return {
      ok: false,
      stage: "input",
      error: "3일 넘게 남았으면 벼락치기 대신 학습 루프를 쓰세요.",
    };
  }
  if (input.materials.length === 0) {
    return {
      ok: false,
      stage: "input",
      error: "시험 범위 자료가 없어요. 먼저 자료를 올려주세요.",
    };
  }

  const rulePrompt = loadPrompt("exam-cram");
  const dynamicContext = buildDynamicContext(input);
  const userInput = buildUserInput(input);

  const tokenBudget = breakdown({
    rule: rulePrompt,
    dynamic: dynamicContext,
    user: userInput,
  });

  let result: Awaited<ReturnType<typeof generate>>;
  try {
    result = await generate({
      tool: "wizard-cram",
      rulePrompt,
      dynamicContext,
      userInput,
      maxTokens: 4096,
      temperature: 0.4,
    });
  } catch (e) {
    await logGeneration({
      ownerId: input.ownerId,
      modelId: "claude-sonnet-4-6",
      status: "error",
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, stage: "ai", error: "AI 호출 실패" };
  }

  let output: ExamCramOutputT;
  try {
    output = parseModelJson(ExamCramOutput, result.text);
  } catch (e) {
    await logGeneration({
      ownerId: input.ownerId,
      modelId: result.modelId,
      usage: result.usage,
      cost: estimateCost(result.usage, result.modelId),
      status: "error",
      errorMessage: `Zod 검증 실패: ${e instanceof Error ? e.message : String(e)}`,
      payload: { rawText: result.text.slice(0, 4000) },
    });
    return {
      ok: false,
      stage: "validation",
      error: "AI 출력이 형식에 안 맞아요. 다시 시도해주세요.",
    };
  }

  // 거부 분기는 정상 통과
  if (output.rejected) {
    await logGeneration({
      ownerId: input.ownerId,
      modelId: result.modelId,
      usage: result.usage,
      cost: estimateCost(result.usage, result.modelId),
      status: "rejected",
      payload: { reason: output.reason },
    });
    return {
      ok: true,
      output,
      modelId: result.modelId,
      usage: result.usage,
      costUsd: estimateCost(result.usage, result.modelId),
      tokenBudget,
    };
  }

  // 사후 검증 — evidence substring + materialIds 존재 + duration 합계
  const validation = validateOutput(output, input);
  if (!validation.ok) {
    await logGeneration({
      ownerId: input.ownerId,
      modelId: result.modelId,
      usage: result.usage,
      cost: estimateCost(result.usage, result.modelId),
      status: "rejected",
      errorMessage: `사후 검증 실패: ${validation.reason}`,
      payload: { output },
    });
    return { ok: false, stage: "validation", error: validation.reason };
  }

  const costUsd = estimateCost(result.usage, result.modelId);
  await logGeneration({
    ownerId: input.ownerId,
    modelId: result.modelId,
    usage: result.usage,
    cost: costUsd,
    status: "ok",
    payload: { subject: input.subject, remainingMin: input.remainingMin, output },
  });

  return {
    ok: true,
    output,
    modelId: result.modelId,
    usage: result.usage,
    costUsd,
    tokenBudget,
  };
}

function buildDynamicContext(input: ExamCramInput): string {
  const lines: string[] = [
    `시험 정보:`,
    `- 과목·시험: ${input.subject}`,
    `- 남은 시간: ${input.remainingMin}분 (${formatDuration(input.remainingMin)})`,
  ];
  if (input.weakSpots && input.weakSpots.trim()) {
    lines.push(`- 약점·요청: ${input.weakSpots.trim().slice(0, 400)}`);
  }

  // 사용자 실제 오답 — 자료의 어디를 우선해야 하는지 가장 강한 신호.
  // priority=high·schedule mode=review-mistakes로 가야 하는 단원 후보.
  const hints = (input.wrongHints ?? []).filter((h) => h.wrongCount > 0);
  if (hints.length > 0) {
    lines.push("", `최근 60일 오답 통계 (priority high 후보):`);
    for (const h of hints.slice(0, 6)) {
      const matIdHint = h.materialId ? ` (자료 id=${h.materialId})` : "";
      lines.push(`- ${h.quizTitle} · 오답 ${h.wrongCount}문제${matIdHint}`);
      const samples = h.topicSamples.filter(Boolean).slice(0, 3);
      if (samples.length > 0) {
        lines.push(`  자주 틀린 포인트: ${samples.join(" / ").slice(0, 200)}`);
      }
    }
  }

  lines.push("", `업로드된 자료 ${input.materials.length}건:`);
  for (const m of input.materials) {
    lines.push(`- id=${m.id} · ${m.title}${m.pages ? ` (${m.pages}쪽)` : ""}`);
    if (m.extractedKeywords?.length) {
      lines.push(`  키워드: ${m.extractedKeywords.slice(0, 10).join(", ")}`);
    }
  }
  return lines.join("\n");
}

function buildUserInput(input: ExamCramInput): string {
  // 모든 자료 본문을 한 번에 — 모델이 단원 매칭하려면 다 봐야 함
  // 자료당 8천자 컷 (Sonnet 4.6 입력 200k지만 비용·집중도 고려)
  const blocks = input.materials.map((m) => {
    const text = (m.fullText || "").slice(0, 8000);
    return `=== 자료 id=${m.id} (${m.title}) ===\n${text}`;
  });
  return blocks.join("\n\n");
}

function validateOutput(
  output: Extract<ExamCramOutputT, { rejected?: false | undefined }>,
  input: ExamCramInput,
): { ok: true } | { ok: false; reason: string } {
  if (output.rejected) return { ok: true }; // narrow guard

  // 1) evidence substring + materialIds 존재
  const materialMap = new Map(input.materials.map((m) => [m.id, m.fullText]));
  for (const topic of output.topics) {
    // 모든 basedOnMaterialIds가 실제 materials에 있는지
    for (const mid of topic.basedOnMaterialIds) {
      if (!materialMap.has(mid)) {
        return {
          ok: false,
          reason: `topic "${topic.name}"의 basedOnMaterialIds에 없는 자료 id: ${mid}`,
        };
      }
    }
    // evidence가 basedOnMaterialIds 중 적어도 하나에 substring
    const matches = topic.basedOnMaterialIds.some((mid) => {
      const fullText = materialMap.get(mid);
      return fullText ? evidenceMatches(fullText, topic.evidence) : false;
    });
    if (!matches) {
      return {
        ok: false,
        reason: `topic "${topic.name}"의 evidence가 자료 본문에 없어요`,
      };
    }
  }

  // 2) weight 합
  const weightSum = output.topics.reduce((a, t) => a + t.weight, 0);
  if (weightSum < 0.95 || weightSum > 1.05) {
    return {
      ok: false,
      reason: `topics weight 합이 ${weightSum.toFixed(2)} — 0.95~1.05 범위 벗어남`,
    };
  }

  // 3) schedule 합계
  const durationSum = output.schedule.reduce((a, b) => a + b.durationMin, 0);
  const lower = input.remainingMin * 0.85;
  const upper = input.remainingMin * 1.15;
  if (durationSum < lower || durationSum > upper) {
    return {
      ok: false,
      reason: `schedule 합 ${durationSum}분이 ${input.remainingMin}분의 85~115% 벗어남`,
    };
  }

  // 4) 마지막 블록 mode
  const last = output.schedule[output.schedule.length - 1];
  if (last.mode !== "review-mistakes" && last.mode !== "rest") {
    return {
      ok: false,
      reason: `마지막 schedule 블록 mode가 ${last.mode} — review-mistakes 또는 rest 필요`,
    };
  }

  // 5) topicName이 topics[].name 중 하나
  const topicNames = new Set(output.topics.map((t) => t.name));
  for (const b of output.schedule) {
    if (b.mode === "rest") continue;
    if (!topicNames.has(b.topicName)) {
      return {
        ok: false,
        reason: `schedule 블록 #${b.order}의 topicName "${b.topicName}"이 topics에 없음`,
      };
    }
  }

  return { ok: true };
}

function formatDuration(min: number): string {
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

async function logGeneration(opts: {
  ownerId: string;
  modelId: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
  cost?: number;
  status: "ok" | "rejected" | "error";
  errorMessage?: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const admin = getAdminSupabase();
  const { error } = await admin.from("generations").insert({
    owner_id: opts.ownerId,
    tool: "wizard-cram",
    model_id: opts.modelId,
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
    console.error("generations 기록 실패:", error.message);
  }
}
