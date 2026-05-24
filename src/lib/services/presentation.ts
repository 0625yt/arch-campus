import "server-only";
import { estimateCost, generate } from "@/lib/claude";
import { loadPrompt } from "@/lib/prompts";
import {
  evidenceMatches,
  parseModelJson,
  PresentationOutput,
  type PresentationOutputT,
} from "@/lib/schemas";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { breakdown } from "@/lib/tokens";

/**
 * 발표 위저드 서비스 — `/api/wizards/presentation`에서 호출.
 *
 * 사활:
 *   - 슬라이드 본문 풀텍스트가 절대 안 나와야 함 (CLAUDE.md §4 — "리포트 본문 X"와 같은 라인).
 *     structure[] 각 항목은 길이 가드(zod max 160)로 1차 차단되지만,
 *     사후에도 "한 슬라이드의 structure 한 항목이 평균 단어보다 길지 않은지" 보수적 검증.
 *   - 자료를 주면 outline.structure[]·qaBank.answerHint에 자료 본문 substring이 인용돼야 함.
 *     인용이 substring 매칭 안 되면 환각이므로 reject.
 *   - estimatedSec 합계가 duration*60 ±15%.
 *
 * 모델: Sonnet 4.6 (TOOL_MODEL.presentation — claude.ts).
 *   학기당 발표는 학생당 2~5회 정도라 비싸도 OK. 결과 품질이 학생 만족의 사활.
 */

export interface PresentationMaterialInput {
  id: string;
  title: string;
  pages?: number | null;
  fullText: string;
}

export type PresentationAudience = "교수님" | "동기" | "신입생" | "외부";
export type PresentationGoal = "이해" | "설득" | "공유" | "토론 유도";

export interface PresentationInput {
  ownerId: string;
  topic: string;
  audience: PresentationAudience;
  durationMin: 5 | 10 | 15 | 20;
  goal: PresentationGoal;
  /** 평가 기준·제약 (예: "실제 사례 30%, 슬라이드 8장 이내") */
  constraints?: string;
  /** 자료 없으면 빈 배열 — 그래도 outline은 만들지만 자료 인용 X */
  materials: PresentationMaterialInput[];
}

export type PresentationResult =
  | {
      ok: true;
      output: PresentationOutputT;
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

export async function runPresentation(
  input: PresentationInput,
): Promise<PresentationResult> {
  // 입력 가드
  if (!input.topic.trim()) {
    return { ok: false, stage: "input", error: "발표 주제가 비어 있어요." };
  }
  if (![5, 10, 15, 20].includes(input.durationMin)) {
    return { ok: false, stage: "input", error: "발표 시간은 5·10·15·20분 중 하나여야 해요." };
  }

  const rulePrompt = loadPrompt("presentation");
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
      tool: "presentation",
      rulePrompt,
      dynamicContext,
      userInput,
      maxTokens: 4096,
      temperature: 0.5,
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

  let output: PresentationOutputT;
  try {
    output = parseModelJson(PresentationOutput, result.text);
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
    payload: {
      topic: input.topic,
      audience: input.audience,
      durationMin: input.durationMin,
      output,
    },
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

function buildDynamicContext(input: PresentationInput): string {
  const lines: string[] = [
    `발표 정보:`,
    `- 주제: ${input.topic}`,
    `- 청중: ${input.audience}`,
    `- 발표 시간: ${input.durationMin}분 (= ${input.durationMin * 60}초)`,
    `- 목적: ${input.goal}`,
  ];
  if (input.constraints && input.constraints.trim()) {
    lines.push(`- 제약·평가 기준: ${input.constraints.trim().slice(0, 400)}`);
  }

  // 슬라이드 수 가이드 — 프롬프트 §정량 가드레일과 일치
  const slideHint = slideCountFor(input.durationMin);
  lines.push(
    "",
    `슬라이드 수 가이드: ${slideHint.min}~${slideHint.max}장 (estimatedSec 합 = ${input.durationMin * 60}초 ±15%).`,
  );

  if (input.materials.length === 0) {
    lines.push(
      "",
      `참고 자료 없음 — outline.structure[] 항목은 학생이 채워 넣을 자리 표시로 (예: "X 정의 — 본인 노트에서 1줄로"). qaBank.answerHint도 "본인 자료에서 ~" 식 일반화.`,
    );
  } else {
    lines.push("", `참고 자료 ${input.materials.length}건:`);
    for (const m of input.materials) {
      lines.push(`- id=${m.id} · ${m.title}${m.pages ? ` (${m.pages}쪽)` : ""}`);
    }
    lines.push(
      "",
      `자료 본문은 다음 user_input에 포함. outline.structure[]·qaBank.answerHint에 자료 인용 시 substring으로 정확히 일치해야 함.`,
    );
  }

  return lines.join("\n");
}

function buildUserInput(input: PresentationInput): string {
  if (input.materials.length === 0) {
    return `(참고 자료 없음 — 주제·청중·목적만으로 구조를 잡아주세요)`;
  }
  // 자료당 6천자 컷 — exam-cram은 8천자지만 발표는 1건이 보통이라 좀 더 줄임
  const blocks = input.materials.map((m) => {
    const text = (m.fullText || "").slice(0, 6000);
    return `=== 자료 id=${m.id} (${m.title}) ===\n${text}`;
  });
  return blocks.join("\n\n");
}

function slideCountFor(durationMin: number): { min: number; max: number } {
  if (durationMin <= 5) return { min: 4, max: 5 };
  if (durationMin <= 10) return { min: 6, max: 8 };
  return { min: 8, max: 12 };
}

function validateOutput(
  output: PresentationOutputT,
  input: PresentationInput,
): { ok: true } | { ok: false; reason: string } {
  // 1) 슬라이드 수가 시간에 맞나
  const slideHint = slideCountFor(input.durationMin);
  if (output.outline.length < slideHint.min || output.outline.length > slideHint.max) {
    return {
      ok: false,
      reason: `${input.durationMin}분 발표는 ${slideHint.min}~${slideHint.max}장이 적정인데 ${output.outline.length}장이 나왔어요`,
    };
  }

  // 2) estimatedSec 합계가 duration * 60 의 ±20%
  //    엄밀히 맞추기보다 학생이 실제 발표할 때의 여유 — Q&A·인사·전환 시간 포함.
  const totalSec = output.outline.reduce((a, s) => a + s.estimatedSec, 0);
  const target = input.durationMin * 60;
  const lower = target * 0.8;
  const upper = target * 1.2;
  if (totalSec < lower || totalSec > upper) {
    return {
      ok: false,
      reason: `슬라이드 시간 합 ${totalSec}초가 ${target}초의 80~120% 범위를 벗어났어요`,
    };
  }

  // 3) slideNo가 1..N 연속
  for (let i = 0; i < output.outline.length; i++) {
    if (output.outline[i].slideNo !== i + 1) {
      return {
        ok: false,
        reason: `slideNo가 1부터 ${output.outline.length}까지 순서대로 안 박힘 (#${i + 1}번이 ${output.outline[i].slideNo})`,
      };
    }
  }

  // 4) purpose 다양성 — 4장 이상이면 unique purpose가 절반 이상
  if (output.outline.length >= 4) {
    const uniquePurpose = new Set(output.outline.map((s) => s.purpose.trim().slice(0, 16))).size;
    if (uniquePurpose < Math.ceil(output.outline.length / 2)) {
      return {
        ok: false,
        reason: `슬라이드 purpose가 너무 비슷해요 (unique ${uniquePurpose}/${output.outline.length})`,
      };
    }
  }

  // 5) speakerNote 다양성 — 4장 이상이면 첫 12자 unique가 절반 이상
  if (output.outline.length >= 4) {
    const uniqueNote = new Set(output.outline.map((s) => s.speakerNote.trim().slice(0, 12))).size;
    if (uniqueNote < Math.ceil(output.outline.length / 2)) {
      return {
        ok: false,
        reason: `speakerNote가 너무 비슷해요 (unique ${uniqueNote}/${output.outline.length})`,
      };
    }
  }

  // 6) 자료 있으면 인용 substring 매칭
  if (input.materials.length > 0) {
    const corpus = input.materials.map((m) => m.fullText || "").join("\n");
    // 인용 표기는 자유 형태라 강제 X. 다만 "자료 N쪽" 같은 인용이 있는 슬라이드는 그 단어가
    // corpus에 substring으로 매칭되어야 환각 방지.
    for (const slide of output.outline) {
      for (const line of slide.structure) {
        const cite = extractCitedFragment(line);
        if (!cite) continue;
        if (!evidenceMatches(corpus, cite)) {
          return {
            ok: false,
            reason: `슬라이드 #${slide.slideNo}의 인용 "${cite.slice(0, 60)}…"이 자료 본문에서 안 찾아져요`,
          };
        }
      }
    }
  }

  // 7) qaBank intent 다양성 — 5개 중 unique 4개 이상
  const uniqueIntent = new Set(output.qaBank.map((q) => q.intent.trim().slice(0, 12))).size;
  if (uniqueIntent < 4) {
    return {
      ok: false,
      reason: `예상 질문 5개의 intent가 너무 비슷해요 (unique ${uniqueIntent}/5)`,
    };
  }

  return { ok: true };
}

/**
 * structure 한 줄에서 "자료 8쪽: ..." 같은 인용 fragment를 뽑아낸다.
 * 인용이 없으면 null — 일반 가이드는 검증 대상 X.
 *
 * 패턴 예:
 *   - "정의 한 줄 (자료 5쪽 인용 — 본인 말로 풀어쓰기)" → null (인용 표기만, 본문 X)
 *   - "임계 구역의 4가지 조건 — 자료 11쪽 표 (Mutual Exclusion · Hold and Wait …)" → 괄호 안 fragment 추출
 *   - "Peterson 알고리즘 도식 — 자료 7쪽" → null (도식 설명만)
 *
 * 보수적으로 — 따옴표("…") 안 텍스트만 substring 검증.
 */
function extractCitedFragment(line: string): string | null {
  // " 또는 “ … ” 안의 12자 이상 텍스트만
  const match =
    line.match(/[""]([^""]{12,200})[""]/) ?? line.match(/"([^"]{12,200})"/);
  if (!match) return null;
  return match[1].trim();
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
    tool: "presentation",
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
