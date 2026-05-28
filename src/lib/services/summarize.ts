import "server-only";
import { generate, estimateCost } from "@/lib/claude";
import {
  classifyMaterial,
  classificationToContext,
  type Classification,
} from "@/lib/classify-material";
import { type SummaryStyle, STYLE_LABEL, MAX_STYLES_PER_REQUEST } from "@/lib/material-policy";
import { loadPrompt } from "@/lib/prompts";
import { parseModelJson, SummarizeOutput, type SummarizeOutputT } from "@/lib/schemas";
import { detectSubject, SUBJECT_LABEL } from "@/lib/subject-detector";
import { buildPlaybookSection } from "@/lib/subject-playbook";
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
  /**
   * 요청된 요약 스타일 (C 단계, 사용자가 picker로 선택).
   * 미지정·빈 배열이면 일반 요약 (기존 동작).
   * 다중 선택 시 한 호출 안에서 모두 반영 (비용 통제).
   */
  styles?: SummaryStyle[];
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
  // 스타일 4개 max — 라우트에서도 cap, 서비스에서도 한 번 더 (이중 방어)
  const styles = (input.styles ?? []).slice(0, MAX_STYLES_PER_REQUEST);
  // 과목 영역 추론 — classification.domain > 자료 제목 토큰 매칭 순
  const subject = detectSubject({
    classificationDomain: classification?.domain ?? null,
    materialTitle: input.title,
  });
  const dynamicContext = buildDynamicContext({
    title: input.title,
    type: input.type,
    pageCount: input.pageCount ?? undefined,
    isMetadataOnly,
    parserWarnings: input.parserWarnings,
    classification,
    styles,
    subject,
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
      // generate()가 throw해 modelId를 알 수 없음 → sentinel. 라우팅이 바뀌면 잘못된 모델로 기록될 위험 회피.
      modelId: "unknown",
      status: "error",
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    return {
      ok: false,
      stage: "ai",
      error: "자료를 정리하지 못했어요. 잠시 후 다시 시도해주세요.",
    };
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
      error: "요약 형식이 맞지 않았어요. 다시 시도해주세요.",
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
  styles?: SummaryStyle[];
  subject?: ReturnType<typeof detectSubject>;
}): string {
  const lines: string[] = [`자료 메타:`, `- 제목: ${meta.title}`, `- 종류: ${meta.type}`];
  if (meta.pageCount) lines.push(`- 분량: ${meta.pageCount}쪽`);
  if (meta.parserWarnings?.length) {
    lines.push(`- 파서 경고: ${meta.parserWarnings.join(", ")}`);
  }
  if (meta.classification) {
    lines.push("", classificationToContext(meta.classification));
  }

  // 과목별 디테일 — 어학·수학·CS 등 영역마다 시험에서 진짜 원하는 게 다름.
  // playbook은 "영역 + 도구" 조합으로 미리 작성된 1차 가이드.
  if (meta.subject && meta.subject !== "default") {
    const section = buildPlaybookSection(meta.subject, "summarize");
    if (section) {
      lines.push("", `(영역: ${SUBJECT_LABEL[meta.subject]})`, section);
    }
  }

  // 요청된 요약 스타일 — 한 호출 안에서 모두 반영. 섹션으로 나눠 출력.
  // 스타일별 출력 가이드는 src/prompts/summarize.md의 "## 요청된 스타일 분기" 섹션이 처리.
  if (meta.styles && meta.styles.length > 0) {
    const labelList = meta.styles.map((s) => STYLE_LABEL[s]).join(", ");
    lines.push(
      "",
      "## 요청된 요약 스타일",
      `학생이 선택한 스타일: **${labelList}**`,
      "각 스타일을 blocks 안에서 h2 섹션으로 나눠 모두 반영. 한 스타일이 다른 스타일을 잠식하지 않게 골고루.",
      "스타일별 출력 규칙은 시스템 프롬프트의 '요청된 스타일 분기' 섹션을 따른다.",
    );
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
