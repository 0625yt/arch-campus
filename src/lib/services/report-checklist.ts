import "server-only";
import { generate, estimateCost } from "@/lib/claude";
import { loadPrompt } from "@/lib/prompts";
import {
  ChecklistOutput,
  evidenceMatches,
  parseModelJson,
  type ChecklistOutputT,
} from "@/lib/schemas";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { breakdown } from "@/lib/tokens";

/**
 * 과제 요구사항 체크리스트 서비스 — `/api/wizards/report-checklist`에서 호출.
 *
 * 책임: prompt 로드 → 모델 호출 → Zod 검증 → 사후 검증 → generations 기록
 *
 * 사후 검증:
 *   - requirements[].quote는 noticeText의 substring (whitespace tolerant)
 *   - 한 개라도 어기면 ok=false (validation stage)
 *
 * 비용:
 *   - Sonnet 4.6, maxTokens 4096 (체크리스트 길어야 20개)
 *   - 1회 ~ $0.02
 */

export interface ChecklistInput {
  ownerId: string;
  assignmentTitle: string;
  noticeText: string;
  dueAt: string | null;
  extraNotes?: string;
}

export type ChecklistResult =
  | {
      ok: true;
      output: ChecklistOutputT;
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

export async function runReportChecklist(input: ChecklistInput): Promise<ChecklistResult> {
  const trimmedNotice = input.noticeText.trim();
  if (trimmedNotice.length < 30) {
    return {
      ok: false,
      stage: "input",
      error: "공지 내용이 너무 짧아요. LMS 공지·이메일 본문을 30자 이상 붙여주세요.",
    };
  }
  if (trimmedNotice.length > 12_000) {
    return {
      ok: false,
      stage: "input",
      error: "공지 내용이 너무 길어요. 핵심 부분만 12,000자 안으로 잘라주세요.",
    };
  }
  if (!input.assignmentTitle.trim()) {
    return { ok: false, stage: "input", error: "과제 이름을 적어주세요." };
  }

  const rulePrompt = loadPrompt("report-checklist");
  const dynamicContext = buildDynamicContext(input);
  const userInput = buildUserInput(input);

  const tokenBudget = breakdown({ rule: rulePrompt, dynamic: dynamicContext, user: userInput });

  let result: Awaited<ReturnType<typeof generate>>;
  try {
    result = await generate({
      tool: "wizard-assignment",
      rulePrompt,
      dynamicContext,
      userInput,
      maxTokens: 4096,
      temperature: 0.3,
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

  let output: ChecklistOutputT;
  try {
    output = parseModelJson(ChecklistOutput, result.text);
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

  const costUsd = estimateCost(result.usage, result.modelId);

  if (output.rejected) {
    await logGeneration({
      ownerId: input.ownerId,
      modelId: result.modelId,
      usage: result.usage,
      cost: costUsd,
      status: "rejected",
      payload: { reason: output.reason, assignmentTitle: input.assignmentTitle },
    });
    return { ok: true, output, modelId: result.modelId, usage: result.usage, costUsd, tokenBudget };
  }

  // 사후 검증 — quote substring
  const validation = validateOutput(output, input.noticeText, input.extraNotes ?? "");
  if (!validation.ok) {
    await logGeneration({
      ownerId: input.ownerId,
      modelId: result.modelId,
      usage: result.usage,
      cost: costUsd,
      status: "rejected",
      errorMessage: `사후 검증 실패: ${validation.reason}`,
      payload: { output },
    });
    return { ok: false, stage: "validation", error: validation.reason };
  }

  await logGeneration({
    ownerId: input.ownerId,
    modelId: result.modelId,
    usage: result.usage,
    cost: costUsd,
    status: "ok",
    payload: { assignmentTitle: input.assignmentTitle, output },
  });

  return { ok: true, output, modelId: result.modelId, usage: result.usage, costUsd, tokenBudget };
}

function buildDynamicContext(input: ChecklistInput): string {
  const lines: string[] = [
    `과제 정보:`,
    `- 과제 이름: ${input.assignmentTitle.trim()}`,
  ];
  if (input.dueAt) {
    lines.push(`- 학생이 입력한 마감: ${input.dueAt}`);
  } else {
    lines.push(`- 학생이 입력한 마감: 없음 (공지에서 찾으면 requirements에 박을 것)`);
  }
  if (input.extraNotes && input.extraNotes.trim()) {
    lines.push(``, `학생이 강의 중 메모:`, input.extraNotes.trim().slice(0, 1000));
  }
  return lines.join("\n");
}

function buildUserInput(input: ChecklistInput): string {
  return `=== 교수님 공지 본문 ===\n${input.noticeText}`;
}

function validateOutput(
  output: Extract<ChecklistOutputT, { rejected?: false | undefined }>,
  noticeText: string,
  extraNotes: string,
): { ok: true } | { ok: false; reason: string } {
  if (output.rejected) return { ok: true };

  // 모든 quote가 noticeText 또는 extraNotes에 substring으로 있어야 함
  const haystacks = [noticeText, extraNotes].filter((s) => s.trim().length > 0);
  for (const req of output.requirements) {
    const found = haystacks.some((h) => evidenceMatches(h, req.quote));
    if (!found) {
      return {
        ok: false,
        reason: `"${req.title}"의 quote가 공지 본문에 없어요. AI가 임의로 만든 인용일 수 있어요.`,
      };
    }
  }

  // topRisks 개수 체크는 zod에서 이미. 의미 검증만.
  const highCount = output.requirements.filter((r) => r.weight === "high").length;
  if (highCount === 0) {
    return {
      ok: false,
      reason: "weight=high인 요구사항이 0개예요. 공지에 감점 직결 항목이 있는지 다시 확인해주세요.",
    };
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
    tool: "wizard-assignment",
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
