import { NextResponse } from "next/server";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { guardRateLimit, type RateLimitErrBody } from "@/lib/ratelimit";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_MATERIAL_TEXT_BYTES = 50_000; // 50KB cap — cache boundary 안정성

interface ThreadSummary {
  id: string;
  title: string;
  material_id: string;
  course_id: string | null;
  last_message_at: string | null;
  created_at: string;
}

interface ListOk {
  ok: true;
  threads: ThreadSummary[];
}

interface CreateOk {
  ok: true;
  threadId: string;
  title: string;
}

interface ErrBody {
  ok: false;
  error: string;
}

/**
 * GET /api/chat/threads?materialId=...  — 자료별 스레드 목록 (최근순).
 */
export async function GET(
  req: Request,
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

  const url = new URL(req.url);
  const materialId = url.searchParams.get("materialId");
  if (!materialId) {
    return NextResponse.json({ ok: false, error: "materialId 필수" }, { status: 400 });
  }

  const admin = getAdminSupabase();
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
                opts: { ascending: boolean; nullsFirst?: boolean },
              ) => {
                limit: (n: number) => Promise<{ data: ThreadSummary[] | null; error: unknown }>;
              };
            };
          };
        };
      };
    }
  )
    .from("chat_threads")
    .select("id, title, material_id, course_id, last_message_at, created_at")
    .eq("owner_id", ownerId)
    .eq("material_id", materialId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(20);

  if (error) {
    console.error("[chat.threads] list failed", error);
    return NextResponse.json({ ok: false, error: "조회 실패" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, threads: data ?? [] });
}

/**
 * POST /api/chat/threads  body: { materialId }
 *   - material 본문 50KB snapshot 떠서 thread 생성.
 *   - 응답: { threadId }
 */
export async function POST(
  req: Request,
): Promise<NextResponse<CreateOk | ErrBody | RateLimitErrBody>> {
  let ownerId: string;
  try {
    ownerId = await getOwnerId();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    throw e;
  }

  // ai bucket — thread 생성 자체는 cheap이지만 챗 진입점이라 같은 캡
  const blocked = await guardRateLimit("ai", ownerId);
  if (blocked) return blocked;

  let body: { materialId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
  }

  const materialId = typeof body.materialId === "string" ? body.materialId : null;
  if (!materialId) {
    return NextResponse.json({ ok: false, error: "materialId 필수" }, { status: 400 });
  }

  const admin = getAdminSupabase();

  // material owner 검증 + full_text snapshot
  const { data: material, error: materialErr } = await admin
    .from("materials")
    .select("id, course_id, full_text, title")
    .eq("id", materialId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (materialErr) {
    return NextResponse.json(
      { ok: false, error: `조회 실패: ${materialErr.message}` },
      { status: 500 },
    );
  }
  if (!material) {
    return NextResponse.json({ ok: false, error: "자료를 찾을 수 없어요" }, { status: 404 });
  }

  const snapshot = (material.full_text ?? "").slice(0, MAX_MATERIAL_TEXT_BYTES);
  if (snapshot.trim().length < 80) {
    return NextResponse.json(
      { ok: false, error: "자료 본문이 너무 짧아 챗을 시작할 수 없어요" },
      { status: 422 },
    );
  }

  const title = `${(material.title ?? "자료").slice(0, 40)} — 새 대화`;

  const { data: created, error: createErr } = await (
    admin as unknown as {
      from: (t: string) => {
        insert: (row: Record<string, unknown>) => {
          select: (cols: string) => {
            single: () => Promise<{
              data: { id: string; title: string } | null;
              error: unknown;
            }>;
          };
        };
      };
    }
  )
    .from("chat_threads")
    .insert({
      owner_id: ownerId,
      material_id: materialId,
      course_id: material.course_id,
      title,
      material_full_text: snapshot,
      material_snapshot_chars: snapshot.length,
    })
    .select("id, title")
    .single();

  if (createErr || !created) {
    const errMsg =
      typeof (createErr as { message?: unknown })?.message === "string"
        ? (createErr as { message: string }).message
        : "대화를 시작하지 못했어요";
    return NextResponse.json({ ok: false, error: errMsg }, { status: 500 });
  }

  return NextResponse.json({ ok: true, threadId: created.id, title: created.title });
}
