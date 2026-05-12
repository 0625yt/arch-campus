import { NextResponse } from "next/server";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { runSummarize } from "@/lib/services/summarize";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 이미 업로드된 자료에 대해 (재)요약 생성.
 * /api/summarize는 신규 파일+요약 묶음, 이건 materialId 기반 재실행.
 *
 * 사용처: study/[course]/[material] 페이지의 "요약 만들기" 버튼.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<{ ok: true; materialId: string } | { ok: false; error: string }>> {
  let ownerId: string;
  try {
    ownerId = await getOwnerId();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    throw e;
  }

  const { id: materialId } = await params;

  // owner_id 강제 — admin 쓰지만 항상 본인 행만
  const admin = getAdminSupabase();
  const { data: material, error: fetchErr } = await admin
    .from("materials")
    .select("id, title, type, full_text, page_count")
    .eq("id", materialId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (fetchErr || !material) {
    return NextResponse.json({ ok: false, error: "자료를 찾을 수 없어요" }, { status: 404 });
  }

  const fullText = material.full_text ?? "";
  if (!fullText.trim()) {
    return NextResponse.json(
      { ok: false, error: "자료 본문이 비어있어 요약을 만들 수 없어요" },
      { status: 422 },
    );
  }

  const result = await runSummarize({
    ownerId,
    materialId: material.id,
    title: material.title,
    type: material.type,
    fullText,
    sanitizedText: fullText,
    pageCount: material.page_count ?? null,
    parserWarnings: [],
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true, materialId: material.id });
}
