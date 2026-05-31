import { NextResponse } from "next/server";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { isAdminUserId } from "@/lib/auth/admin";
import { FeedbackPatchBody } from "@/lib/schemas/feedback";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let ownerId: string;
  try {
    ownerId = await getOwnerId();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw e;
  }
  if (!isAdminUserId(ownerId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const parsed = FeedbackPatchBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "입력 오류", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const admin = getAdminSupabase() as unknown as {
    from: (table: string) => any;
  };
  const { error } = await admin
    .from("feedback")
    .update({
      status: parsed.data.status,
      admin_note: parsed.data.adminNote ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
