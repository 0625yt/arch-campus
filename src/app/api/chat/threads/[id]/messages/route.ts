import { NextResponse } from "next/server";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { guardRateLimit, type RateLimitErrBody } from "@/lib/ratelimit";
import { type ChatCitation, startChatTurn } from "@/lib/services/chat";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

interface MessageRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: ChatCitation[];
  created_at: string;
}

interface ListOk {
  ok: true;
  messages: MessageRow[];
}

interface ErrBody {
  ok: false;
  error: string;
}

/**
 * GET /api/chat/threads/[id]/messages — 스레드 메시지 전체 (생성순).
 * 처음 패널 열 때 1회 호출. 새 메시지는 streamText 응답으로 클라이언트가 누적.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<ListOk | ErrBody | RateLimitErrBody>> {
  let ownerId: string;
  try {
    ownerId = await getOwnerId();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    throw e;
  }

  const { id: threadId } = await ctx.params;

  const admin = getAdminSupabase();
  // owner 검증을 먼저 — service-role bypass에 §4-1 가드.
  // types.ts에 chat_threads 아직 없어서 unknown cast (regen 후 정리).
  const threadCheck = await (
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
            ) => { maybeSingle: () => Promise<{ data: { id: string } | null; error: unknown }> };
          };
        };
      };
    }
  )
    .from("chat_threads")
    .select("id")
    .eq("id", threadId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!threadCheck.data) {
    return NextResponse.json({ ok: false, error: "스레드를 찾을 수 없어요" }, { status: 404 });
  }

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
            ) => {
              order: (
                c: string,
                opts: { ascending: boolean },
              ) => Promise<{ data: MessageRow[] | null; error: unknown }>;
            };
          };
        };
      };
    }
  )
    .from("chat_messages")
    .select("id, role, content, citations, created_at")
    .eq("thread_id", threadId)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[chat.messages] list failed", error);
    return NextResponse.json({ ok: false, error: "조회 실패" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, messages: data ?? [] });
}

/**
 * POST /api/chat/threads/[id]/messages  body: { message }
 *   → 사용자 메시지 INSERT + assistant 응답 SSE 스트림 반환
 *   → onFinish가 assistant 메시지 INSERT 마무리
 *
 * Response는 AI SDK v6 toUIMessageStreamResponse() — 클라이언트는 useChat() 훅으로 누적.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response | NextResponse<ErrBody | RateLimitErrBody>> {
  let ownerId: string;
  try {
    ownerId = await getOwnerId();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    throw e;
  }

  const blocked = await guardRateLimit("ai", ownerId);
  if (blocked) return blocked;

  const { id: threadId } = await ctx.params;

  let body: { message?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ ok: false, error: "메시지가 비어있어요" }, { status: 400 });
  }

  const result = await startChatTurn({ ownerId, threadId, userMessage: message });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return result.response;
}
