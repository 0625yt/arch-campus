import { NextResponse } from "next/server";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

interface OkBody {
  ok: true;
  thread?: { id: string; title: string };
}
interface ErrBody {
  ok: false;
  error: string;
}

/**
 * PATCH /api/chat/threads/[id]  body: { title }
 *   - thread 이름 변경. owner_id 가드.
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<OkBody | ErrBody>> {
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

  let body: { title?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ ok: false, error: "title이 비어있어요" }, { status: 400 });
  }
  if (title.length > 100) {
    return NextResponse.json({ ok: false, error: "title이 너무 길어요 (100자 이내)" }, { status: 400 });
  }

  const admin = getAdminSupabase();
  const result = await (admin as unknown as {
    from: (t: string) => {
      update: (row: Record<string, unknown>) => {
        eq: (
          c: string,
          v: string,
        ) => {
          eq: (
            c: string,
            v: string,
          ) => {
            select: (cols: string) => {
              maybeSingle: () => Promise<{
                data: { id: string; title: string } | null;
                error: unknown;
              }>;
            };
          };
        };
      };
    };
  })
    .from("chat_threads")
    .update({ title })
    .eq("id", threadId)
    .eq("owner_id", ownerId)
    .select("id, title")
    .maybeSingle();

  if (result.error) {
    return NextResponse.json({ ok: false, error: "수정 실패" }, { status: 500 });
  }
  if (!result.data) {
    return NextResponse.json({ ok: false, error: "스레드를 찾을 수 없어요" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, thread: result.data });
}

/**
 * DELETE /api/chat/threads/[id]
 *   - thread + chat_messages cascade (FK on delete cascade).
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<OkBody | ErrBody>> {
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
  const result = await (admin as unknown as {
    from: (t: string) => {
      delete: (opts: { count: "exact" }) => {
        eq: (
          c: string,
          v: string,
        ) => {
          eq: (
            c: string,
            v: string,
          ) => Promise<{ count: number | null; error: unknown }>;
        };
      };
    };
  })
    .from("chat_threads")
    .delete({ count: "exact" })
    .eq("id", threadId)
    .eq("owner_id", ownerId);

  if (result.error) {
    return NextResponse.json({ ok: false, error: "삭제 실패" }, { status: 500 });
  }
  if (!result.count) {
    return NextResponse.json({ ok: false, error: "스레드를 찾을 수 없어요" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
