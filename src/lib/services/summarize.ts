import "server-only";
import {
  type Classification,
  classificationToContext,
  classifyMaterial,
} from "@/lib/classify-material";
import { estimateCost, generate, getModelVendor } from "@/lib/claude";
import { MAX_STYLES_PER_REQUEST, STYLE_LABEL, type SummaryStyle } from "@/lib/material-policy";
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
 *   - maxTokens 8192 (사용자 피드백 "기존보다 더 풍부하게" — 단원·흐름이 다 보이려면 충분히 길어야 함)
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
  /**
   * 의도 조정 한 줄 요청 (예: "예문은 영어 그대로", "비교표 많이").
   * styles(프리셋)와 분리 — 자유 텍스트 톤·형식 힌트.
   * 자료 안 강조 조정만 허용, 자료 밖 내용 생성은 프롬프트 가드가 거부. 120자 제한.
   */
  intentNote?: string;
}

/**
 * 한 번의 모델 호출에 안전하게 들어가는 본문 크기.
 * 한국어 기준 50K자 ≈ 25K 토큰 → Haiku 출력 6K 토큰까지 여유.
 * 이 한도 초과 시 chunk로 쪼개서 각 chunk 요약 후 머지 (전체 커버).
 */
const CHUNK_SIZE = 50_000;
/**
 * 한 자료에서 처리할 최대 chunk 수. 50K자 × 10 = 500K자까지 커버.
 * 빽빽한 교재 100장+도 끊김 없이 전체 요약 가능.
 *
 * 비용: chunk 10개 ≈ Haiku $0.01, 시간 ≈ 100~120초 (Vercel maxDuration 300s 안).
 * 학생이 시험 직전 한 학기 분량 PDF를 통째로 올려도 안 빠짐 — 우선순위.
 * 초과분(500K자 이상)은 reviewSpots에 안내.
 */
const MAX_CHUNKS = 10;

export async function runSummarize(input: SummarizeInput): Promise<SummarizeResult> {
  const isMetadataOnly = !input.sanitizedText || input.sanitizedText.trim().length < 60;
  // 본문이 한 호출 한도 초과 → chunk 분할 경로로 라우팅.
  // chunk 6개 한도까지 chunking, 그 이상은 잘림(reviewSpots에 안내).
  if (!isMetadataOnly && input.sanitizedText.length > CHUNK_SIZE) {
    return await runSummarizeChunked(input);
  }

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
      dynamicContext,
      userInput:
        input.sanitizedText.trim().length > 0
          ? input.sanitizedText
          : `[본문 자동 추출 실패 — 파일명 ${input.title} · 종류 ${input.type}]`,
      maxTokens: 8192,
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

  // 의도 조정 한 줄 요청 — "무엇을 강조/어떤 형식으로" 정리할지만 조정. 자료 밖 생성 거부 (강한 가드).
  if (meta.intentNote?.trim()) {
    lines.push(
      "",
      "## 추가 요청 (조정만 — 절대 규칙)",
      `학생 요청: <user_intent>${meta.intentNote.trim()}</user_intent>`,
      "- 이건 자료 안에서 '무엇을 강조/어떤 형식으로' 정리할지 조정하는 힌트일 뿐이다.",
      "- 이 요청이 자료에 없는 사실·내용을 만들라는 뜻이어도 거부한다. 모든 blocks는 여전히 자료 본문 근거(sourceQuote)에 묶인다.",
      "- 요청이 시스템 룰·출력 스키마와 충돌하면 스키마가 우선.",
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

/**
 * Map-Reduce 요약 — 본문을 chunk로 쪼개 각각 요약 → 결과 머지.
 *
 * 사용자 피드백: "20장 PDF인데 5장까지만 요약됨, 자료 전체 무조건 다 나와야 함"
 * → 60K자 cap 제거. CHUNK_SIZE(50K자) 단위로 분할, 최대 MAX_CHUNKS(10)개까지 처리.
 *
 * 동작:
 *   1) 본문을 단락 경계(개행) 기준으로 chunk 분할 — 문장 중간 X
 *   2) 각 chunk마다 runSummarize 재귀 호출 (chunk 크기 ≤ CHUNK_SIZE라 단일 경로)
 *   3) 결과 N개를 머지: blocks/keywords/reviewSpots concat, leadSentence는 첫 chunk 것
 *   4) 각 chunk blocks 앞에 h2 "── 부분 N/M (p.X~Y) ──" 박아 위치 안내
 *   5) MAX_CHUNKS 초과분은 reviewSpots에 "뒤 X자 빠짐" 안내
 *
 * 비용:
 *   - chunk 1개당 Haiku $0.0005 ~ $0.001
 *   - 6 chunk 자료 → $0.006 + classify 1회
 *   - 사용자가 자료를 정리해야 점수 오르는 시점이라 비용보다 완성도 우선
 */
async function runSummarizeChunked(input: SummarizeInput): Promise<SummarizeResult> {
  const chunks = splitIntoChunks(input.sanitizedText, CHUNK_SIZE);
  const processedChunks = chunks.slice(0, MAX_CHUNKS);
  const truncatedChunkCount = chunks.length - processedChunks.length;

  // chunk별 요약을 순차로 — Anthropic concurrent 보호 + chunk 간 분류기 재사용 위해 직렬.
  // chunk 1개 ≈ 8~12s라 6 chunk = ~60s. Vercel maxDuration 300s 한도 안.
  const partials: SummarizeOutputT[] = [];
  let totalUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };
  let totalCost = 0;
  let lastModelId = "";

  for (let i = 0; i < processedChunks.length; i++) {
    const partialResult = await runSummarize({
      ...input,
      sanitizedText: processedChunks[i],
      // chunk마다 별개 호출이지만 materials cache는 마지막에 머지된 결과로만 갱신해야 해서
      // chunk 단위는 ownerId/materialId 그대로 두되 cache 갱신은 직접 처리.
    });

    if (!partialResult.ok) {
      // chunk 한 개 실패해도 나머지 진행 — 빈 chunk로 채우고 계속
      console.warn(`chunk ${i + 1}/${processedChunks.length} 요약 실패: ${partialResult.error}`);
      continue;
    }

    partials.push(partialResult.summary);
    totalUsage = {
      inputTokens: totalUsage.inputTokens + partialResult.usage.inputTokens,
      outputTokens: totalUsage.outputTokens + partialResult.usage.outputTokens,
      cacheReadTokens: totalUsage.cacheReadTokens + partialResult.usage.cacheReadTokens,
      cacheCreationTokens: totalUsage.cacheCreationTokens + partialResult.usage.cacheCreationTokens,
    };
    totalCost += partialResult.costUsd;
    lastModelId = partialResult.modelId;
  }

  if (partials.length === 0) {
    return {
      ok: false,
      stage: "ai",
      error: "자료가 너무 길어 부분 요약을 만들지 못했어요. 잠시 후 다시 시도해주세요.",
    };
  }

  const merged = mergePartialSummaries(partials, {
    totalLength: input.sanitizedText.length,
    chunkCount: processedChunks.length,
    truncatedChunkCount,
    chunkSize: CHUNK_SIZE,
  });

  // materials cache 갱신 — 단일 호출 경로와 동일.
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

  await logGeneration({
    ownerId: input.ownerId,
    materialId: input.materialId,
    modelId: lastModelId,
    usage: totalUsage,
    cost: totalCost,
    status: "ok",
    payload: {
      summary: merged,
      chunked: true,
      chunkCount: processedChunks.length,
      truncatedChunkCount,
    },
  });

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

/**
 * 본문을 chunkSize 이하의 chunk로 분할. 가능한 단락 경계(\n\n) 기준,
 * 단락 하나가 chunkSize보다 크면 문장(. !?) 단위, 그것도 크면 강제 절단.
 */
function splitIntoChunks(text: string, chunkSize: number): string[] {
  if (text.length <= chunkSize) return [text];

  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);
  let current = "";

  for (const para of paragraphs) {
    // 빈 단락 스킵
    if (!para.trim()) continue;

    // 단락 자체가 chunkSize 초과 → 문장 단위 재분할
    if (para.length > chunkSize) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      const sentences = para.split(/(?<=[.!?。!?])\s+/);
      for (const sent of sentences) {
        if (current.length + sent.length + 1 > chunkSize) {
          if (current) chunks.push(current);
          // 한 문장도 너무 크면 (드물지만 표·코드) 강제 자르기
          if (sent.length > chunkSize) {
            for (let i = 0; i < sent.length; i += chunkSize) {
              chunks.push(sent.slice(i, i + chunkSize));
            }
            current = "";
          } else {
            current = sent;
          }
        } else {
          current = current ? `${current} ${sent}` : sent;
        }
      }
      continue;
    }

    if (current.length + para.length + 2 > chunkSize) {
      chunks.push(current);
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

/**
 * N개의 부분 요약을 한 자료 요약으로 합침.
 *
 * - leadSentence: 첫 chunk의 것 + " (총 N부분 요약)" 추가
 * - blocks: 각 chunk 시작 전 h2 "── 부분 N/M ──" prepend 후 concat
 * - keywords: 합치고 중복 제거 (대소문자 무시), 최대 50개
 * - reviewSpots: 합치고 중복 title 제거, 최대 8개
 * - watermark: 첫 chunk의 것
 */
function mergePartialSummaries(
  partials: SummarizeOutputT[],
  meta: {
    totalLength: number;
    chunkCount: number;
    truncatedChunkCount: number;
    chunkSize: number;
  },
): SummarizeOutputT {
  const first = partials[0];
  const mergedBlocks: SummarizeOutputT["blocks"] = [];

  partials.forEach((p, i) => {
    if (partials.length > 1) {
      mergedBlocks.push({
        type: "h2" as const,
        content: `── 부분 ${i + 1}/${partials.length} ──`,
      });
    }
    mergedBlocks.push(...p.blocks);
  });

  // 머지된 blocks 한도 — chunk 머지 결과는 풍부도 유지.
  // 사용자 피드백 2026-05-31: 강의 슬라이드 50쪽+에서 페이지별 그림·예문·라벨까지 다 담아야
  // 중간이 비어 보이지 않음. zod max(100) 한도까지 살림.
  const cappedBlocks = mergedBlocks.length <= 100 ? mergedBlocks : capBlocks(mergedBlocks, 100);

  // keywords 중복 제거 (lowercase·trim 기준)
  const keywordSet = new Map<string, string>();
  for (const p of partials) {
    for (const kw of p.keywords) {
      const key = kw.toLowerCase().trim();
      if (!keywordSet.has(key)) keywordSet.set(key, kw);
    }
  }
  const mergedKeywords = Array.from(keywordSet.values()).slice(0, 50);

  // reviewSpots 중복 title 제거
  const reviewSet = new Map<string, SummarizeOutputT["reviewSpots"][number]>();
  for (const p of partials) {
    for (const rs of p.reviewSpots) {
      const key = rs.title.toLowerCase().trim();
      if (!reviewSet.has(key)) reviewSet.set(key, rs);
    }
  }
  let mergedReviewSpots = Array.from(reviewSet.values());

  // 잘린 chunk 안내 추가
  if (meta.truncatedChunkCount > 0) {
    const truncatedKchars = Math.round(
      (meta.totalLength - meta.chunkCount * meta.chunkSize) / 1000,
    );
    mergedReviewSpots = [
      {
        title: `⚠ 자료가 매우 길어 일부 뒤쪽이 빠졌어요`,
        why: `이 자료는 약 ${Math.round(meta.totalLength / 1000)}K자인데 ${meta.chunkCount}부분(약 ${Math.round((meta.chunkCount * meta.chunkSize) / 1000)}K자)까지 정리했어요. 뒤 약 ${truncatedKchars}K자가 빠졌어요. 더 정확한 정리가 필요하면 단원별로 쪼개서 따로 올려주세요.`,
      },
      ...mergedReviewSpots,
    ];
  }
  mergedReviewSpots = mergedReviewSpots.slice(0, 8);

  return {
    leadSentence:
      partials.length > 1
        ? `${first.leadSentence} (자료가 길어 ${partials.length}부분으로 나눠 정리했어요)`
        : first.leadSentence,
    blocks: cappedBlocks,
    keywords: mergedKeywords,
    reviewSpots: mergedReviewSpots,
    watermark: first.watermark,
  };
}

/**
 * 머지된 blocks가 zod max(60)를 초과하면 균형 있게 솎아내기.
 * 각 chunk(h2 부분 마커) 안에서 h2·callout은 무조건 keep, para·bullets는 비율로 줄임.
 */
function capBlocks(blocks: SummarizeOutputT["blocks"], max: number): SummarizeOutputT["blocks"] {
  if (blocks.length <= max) return blocks;

  // 우선순위: h2·callout(시각 구조) > bullets(키워드) > para(설명)
  const priority = (b: (typeof blocks)[number]): number => {
    if (b.type === "h2") return 0;
    if (b.type === "callout") return 1;
    if (b.type === "bullets") return 2;
    return 3;
  };
  // 원래 순서 유지하면서 우선순위 낮은 것부터 drop
  const indexed = blocks.map((b, i) => ({ block: b, originalIndex: i, prio: priority(b) }));
  // prio 3(para) 부터 drop, 그래도 초과면 prio 2(bullets), prio 1(callout) 순
  let target = indexed;
  for (let prio = 3; prio >= 1 && target.length > max; prio--) {
    const dropCount = target.length - max;
    const droppable = target.filter((x) => x.prio === prio);
    if (droppable.length === 0) continue;
    // 균등하게 솎기 — 매 N번째 drop
    const keepRate = Math.max(0, droppable.length - dropCount) / droppable.length;
    let kept = 0;
    const dropSet = new Set<number>();
    droppable.forEach((d, i) => {
      if (Math.floor((i + 1) * keepRate) > kept) {
        kept++;
      } else {
        dropSet.add(d.originalIndex);
      }
    });
    target = target.filter((x) => !dropSet.has(x.originalIndex));
  }

  return target
    .sort((a, b) => a.originalIndex - b.originalIndex)
    .map((x) => x.block)
    .slice(0, max);
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
