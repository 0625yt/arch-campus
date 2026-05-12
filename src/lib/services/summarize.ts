import "server-only";
import { generate, estimateCost } from "@/lib/claude";
import { classifyMaterial, classificationToContext, type Classification } from "@/lib/classify-material";
import { loadPrompt } from "@/lib/prompts";
import { parseModelJson, SummarizeOutput, type SummarizeOutputT } from "@/lib/schemas";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { breakdown } from "@/lib/tokens";

/**
 * 요약 서비스 — 라우트(/api/summarize, /api/materials/[id]/summarize)에서 공유.
 *
 * 책임:
 *   - 메타 + 본문 → 분류기 → Sonnet/Haiku 호출 → Zod 검증 → materials 캐시 갱신 → generations 기록
 * 라우트의 책임:
 *   - 인증, 입력 파싱, 파일 업로드(파일 케이스), HTTP 응답 매핑
 *
 * 비용 가드:
 *   - maxTokens 6144 (skills-v2 풍부도 보강 — blocks 최대 40개·sourceQuote 인용 포함)
 *   - 분류기는 본문 60자 이상일 때만 호출 (메타만이면 스킵)
 *   - 같은 자료에 대해 강제 재요약은 호출자가 결정 (idempotency 안 함)
 */

export type SummarizeResult =
  | {
      ok: true;
      summary: SummarizeOutputT;
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
      stage: "ai" | "validation";
      error: string;
    };

export interface SummarizeInput {
  ownerId: string;
  materialId: string;
  title: string;
  type: string;
  fullText: string;
  sanitizedText: string;
  pageCount: number | null;
  parserWarnings: string[];
}

export async function runSummarize(input: SummarizeInput): Promise<SummarizeResult> {
  const isMetadataOnly = !input.sanitizedText || input.sanitizedText.trim().length < 60;

  // 분류 — Haiku로 어떤 도메인인지
  let classification: Classification | null = null;
  if (!isMetadataOnly) {
    classification = await classifyMaterial({
      title: input.title,
      type: input.type,
      fullText: input.sanitizedText,
      pageCount: input.pageCount ?? undefined,
    });
  }

  // 룰 + 동적 컨텍스트
  const rulePrompt = loadPrompt("summarize");
  const dynamicContext = buildDynamicContext({
    title: input.title,
    type: input.type,
    pageCount: input.pageCount ?? undefined,
    isMetadataOnly,
    parserWarnings: input.parserWarnings,
    classification,
  });
  const tokenBudget = breakdown({
    rule: rulePrompt,
    dynamic: dynamicContext,
    user: input.sanitizedText,
  });

  // 본 모델 호출
  let result: Awaited<ReturnType<typeof generate>>;
  try {
    result = await generate({
      tool: "summarize",
      rulePrompt,
      dynamicContext,
      userInput:
        input.sanitizedText.trim().length > 0
          ? input.sanitizedText.slice(0, 60_000)
          : `[본문 자동 추출 실패 — 파일명 ${input.title} · 종류 ${input.type}]`,
      maxTokens: 6144,
      temperature: 0.3,
    });
  } catch (e) {
    await logGeneration({
      ownerId: input.ownerId,
      materialId: input.materialId,
      modelId: "claude-haiku-4-5",
      status: "error",
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, stage: "ai", error: "AI 호출 실패" };
  }

  // Zod 검증
  let summary: SummarizeOutputT;
  try {
    summary = parseModelJson(SummarizeOutput, result.text);
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
    return {
      ok: false,
      stage: "validation",
      error: "AI 출력이 형식에 안 맞아요. 다시 시도해주세요.",
    };
  }

  // materials 캐시 갱신 — owner_id 강제
  const admin = getAdminSupabase();
  const update = await admin
    .from("materials")
    .update({
      summary_payload: summary,
      summary_keywords: summary.keywords ?? null,
      summary_model_id: result.modelId,
      last_summarized_at: new Date().toISOString(),
    })
    .eq("id", input.materialId)
    .eq("owner_id", input.ownerId);
  if (update.error) {
    console.warn("materials.summary 캐시 갱신 실패:", update.error.message);
  }

  const costUsd = estimateCost(result.usage, result.modelId);
  await logGeneration({
    ownerId: input.ownerId,
    materialId: input.materialId,
    modelId: result.modelId,
    usage: result.usage,
    cost: costUsd,
    status: "ok",
    payload: { summary },
  });

  return {
    ok: true,
    summary,
    modelId: result.modelId,
    usage: result.usage,
    costUsd,
    tokenBudget,
  };
}

function buildDynamicContext(meta: {
  title: string;
  type: string;
  pageCount?: number;
  isMetadataOnly?: boolean;
  parserWarnings?: string[];
  classification?: Classification | null;
}): string {
  const lines: string[] = [`자료 메타:`, `- 제목: ${meta.title}`, `- 종류: ${meta.type}`];
  if (meta.pageCount) lines.push(`- 분량: ${meta.pageCount}쪽`);
  if (meta.parserWarnings?.length) {
    lines.push(`- 파서 경고: ${meta.parserWarnings.join(", ")}`);
  }
  if (meta.classification) {
    lines.push("", classificationToContext(meta.classification));
  }
  if (meta.isMetadataOnly) {
    lines.push(
      "",
      "⚠ 본문 텍스트가 충분하지 않아요. 그래도 거절하지 말고:",
      "- leadSentence: 어떤 자료인지 메타로 한 줄 (예: '운영체제 5장 강의자료예요. 본문 추출이 안 돼서 정확한 요약은 어려워요.')",
      "- blocks: 자료 종류·제목 기준으로 학생이 다음에 할 수 있는 행동 가이드",
      "- keywords: 제목·종류에서 뽑힌 일반 용어 3~5개",
      "- reviewSpots: '본문이 더 명확한 자료를 다시 올려주세요' 같은 안내 1개",
      "본문 substring 인용 규칙은 이번엔 적용 안 함 (substring 없으니까).",
    );
  }
  return lines.join("\n");
}

async function logGeneration(opts: {
  ownerId: string;
  materialId: string;
  modelId: string;
  usage?: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number };
  cost?: number;
  status: "ok" | "rejected" | "error";
  errorMessage?: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const admin = getAdminSupabase();
  const { error } = await admin.from("generations").insert({
    owner_id: opts.ownerId,
    material_id: opts.materialId,
    tool: "summarize",
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
