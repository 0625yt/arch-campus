import "server-only";
import { type GenerateUsage, streamChatReply } from "@/lib/claude";
import { loadPrompt } from "@/lib/prompts";
import { extractRelevantChunks, formatChunksAsHint } from "@/lib/rag/extract-relevant";
import { getAdminSupabase } from "@/lib/supabase/admin";

/**
 * AI Chat 서비스 — 자료 1개에 잠긴 RAG 챗봇.
 *
 * 책임:
 *   1) thread + history fetch (owner_id 가드)
 *   2) prompts/chat.md + 자료 snapshot으로 messages 조립
 *   3) streamChatReply 호출 (Haiku + 1h cache)
 *   4) onFinish 콜백에서 user/assistant 두 행 INSERT + cost 저장
 *
 * 라우트는 인증·rate limit·http만, 모델/검증/DB는 모두 여기.
 */

const MAX_HISTORY_TURNS = 8; // 최근 user+assistant 페어 ×4 = 8 messages
const MAX_USER_MESSAGE_LEN = 4000;

// 응답 끝의 [CITATIONS]{...} JSON 토큰을 파싱하는 정규식.
// 본문은 토큰을 제거한 채로 사용자에게 보이고, 인용은 별도 columns로 저장.
const CITATION_TOKEN_RE = /\n?\[CITATIONS\](\{[\s\S]*?\})\s*$/;

export interface ChatCitation {
  page: number;
  quote: string;
}

export interface ParsedChatResponse {
  body: string;
  citations: ChatCitation[];
}

export function parseChatResponse(text: string): ParsedChatResponse {
  const m = text.match(CITATION_TOKEN_RE);
  if (!m) return { body: text.trim(), citations: [] };
  try {
    const parsed = JSON.parse(m[1]);
    if (parsed && Array.isArray(parsed.items)) {
      const items = parsed.items
        .filter(
          (it: unknown): it is { page: number; quote: string } =>
            typeof it === "object" &&
            it !== null &&
            typeof (it as { page?: unknown }).page === "number" &&
            typeof (it as { quote?: unknown }).quote === "string",
        )
        .slice(0, 5);
      return {
        body: text.replace(CITATION_TOKEN_RE, "").trim(),
        citations: items,
      };
    }
  } catch {
    // JSON 파싱 실패 — 본문은 살리고 인용만 버림
  }
  return { body: text.trim(), citations: [] };
}

interface ChatThreadRow {
  id: string;
  owner_id: string;
  material_id: string;
  course_id: string | null;
  title: string;
  material_full_text: string;
  material_snapshot_chars: number;
}

interface MaterialMeta {
  title: string;
  type: string;
  page_count: number | null;
}

async function fetchThreadWithOwnerGuard(
  ownerId: string,
  threadId: string,
): Promise<ChatThreadRow | null> {
  const admin = getAdminSupabase();
  // service-role이라 RLS 우회 — owner_id .eq() 가드 필수 (CLAUDE.md §6 admin.ts §4-1)
  const { data, error } = await (
    admin as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (
            c: string,
            v: string,
          ) => {
            eq: (
              c: string,
              v: string,
            ) => { maybeSingle: () => Promise<{ data: ChatThreadRow | null; error: unknown }> };
          };
        };
      };
    }
  )
    .from("chat_threads")
    .select(
      "id, owner_id, material_id, course_id, title, material_full_text, material_snapshot_chars",
    )
    .eq("id", threadId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) {
    console.error("[chat] thread fetch error", error);
    return null;
  }
  return data;
}

async function fetchMaterialMeta(
  ownerId: string,
  materialId: string,
): Promise<MaterialMeta | null> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from("materials")
    .select("title, type, page_count")
    .eq("id", materialId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    title: data.title ?? "(제목 없음)",
    type: data.type ?? "lecture",
    page_count: data.page_count ?? null,
  };
}

async function fetchRecentMessages(
  threadId: string,
  limit: number,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const admin = getAdminSupabase();
  const { data, error } = await (
    admin as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (
            c: string,
            v: string,
          ) => {
            order: (
              c: string,
              opts: { ascending: boolean },
            ) => {
              limit: (n: number) => Promise<{
                data: Array<{ role: "user" | "assistant"; content: string }> | null;
                error: unknown;
              }>;
            };
          };
        };
      };
    }
  )
    .from("chat_messages")
    .select("role, content")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  // DESC로 가져왔으니 역순으로 되돌려서 시간 순서대로
  return data.reverse();
}

function buildMaterialBlock(thread: ChatThreadRow, meta: MaterialMeta): string {
  return [
    "## 자료",
    `제목: ${meta.title}`,
    `종류: ${meta.type}`,
    `페이지 수: ${meta.page_count ?? "unknown"}`,
    "",
    "<material_body>",
    thread.material_full_text,
    "</material_body>",
  ].join("\n");
}

/**
 * dynamicContext에 가벼운 RAG hint 추가.
 *   - materialBlock(전체 본문)은 그대로 두고 캐시 hit 보존.
 *   - 사용자 질문의 키워드로 본문에서 가장 관련 깊은 청크 1~3개를 발췌해
 *     "## 관련 발췌" 섹션으로 모델 attention을 끌어줌.
 *   - 자료가 짧거나 매칭이 없으면 hint 자체 생략 — 노이즈 X.
 *   - userMessage가 없으면(첫 메시지 전) hint 없음.
 */
function buildDynamicContext(
  thread: ChatThreadRow,
  meta: MaterialMeta,
  userMessage: string,
): string {
  const base = [
    "## 현재 컨텍스트",
    `스레드: ${thread.title}`,
    `자료 본문 ${thread.material_snapshot_chars.toLocaleString()}자 (snapshot)`,
    `자료 종류: ${meta.type}`,
  ];

  if (userMessage && thread.material_full_text) {
    const chunks = extractRelevantChunks(thread.material_full_text, userMessage, { topN: 3 });
    const hint = formatChunksAsHint(chunks);
    if (hint) {
      base.push("", hint);
    }
  }

  return base.join("\n");
}

export interface StartChatTurnInput {
  ownerId: string;
  threadId: string;
  userMessage: string;
}

export type StartChatTurnResult =
  | { ok: true; response: Response }
  | { ok: false; status: number; error: string };

/**
 * 사용자 turn 받아 → user 메시지 INSERT → streamText 호출 → SSE Response 반환.
 *
 * 호출자(라우트)는 이 Response를 그대로 return.
 * onFinish는 stream 끝났을 때 자동으로 assistant 메시지 INSERT.
 */
export async function startChatTurn(input: StartChatTurnInput): Promise<StartChatTurnResult> {
  if (!input.userMessage || input.userMessage.length === 0) {
    return { ok: false, status: 400, error: "메시지가 비어있어요" };
  }
  if (input.userMessage.length > MAX_USER_MESSAGE_LEN) {
    return { ok: false, status: 400, error: "메시지가 너무 길어요 (4000자 이내)" };
  }

  const thread = await fetchThreadWithOwnerGuard(input.ownerId, input.threadId);
  if (!thread) {
    return { ok: false, status: 404, error: "스레드를 찾을 수 없어요" };
  }

  const meta = await fetchMaterialMeta(input.ownerId, thread.material_id);
  if (!meta) {
    return { ok: false, status: 404, error: "자료를 찾을 수 없어요" };
  }

  const history = await fetchRecentMessages(input.threadId, MAX_HISTORY_TURNS);

  // user turn을 먼저 INSERT — 응답이 끊겨도 사용자 입력은 기록 유지
  const admin = getAdminSupabase();
  const { error: userInsertErr } = await (
    admin as unknown as {
      from: (t: string) => {
        insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
      };
    }
  )
    .from("chat_messages")
    .insert({
      thread_id: input.threadId,
      owner_id: input.ownerId,
      role: "user",
      content: input.userMessage,
    });
  if (userInsertErr) {
    console.error("[chat] user message insert failed", userInsertErr);
    return { ok: false, status: 500, error: "메시지 저장 실패" };
  }

  const rulePrompt = loadPrompt("chat");
  const materialBlock = buildMaterialBlock(thread, meta);
  // userMessage 기반 RAG hint를 dynamicContext에 추가 — materialBlock(캐시 대상)은 그대로
  const dynamicContext = buildDynamicContext(thread, meta, input.userMessage);

  const result = streamChatReply({
    rulePrompt,
    materialBlock,
    dynamicContext,
    history,
    userMessage: input.userMessage,
    maxTokens: 1500,
    temperature: 0.3,
    onFinish: async ({ text, usage, modelId, costUsd }) => {
      // 응답 끝났을 때 — 인용 파싱 + assistant turn INSERT
      const parsed = parseChatResponse(text);
      await persistAssistantMessage({
        threadId: input.threadId,
        ownerId: input.ownerId,
        body: parsed.body,
        citations: parsed.citations,
        usage,
        modelId,
        costUsd,
      });
    },
  });

  return { ok: true, response: result.toUIMessageStreamResponse() };
}

interface PersistAssistantInput {
  threadId: string;
  ownerId: string;
  body: string;
  citations: ChatCitation[];
  usage: GenerateUsage;
  modelId: string;
  costUsd: number;
}

async function persistAssistantMessage(input: PersistAssistantInput): Promise<void> {
  const admin = getAdminSupabase();
  const { error } = await (
    admin as unknown as {
      from: (t: string) => {
        insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
      };
    }
  )
    .from("chat_messages")
    .insert({
      thread_id: input.threadId,
      owner_id: input.ownerId,
      role: "assistant",
      content: input.body,
      citations: input.citations,
      input_tokens: input.usage.inputTokens,
      output_tokens: input.usage.outputTokens,
      cache_read_tokens: input.usage.cacheReadTokens,
      cache_creation_tokens: input.usage.cacheCreationTokens,
      cost_usd: input.costUsd,
      model_id: input.modelId,
    });
  if (error) {
    console.error("[chat] assistant message insert failed", error);
    // 실패해도 stream 응답은 이미 전송됨 — 사용자 차단 X
  }
}
