import "server-only";
import { estimateCost, generate } from "@/lib/claude";
import { loadPrompt } from "@/lib/prompts";
import {
  parseModelJson,
  ReportStructureOutput,
  type ReportStructureOutputT,
} from "@/lib/schemas";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { breakdown } from "@/lib/tokens";

/**
 * 리포트 구조 설계 서비스 — `/api/wizards/report-structure`에서 호출.
 *
 * 사활:
 *   - **본문 문장 출력 0건**. 모든 keyQuestions가 물음표(`?`)로 끝나야 통과.
 *     평서문이 박히면 학생이 그대로 본문에 복붙 → §4 치팅 라인 위반.
 *   - sections[].estimatedPages 합이 targetPages ±25%
 *   - sections[].purpose 모두 unique
 *
 * 모델: Sonnet 4.6. 학기당 1~3건이라 비용 OK.
 */

export type ReportType =
  | "분석"
  | "비평"
  | "주장"
  | "비교"
  | "사례 연구"
  | "조사 보고";
export type ReportAudience = "교수님" | "조교" | "학우 발표용";

export interface ReportStructureMaterialInput {
  id: string;
  title: string;
  pages?: number | null;
  fullText: string;
}

export interface ReportStructureInput {
  ownerId: string;
  topic: string;
  reportType: ReportType;
  targetPages: number;
  audience: ReportAudience;
  constraints?: string;
  materials: ReportStructureMaterialInput[];
}

export type ReportStructureResult =
  | {
      ok: true;
      output: ReportStructureOutputT;
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

export async function runReportStructure(
  input: ReportStructureInput,
): Promise<ReportStructureResult> {
  if (!input.topic.trim()) {
    return { ok: false, stage: "input", error: "리포트 주제가 비어 있어요." };
  }
  if (input.targetPages < 1 || input.targetPages > 20) {
    return {
      ok: false,
      stage: "input",
      error: "분량은 1~20쪽 사이로 입력해 주세요.",
    };
  }

  const rulePrompt = loadPrompt("report-structure");
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
      tool: "report-structure",
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

  let output: ReportStructureOutputT;
  try {
    output = parseModelJson(ReportStructureOutput, result.text);
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
      reportType: input.reportType,
      targetPages: input.targetPages,
      audience: input.audience,
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

function buildDynamicContext(input: ReportStructureInput): string {
  const lines: string[] = [
    `리포트 정보:`,
    `- 주제: ${input.topic}`,
    `- 리포트 타입: ${input.reportType}`,
    `- 목표 분량: ${input.targetPages}쪽`,
    `- 청중: ${input.audience}`,
  ];
  if (input.constraints && input.constraints.trim()) {
    lines.push(`- 제약·평가 기준: ${input.constraints.trim().slice(0, 400)}`);
  }

  const sectionHint = sectionCountFor(input.targetPages);
  lines.push(
    "",
    `섹션 수 가이드: ${sectionHint.min}~${sectionHint.max}개 (estimatedPages 합 = ${input.targetPages}쪽 ±25%).`,
  );

  if (input.materials.length === 0) {
    lines.push(
      "",
      "참고 자료 없음 — citationHint는 학생이 직접 찾을 자리 표시로 (예: \"본인 강의 자료에서 ~ 부분\") 또는 omit.",
    );
  } else {
    lines.push("", `참고 자료 ${input.materials.length}건:`);
    for (const m of input.materials) {
      lines.push(`- id=${m.id} · ${m.title}${m.pages ? ` (${m.pages}쪽)` : ""}`);
    }
    lines.push(
      "",
      "citationHint에 자료를 인용할 때는 자료 본문 substring과 페이지 번호로 정확히 박을 것.",
    );
  }

  return lines.join("\n");
}

function buildUserInput(input: ReportStructureInput): string {
  if (input.materials.length === 0) {
    return `(참고 자료 없음 — 주제·청중·타입만으로 구조를 잡아주세요)`;
  }
  const blocks = input.materials.map((m) => {
    const text = (m.fullText || "").slice(0, 6000);
    return `=== 자료 id=${m.id} (${m.title}) ===\n${text}`;
  });
  return blocks.join("\n\n");
}

function sectionCountFor(targetPages: number): { min: number; max: number } {
  if (targetPages <= 2) return { min: 3, max: 4 };
  if (targetPages <= 4) return { min: 3, max: 5 };
  if (targetPages <= 6) return { min: 4, max: 6 };
  return { min: 5, max: 7 };
}

function validateOutput(
  output: ReportStructureOutputT,
  input: ReportStructureInput,
): { ok: true } | { ok: false; reason: string } {
  if (output.rejected) return { ok: true };

  // 1) 섹션 수
  const hint = sectionCountFor(input.targetPages);
  if (output.sections.length < hint.min || output.sections.length > hint.max) {
    return {
      ok: false,
      reason: `${input.targetPages}쪽 리포트에 섹션 ${hint.min}~${hint.max}개가 적정인데 ${output.sections.length}개 나왔어요`,
    };
  }

  // 2) order 1..N 연속
  for (let i = 0; i < output.sections.length; i++) {
    if (output.sections[i].order !== i + 1) {
      return {
        ok: false,
        reason: `섹션 order가 1부터 ${output.sections.length}까지 순서대로 안 박힘`,
      };
    }
  }

  // 3) estimatedPages 합 ±25%
  const pageSum = output.sections.reduce((a, s) => a + s.estimatedPages, 0);
  const lower = input.targetPages * 0.75;
  const upper = input.targetPages * 1.25;
  if (pageSum < lower || pageSum > upper) {
    return {
      ok: false,
      reason: `섹션 분량 합 ${pageSum.toFixed(1)}쪽이 ${input.targetPages}쪽의 75~125% 벗어남`,
    };
  }

  // 4) purpose unique
  const purposes = output.sections.map((s) => s.purpose.trim().slice(0, 20));
  if (new Set(purposes).size < purposes.length) {
    return {
      ok: false,
      reason: `섹션 purpose가 중복됐어요 — 모든 섹션은 다른 목적이어야 함`,
    };
  }

  // 5) ★ keyQuestions가 모두 물음표로 끝남 — 본문 작성 차단의 핵심 가드
  for (const section of output.sections) {
    for (const q of section.keyQuestions) {
      const trimmed = q.trim();
      if (!trimmed.endsWith("?") && !trimmed.endsWith("?")) {
        return {
          ok: false,
          reason: `섹션 #${section.order}의 질문이 평서문이에요 (물음표로 끝나야 함): "${trimmed.slice(0, 50)}…"`,
        };
      }
    }
  }

  return { ok: true };
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
    tool: "report-structure",
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
