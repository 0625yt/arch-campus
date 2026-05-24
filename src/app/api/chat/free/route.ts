import { NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { guardRateLimit, type RateLimitErrBody } from "@/lib/ratelimit";
import { startChatFreeTurn } from "@/lib/services/chat-free";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ErrBody {
  ok: false;
  error: string;
}

const HistoryMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const RequestSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z.array(HistoryMessageSchema).max(20).optional(),
});

/**
 * POST /api/chat/free body: { message, history? }
 *
 * 자료에 매여있지 않은 자유 텍스트 챗. SSE 응답.
 * 메시지는 DB 저장 X — 클라이언트가 history를 매번 보냄.
 * 새로고침하면 사라짐 (MVP 정책).
 */
export async function POST(
  req: Request,
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

  let body: z.infer<typeof RequestSchema>;
  try {
    const json = await req.json();
    body = RequestSchema.parse(json);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `입력 검증 실패: ${e instanceof Error ? e.message : String(e)}` },
      { status: 400 },
    );
  }

  const result = await startChatFreeTurn({
    ownerId,
    userMessage: body.message.trim(),
    history: body.history,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return result.response;
}
