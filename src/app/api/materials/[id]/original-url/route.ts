import { NextResponse } from "next/server";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { createSignedReadUrl } from "@/lib/storage";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

interface OkResp {
  ok: true;
  url: string;
}
interface ErrResp {
  ok: false;
  error: string;
}

/**
 * 변환 실패 시 원본 Office 파일을 사용자가 다운받을 수 있게 signed URL 발급.
 * original_storage_path가 있으면 그걸, 없으면 storage_path를 노출.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<OkResp | ErrResp>> {
  let ownerId: string;
  try {
    ownerId = await getOwnerId();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    throw e;
  }
  const { id } = await ctx.params;

  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from("materials")
    .select("storage_path, original_storage_path")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: "자료를 찾을 수 없어요" }, { status: 404 });
  }
  const path =
    (data.original_storage_path as string | null) ?? (data.storage_path as string | null);
  if (!path) {
    return NextResponse.json({ ok: false, error: "원본 파일이 없어요" }, { status: 404 });
  }
  try {
    const url = await createSignedReadUrl({ storagePath: path });
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "URL 발급 실패" },
      { status: 500 },
    );
  }
}
