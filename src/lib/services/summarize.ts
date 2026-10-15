import "server-only";
import {
  type Classification,
  classificationToContext,
  classifyMaterial,
} from "@/lib/classify-material";
import { estimateCost, generate, getModelVendor } from "@/lib/claude";
import { commitMaterialJobResult, type MaterialJobExecution } from "@/lib/data/material-job-result";
import { MAX_STYLES_PER_REQUEST, STYLE_LABEL, type SummaryStyle } from "@/lib/material-policy";
import { loadPrompt } from "@/lib/prompts";
import { SummarizeGenerationSchema, SummarizeOutput, type SummarizeOutputT } from "@/lib/schemas";
import { detectSubject, SUBJECT_LABEL } from "@/lib/subject-detector";
import { buildPlaybookSection } from "@/lib/subject-playbook";
import { sourcePages, splitSummarySource } from "@/lib/summary-chunks";
import { groundSummaryCitations } from "@/lib/summary-grounding";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { breakdown } from "@/lib/tokens";
import { auditSummary } from "./summary-audit";
import { restoreSummarySource } from "./summary-source";

/**
 * 요약 서비스 — 라우트(/api/summarize, /api/materials/[id]/summarize)에서 공유.
 *
 * 책임:
 *   - 메타 + 본문 → 분류기 → Sonnet/Haiku 호출 → Zod 검증 → materials 캐시 갱신 → generations 기록
 * 라우트의 책임:
 *   - 인증, 입력 파싱, 파일 업로드(파일 케이스), HTTP 응답 매핑
 *
 * 비용 가드:
 *   - maxTokens 16384 (사용자 피드백 "기존보다 더 풍부하게" — 단원·흐름이 다 보이려면 충분히 길어야 함)
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
      stage: "ai" | "validation" | "persistence";
      error: string;
      billed?: { usage: Awaited<ReturnType<typeof generate>>["usage"]; costUsd: number };
    };

export interface SummarizeInput {
  jobExecution?: MaterialJobExecution;
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
  /**
   * 의도 조정 한 줄 요청 (예: "예문은 영어 그대로", "비교표 많이").
   * styles(프리셋)와 분리 — 자유 텍스트 톤·형식 힌트.
   * 자료 안 강조 조정만 허용, 자료 밖 내용 생성은 프롬프트 가드가 거부. 120자 제한.
   */
  intentNote?: string;
  originalFile?: { storagePath: string; mimeType: string } | null;
}

const CHUNK_SIZE = 50_000;
const MAX_CHUNKS = 64;

export async function runSummarize(input: SummarizeInput): Promise<SummarizeResult> {
  if (input.originalFile) {
    try {
      const restored = await restoreSummarySource({ ...input, text: input.sanitizedText });
      if (restored)
        input = {
          ...input,
          fullText: restored.text,
          sanitizedText: restored.sanitizedText,
          pageCount: restored.pageCount ?? null,
          parserWarnings: [...input.parserWarnings, ...restored.warnings],
        };
    } catch {
      return {
        ok: false,
        stage: "validation",
        error:
          "기존 PDF의 전체 원문을 다시 읽지 못했어요. 원본을 다시 업로드해주세요. 기존 요약은 유지했어요.",
      };
    }
  }
  const chunks = splitSummarySource(input.sanitizedText, CHUNK_SIZE);
  if (chunks.length > MAX_CHUNKS) {
    return {
      ok: false,
      stage: "validation",
      error:
        "자료 전체를 처리할 수 있는 크기를 넘었어요. 단원별로 나눠 올려주세요. 일부만 잘라 요약하지 않았어요.",
    };
  }
  return chunks.length > 1 ? runSummarizeChunked(input, chunks) : runSummarizeSingle(input, true);
}

function withCoverage(
  summary: SummarizeOutputT,
  input: SummarizeInput,
  chunks: number,
): SummarizeOutputT {
  const pages = sourcePages(input.sanitizedText);
  const warnings = [...input.parserWarnings];
  if (input.pageCount && pages.length < input.pageCount) {
    warnings.push(
      `원문 ${input.pageCount}쪽 중 쪽수 표식을 확인한 범위는 ${pages.length}쪽이에요. 원본과 대조해 주세요.`,
    );
  }
  if (/\[unreadable/i.test(input.sanitizedText))
    warnings.push("읽히지 않은 부분이 있어요. 원본의 해당 쪽을 확인해 주세요.");
  return {
    ...summary,
    coverage: {
      processedChunks: chunks,
      totalChunks: chunks,
      inputCharacters: input.sanitizedText.length,
      sourcePages: pages,
      citedPages: [
        ...new Set(summary.blocks.flatMap((b) => (b.sourcePage ? [b.sourcePage] : []))),
      ].sort((a, b) => a - b),
      pageCount: input.pageCount,
      warnings,
    },
  };
}

async function runSummarizeSingle(
  input: SummarizeInput,
  persistCache: boolean,
  sharedClassification?: Classification | null,
  chunkContext = "",
): Promise<SummarizeResult> {
  const isMetadataOnly = !input.sanitizedText || input.sanitizedText.trim().length < 60;

  // 선택 자료 분류 — 본 호출과 별도로 실제 모델·비용을 기록한다.
  let classification: Classification | null = sharedClassification ?? null;
  if (!isMetadataOnly && sharedClassification === undefined) {
    classification = await classifyMaterial({
      ownerId: input.ownerId,
      materialId: input.materialId,
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
  const dynamicContext =
    chunkContext +
    buildDynamicContext({
      title: input.title,
      type: input.type,
      pageCount: input.pageCount ?? undefined,
      isMetadataOnly,
      parserWarnings: input.parserWarnings,
      classification,
      styles,
      subject,
      intentNote: input.intentNote,
      // wasTruncated 플래그는 chunk 경로에서만 의미 — 단일 호출 경로는 자료 전체가 들어감.
      wasTruncated: false,
      originalLength: input.sanitizedText.length,
    });
  const tokenBudget = breakdown({
    rule: rulePrompt,
    dynamic: dynamicContext,
    user: input.sanitizedText,
  });

  // 본 모델 호출 — 자료 전체가 CHUNK_SIZE 이하이므로 slice 없이 전체 전달.
  let result: Awaited<ReturnType<typeof generate>>;
  try {
    result = await generate({
      tool: "summarize",
      rulePrompt,
      responseSchema: SummarizeGenerationSchema,
      dynamicContext,
      userInput:
        input.sanitizedText.trim().length > 0
          ? input.sanitizedText
          : `[본문 자동 추출 실패 — 파일명 ${input.title} · 종류 ${input.type}]`,
      // Bound each region independently; reject truncated output before persistence.
      maxTokens: 16384,
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

  // Zod 검증 — 단일 호출 경로는 자료 전체가 들어가서 절단 없음.
  // 모델이 keywords 50개 초과·blocks 100개 초과로 뱉으면 zod가 throw. parseSummarizeWithCap이
  // 검증 전에 한도 안으로 안전 보정해서 검증 통과시킴. (실측 2026-05-31 prod: Haiku가
  // 강의 슬라이드 자료에서 keywords 50개 초과 뱉어 모든 chunk가 throw하던 버그.)
  let summary: SummarizeOutputT;
  try {
    if (result.finishReason === "length" || result.finishReason === "error")
      throw new Error("요약 출력이 끝까지 완성되지 않았어요.");
    summary = groundSummaryCitations(parseSummarizeWithCap(result.text), input.sanitizedText);
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
      error: "요약 형식이나 원문 인용을 확인하지 못했어요. 다시 시도해주세요.",
      billed: { usage: result.usage, costUsd: estimateCost(result.usage, result.modelId) },
    };
  }

  await logGeneration({
    ownerId: input.ownerId,
    materialId: input.materialId,
    modelId: result.modelId,
    usage: result.usage,
    cost: estimateCost(result.usage, result.modelId),
    status: "ok",
    payload: { summary },
  });

  let costUsd = estimateCost(result.usage, result.modelId);
  const combinedUsage = { ...result.usage };
  if (!isMetadataOnly) {
    let audit: Awaited<ReturnType<typeof auditSummary>>;
    try {
      audit = await auditSummary({
        summary,
        source: input.sanitizedText,
        intentNote: input.intentNote,
      });
    } catch {
      return {
        ok: false,
        stage: "validation",
        error: "요약 내용 검수를 완료하지 못했어요. 기존 요약을 유지했어요.",
        billed: { usage: combinedUsage, costUsd },
      };
    }
    await logGeneration({
      ownerId: input.ownerId,
      materialId: input.materialId,
      modelId: audit.modelId,
      tool: "summary-verify",
      usage: audit.usage,
      cost: audit.costUsd,
      status: audit.summary ? "ok" : "error",
    });
    costUsd += audit.costUsd;
    for (const key of Object.keys(combinedUsage) as Array<keyof typeof combinedUsage>)
      combinedUsage[key] += audit.usage[key];
    if (!audit.summary)
      return {
        ok: false,
        stage: "validation",
        error: audit.error,
        billed: { usage: combinedUsage, costUsd },
      };
    summary = audit.summary;
  }
  if (persistCache) summary = withCoverage(summary, input, 1);

  // materials 캐시 갱신 — owner_id 강제
  if (persistCache && !input.jobExecution) {
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
  }

  if (persistCache && input.jobExecution) {
    try {
      const stored = await commitMaterialJobResult({
        execution: input.jobExecution,
        ownerId: input.ownerId,
        materialId: input.materialId,
        modelId: result.modelId,
        usage: combinedUsage,
        costUsd,
        result: { summary },
      });
      if (!stored)
        return { ok: false, stage: "persistence", error: "이전 실행의 요약은 저장하지 않았어요." };
      summary = stored.summary as SummarizeOutputT;
    } catch (error) {
      return {
        ok: false,
        stage: "persistence",
        error: error instanceof Error ? error.message : "요약을 저장하지 못했어요.",
      };
    }
  }

  return {
    ok: true,
    summary,
    modelId: result.modelId,
    usage: combinedUsage,
    costUsd,
    tokenBudget,
  };
}

/**
 * 모델 raw 응답을 SummarizeOutput으로 검증하되, **검증 직전에 한도 초과 배열을 잘라낸다.**
 *
 * 왜 필요한가 (2026-05-31 prod 버그):
 *   - Haiku가 강의 슬라이드 자료를 요약할 때 keywords·blocks를 한도 초과로 뱉음.
 *   - zod가 throw → "요약 형식이 맞지 않았어요" 에러.
 *   - chunk 경로(MAX_CHUNKS=10)에서 모든 chunk가 같은 이유로 throw → partials.length === 0 → "요약 못 만듦".
 *
 * 해결: 검증 직전 한도(keywords 100·blocks 100·reviewSpots 8) 초과분을 잘라낸다.
 * 안의 다른 검증(타입·내용 길이)은 그대로 zod로.
 */
function parseSummarizeWithCap(raw: string): SummarizeOutputT {
  // 2026-05-31: 사용자 결정으로 cap 5배 — keywords 100→500, blocks 100→500.
  // Gemini 64K 출력 한도 안에서 충분히 담김. 합본·강의 슬라이드 자료가 길어도 안 잘림.
  const body = extractJsonBodyForCap(raw);
  const parsed = JSON.parse(body) as Record<string, unknown>;
  if (Array.isArray(parsed.keywords) && parsed.keywords.length > 500) {
    parsed.keywords = parsed.keywords.slice(0, 500);
  }
  if (Array.isArray(parsed.reviewSpots) && parsed.reviewSpots.length > 8) {
    parsed.reviewSpots = parsed.reviewSpots.slice(0, 8);
  }
  delete parsed.coverage;
  return SummarizeOutput.parse(parsed);
}

function extractJsonBodyForCap(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1].trim();
  const fencedOpen = trimmed.match(/```(?:json)?\s*([\s\S]*)$/i);
  if (fencedOpen) return fencedOpen[1].trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
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
  intentNote?: string;
  wasTruncated?: boolean;
  originalLength?: number;
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

  // 의도 조정 한 줄 요청 — 학생의 직접 요청. 시스템의 기본 톤 가이드보다 우선한다.
  // 단 자료 밖 사실 생성·출력 스키마 위반은 여전히 거부 (그건 진짜 가드).
  if (meta.intentNote?.trim()) {
    lines.push(
      "",
      "## ★ 학생의 직접 요청 — 최우선 (시스템 톤 가이드보다 우선)",
      `<user_intent>${meta.intentNote.trim()}</user_intent>`,
      "",
      "**적용 규칙:**",
      "- 이 요청은 학생이 직접 입력한 것이라 일반 톤·표기 가이드보다 **우선** 적용한다.",
      "  예: 시스템이 '원어 그대로'를 권장해도, 학생이 '한자→히라가나로 바꿔서', '영어 단어를 한국어로 풀어서', '쉬운 말로' 같은 표기·표현 변환을 요청하면 **반드시 그대로 따른다**.",
      "  이런 변환은 '자료 밖 생성'이 아니라 같은 내용의 표기/표현 바꿈이므로 허용된다.",
      "- 학생이 '특정 부분만 자세히', '비교표로', '예시 위주로' 같은 강조·형식 요청을 하면 그 방향으로 정리한다.",
      "",
      "**여전히 거부하는 것 (진짜 가드):**",
      "- 자료에 없는 사실·예시·정답을 만들라는 요청 (예: '여기 안 나온 기출 문제 알려줘', '저자 의도 추측해줘')",
      "- 출력 스키마 자체를 깨라는 요청 (예: 'JSON 말고 그냥 평문으로')",
      "- 모든 blocks의 sourceQuote는 여전히 자료 본문에서 인용해야 한다.",
    );
  }

  // 본문이 절단된 경우, 모델에게도 "앞부분만 받았다"고 알려서 leadSentence·blocks가
  // 자료 전체인 척하지 않게 함. UI 알림은 서비스 후처리에서 reviewSpots prepend.
  if (meta.wasTruncated && meta.originalLength) {
    const totalKchars = Math.round(meta.originalLength / 1000);
    lines.push(
      "",
      "## ⚠ 자료 절단",
      `이 자료는 총 약 ${totalKchars}K자인데 한 호출 한도(60K자)로 앞부분만 받았어요.`,
      `leadSentence·blocks를 '자료 전체'처럼 표현하지 마세요. '앞부분 기준' 또는 '여기까지 본 범위로' 같은 어조로.`,
      "뒷부분이 빠진 단원이나 챕터를 추측해서 채우지 마세요 — 받은 본문 안에서만.",
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

/** All chunks must succeed before replacing the previous summary. No thinning or tail truncation. */
async function runSummarizeChunked(
  input: SummarizeInput,
  chunks: string[],
): Promise<SummarizeResult> {
  const classification = await classifyMaterial({
    ownerId: input.ownerId,
    materialId: input.materialId,
    title: input.title,
    type: input.type,
    fullText: input.sanitizedText,
    pageCount: input.pageCount ?? undefined,
  });
  const outcomes: SummarizeResult[] = new Array(chunks.length);
  let next = 0;
  // Small bounded pool preserves order without serial latency for 100-page documents.
  await Promise.all(
    Array.from({ length: Math.min(3, chunks.length) }, async () => {
      while (next < chunks.length) {
        const i = next++;
        outcomes[i] = await runSummarizeSingle(
          { ...input, sanitizedText: chunks[i] },
          false,
          classification,
          `현재 입력은 전체 ${chunks.length}개 중 ${i + 1}번째 구간입니다. 다른 구간은 별도로 처리 후 합칩니다. 이 분할 때문에 자료가 누락되었다거나 다른 쪽을 받지 못했다는 안내를 blocks/reviewSpots에 쓰지 마세요. 이 구간의 학습 내용만 정리하세요.\n`,
        );
      }
    }),
  );
  const totalUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };
  let totalCost = 0;
  const partials: SummarizeOutputT[] = [];
  let lastModelId = "";
  for (const outcome of outcomes) {
    const billed = outcome.ok ? outcome : outcome.billed;
    if (billed) {
      for (const key of Object.keys(totalUsage) as Array<keyof typeof totalUsage>)
        totalUsage[key] += billed.usage[key];
      totalCost += billed.costUsd;
    }
    if (outcome.ok) {
      partials.push(outcome.summary);
      lastModelId = outcome.modelId;
    }
  }
  const failures = outcomes.flatMap((r, i) => (r.ok ? [] : [i + 1]));
  if (failures.length)
    return {
      ok: false,
      stage: "ai",
      error: `전체 ${chunks.length}개 구간 중 ${failures.join(", ")}번 구간을 완료하지 못했어요. 기존 요약을 유지했어요. 다시 시도해주세요.`,
      billed: { usage: totalUsage, costUsd: totalCost },
    };
  let merged = withCoverage(mergePartialSummaries(partials, chunks), input, chunks.length);
  const validated = SummarizeOutput.safeParse(merged);
  if (!validated.success)
    return {
      ok: false,
      stage: "validation",
      error: "전체 요약이 출력 한도를 넘었어요. 단원별로 나눠 다시 시도해주세요.",
      billed: { usage: totalUsage, costUsd: totalCost },
    };

  // materials cache 갱신 — 단일 호출 경로와 동일.
  if (input.jobExecution) {
    try {
      const stored = await commitMaterialJobResult({
        execution: input.jobExecution,
        ownerId: input.ownerId,
        materialId: input.materialId,
        modelId: lastModelId,
        usage: totalUsage,
        costUsd: totalCost,
        result: { summary: merged },
      });
      if (!stored)
        return { ok: false, stage: "persistence", error: "이전 실행의 요약은 저장하지 않았어요." };
      merged = stored.summary as SummarizeOutputT;
    } catch (error) {
      return {
        ok: false,
        stage: "persistence",
        error: error instanceof Error ? error.message : "요약을 저장하지 못했어요.",
      };
    }
  } else {
    const admin = getAdminSupabase();
    const update = await admin
      .from("materials")
      .update({
        summary_payload: merged,
        summary_keywords: merged.keywords ?? null,
        summary_model_id: lastModelId,
        last_summarized_at: new Date().toISOString(),
      })
      .eq("id", input.materialId)
      .eq("owner_id", input.ownerId);
    if (update.error) {
      console.warn("materials.summary 캐시 갱신 실패 (chunked):", update.error.message);
    }
  }

  // Each actual chunk call was metered by runSummarizeSingle. Merging is local:
  // logging the aggregate as another generation would charge the same usage twice.

  return {
    ok: true,
    summary: merged,
    modelId: lastModelId,
    usage: totalUsage,
    costUsd: totalCost,
    tokenBudget: breakdown({
      rule: "",
      dynamic: "",
      user: input.sanitizedText,
    }),
  };
}

function mergePartialSummaries(partials: SummarizeOutputT[], chunks: string[]): SummarizeOutputT {
  const blocks: SummarizeOutputT["blocks"] = [];
  partials.forEach((part, i) => {
    const pages = sourcePages(chunks[i]);
    blocks.push({
      type: "h2",
      content: pages.length
        ? `${pages[0]}–${pages.at(-1)}쪽 정리`
        : `부분 ${i + 1}/${chunks.length}`,
    });
    blocks.push(...part.blocks);
  });
  const reviews = new Map(partials.flatMap((p) => p.reviewSpots).map((s) => [s.title, s]));
  return {
    leadSentence: `자료 전체 ${chunks.length}개 구간을 순서대로 정리했어요. 아래 각 구간에서 핵심 내용과 출처를 확인하세요.`,
    blocks,
    keywords: [...new Set(partials.flatMap((p) => p.keywords))].slice(0, 500),
    reviewSpots: [...reviews.values()].slice(0, 8),
    watermark: partials[0].watermark,
  };
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
  tool?: "summarize" | "summary-verify";
}): Promise<void> {
  const admin = getAdminSupabase();
  const { error } = await admin.from("generations").insert({
    owner_id: opts.ownerId,
    material_id: opts.materialId,
    tool: opts.tool ?? "summarize",
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
    console.error("generations 기록 실패:", error.message);
  }
}
