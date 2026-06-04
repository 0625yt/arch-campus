import { NextResponse } from "next/server";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

interface DeleteOk {
  ok: true;
}

interface DeleteErr {
  ok: false;
  error: string;
}

/**
 * 사용자가 만든 문제 세트 삭제.
 *
 * - owner_id 강제 (admin client + eq filter 양쪽) → 다른 사용자 quiz 삭제 불가
 * - quiz_attempts는 0005 마이그레이션의 `on delete cascade`로 자동 정리
 * - wrong_items 뷰는 quiz_attempts 기반이라 자동으로 빠짐
 * - 자료(materials)는 별도 유지 — quiz만 지워짐
 */
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse<DeleteOk | DeleteErr>> {
  let ownerId: string;
  try {
    ownerId = await getOwnerId();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    throw e;
  }

  const { id: quizId } = await context.params;

  const admin = getAdminSupabase();
  const { error, count } = await admin
    .from("quizzes")
    .delete({ count: "exact" })
    .eq("id", quizId)
    .eq("owner_id", ownerId);

  if (error) {
    return NextResponse.json({ ok: false, error: `삭제 실패: ${error.message}` }, { status: 500 });
  }
  if (count === 0) {
    // owner mismatch 거나 이미 삭제됨 — 둘 다 사용자 입장에서 같은 결과
    return NextResponse.json({ ok: false, error: "문제를 찾을 수 없어요" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
