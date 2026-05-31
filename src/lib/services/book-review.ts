import "server-only";
import { estimateCost, generate, getModelVendor } from "@/lib/claude";
import { loadPrompt } from "@/lib/prompts";
import { BookReviewOutput, type BookReviewOutputT, parseModelJson, WATERMARK } from "@/lib/schemas";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { breakdown } from "@/lib/tokens";

/**
 * 독후감 위저드 — 8개 본문 도구 중 첫번째 (CLAUDE.md §4 개정 후).
 *
 * 사활:
 *   - 학생이 입력한 본인 메모 인용이 paragraphs[]에 실제 substring으로 박혀야 함.
 *     없으면 환각·짜내기 → reject.
 *   - 머리·꼬리 워터마크 양쪽 확인 (sub_string).
 *   - bookTitle·bookAuthor 입력값 그대로 (모델이 환각 만들면 reject).
 *
 * 모델: wizard-assignment(Sonnet) 재사용. 학기당 독후감 1~3건이라 Sonnet OK.
 */

export interface BookReviewInput {
  ownerId: string;
  bookTitle: string;
  bookAuthor: string;
  /** 학생이 메모한 발췌·인상 — 최소 1개. citations.quote의 source pool. */
  notes: string[];
  /** 한 줄 느낌 — intro 톤 시드 */
  feeling?: string;
  /** 분량 가이드 (학교 과제 분량 기준) */
  lengthHint?: "short" | "medium" | "long";
  /** "다시 쓰기"일 때 이전 초안 + 톤 시드 */
  paraphraseFrom?: {
    previous: BookReviewOutputT;
    seed: string;
  };
}

export type BookReviewResult =
  | {
      ok: true;
      output: BookReviewOutputT;
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

export async function runBookReview(input: BookReviewInput): Promise<BookReviewResult> {
  if (!input.bookTitle.trim()) {
    return { ok: false, stage: "input", error: "책 제목이 비어 있어요." };
  }
  if (input.notes.filter((n) => n.trim().length >= 5).length === 0) {
    return {
      ok: false,
      stage: "input",
      error: "본인 메모를 1개 이상 입력해주세요 (5자 이상).",
    };
  }

  const promptName = input.paraphraseFrom ? "book-review-paraphrase" : "book-review";
  const rulePrompt = loadPrompt(promptName);
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
      tool: "wizard-assignment",
      rulePrompt,
      dynamicContext,
      userInput,
      maxTokens: 3200,
      temperature: 0.7,
    });
  } catch (e) {
    await logGeneration({
      ownerId: input.ownerId,
      status: "error",
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    return {
      ok: false,
      stage: "ai",
      error: "독후감 초안을 만들지 못했어요. 잠시 후 다시 시도해주세요.",
    };
  }

  let output: BookReviewOutputT;
  try {
    output = parseModelJson(BookReviewOutput, result.text);
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
      error: "독후감 형식이 맞지 않았어요. 다시 시도해주세요.",
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
      bookTitle: input.bookTitle,
      bookAuthor: input.bookAuthor,
      paraphrase: !!input.paraphraseFrom,
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

function buildDynamicContext(input: BookReviewInput): string {
  const lines: string[] = [
    `책: ${input.bookTitle}`,
    `저자: ${input.bookAuthor || "(미입력)"}`,
    `분량 가이드: ${lengthLabel(input.lengthHint)}`,
  ];
  if (input.feeling?.trim()) {
    lines.push(`학생 한 줄 느낌: ${input.feeling.trim().slice(0, 200)}`);
  }
  lines.push("");
  lines.push(`본인 메모 ${input.notes.length}개 (이걸 citations.quote에 substring으로 박아야 함):`);
  input.notes.forEach((n, i) => {
    if (n.trim()) lines.push(`[메모 ${i + 1}] ${n.trim().slice(0, 600)}`);
  });

  if (input.paraphraseFrom) {
    lines.push("");
    lines.push("=== 이전 초안 (다시 쓰기 기준) ===");
    lines.push(`톤 시드: ${input.paraphraseFrom.seed}`);
    lines.push("이전 본문:");
    for (const p of input.paraphraseFrom.previous.paragraphs) {
      lines.push(`[${p.role}] ${p.text}`);
    }
    lines.push("");
    lines.push("↑ 위 본문의 사고 흐름·메모 인용은 유지, 어휘·구문은 70%+ 교체. 같은 단락 수.");
  }
  return lines.join("\n");
}

function buildUserInput(input: BookReviewInput): string {
  if (input.paraphraseFrom) {
    return `위 이전 초안을 같은 schema로 paraphrase 해서 JSON으로 반환해. 메모 인용은 그대로 유지.`;
  }
  return `위 책 정보와 본인 메모로 독후감 초안을 JSON으로 반환해.`;
}

function lengthLabel(hint?: BookReviewInput["lengthHint"]): string {
  if (hint === "short") return "단락 4개 안쪽 · 700자 이내";
  if (hint === "long") return "단락 7~8개 · 1200~1500자";
  return "단락 5~6개 · 900~1200자";
}

function validateOutput(
  output: BookReviewOutputT,
  input: BookReviewInput,
): { ok: true } | { ok: false; reason: string } {
  // 1. 워터마크 머리·꼬리 양쪽
  if (!output.watermark.includes(WATERMARK)) {
    return { ok: false, reason: "워터마크 누락 (머리)" };
  }
  if (!output.disclaimer.includes("본인") || output.disclaimer.length < 10) {
    return { ok: false, reason: "약관 disclaimer 누락 (꼬리)" };
  }

  // 2. 책 제목·저자 환각 차단 — 입력값과 substring 일치 (저자는 빈 입력 허용)
  if (!output.bookTitle.includes(input.bookTitle.slice(0, 20))) {
    return { ok: false, reason: "bookTitle이 입력값과 다름 (환각 위험)" };
  }
  if (input.bookAuthor.trim() && !output.bookAuthor.includes(input.bookAuthor.slice(0, 10))) {
    return { ok: false, reason: "bookAuthor가 입력값과 다름 (환각 위험)" };
  }

  // 3. role 순서 — intro 1개, outro 1개 강제
  const intros = output.paragraphs.filter((p) => p.role === "intro").length;
  const outros = output.paragraphs.filter((p) => p.role === "outro").length;
  if (intros !== 1 || outros !== 1) {
    return { ok: false, reason: "단락 구조 오류 — intro·outro 각 1개여야 함" };
  }

  // 4. 본인 메모 인용 — 전체 paragraphs를 합쳐 1개 이상의 메모 substring이 박혀있어야 함
  const allQuotes = output.paragraphs.flatMap((p) => p.citations.map((c) => c.quote));
  const validNotes = input.notes.filter((n) => n.trim().length >= 5);
  const matched = validNotes.some((note) =>
    allQuotes.some((q) => note.includes(q) || q.includes(note.slice(0, Math.min(30, note.length)))),
  );
  if (!matched) {
    return {
      ok: false,
      reason: "본인 메모 인용이 단락에 박혀있지 않아요 (환각 보호 가드)",
    };
  }

  return { ok: true };
}

/**
 * 생성 로그 — generations 테이블. 다른 위저드와 동일 schema.
 */
async function logGeneration(args: {
  ownerId: string;
  modelId?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
  cost?: number;
  status: "ok" | "error" | "rejected";
  errorMessage?: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const admin = getAdminSupabase();
  const modelId = args.modelId ?? "unknown";
  const { error } = await admin.from("generations").insert({
    owner_id: args.ownerId,
    tool: "book-review",
    model_id: modelId,
    model_provider: getModelVendor(modelId),
    input_tokens: args.usage?.inputTokens ?? 0,
    output_tokens: args.usage?.outputTokens ?? 0,
    cache_read_tokens: args.usage?.cacheReadTokens ?? 0,
    cache_creation_tokens: args.usage?.cacheCreationTokens ?? 0,
    cost_usd: args.cost ?? 0,
    status: args.status,
    error_message: args.errorMessage ?? null,
    payload: args.payload ?? {},
  });
  if (error) {
    console.error("generations 기록 실패:", error.message);
  }
}
