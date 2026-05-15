import { NextResponse } from "next/server";
import { z } from "zod";
import { tryGetOwnerId } from "@/lib/auth";
import { deleteMaterialFile } from "@/lib/storage";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

type MaterialUpdate = Database["public"]["Tables"]["materials"]["Update"];

export const runtime = "nodejs";

interface OkResponse {
  ok: true;
  material?: { id: string; title: string };
}

interface ErrResponse {
  ok: false;
  error: string;
}

const PatchBody = z
  .object({
    title: z.string().min(1).max(160).optional(),
    course_id: z.string().uuid().nullable().optional(),
  })
  .strict();

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<OkResponse | ErrResponse>> {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) {
    return NextResponse.json({ ok: false, error: "로그인이 필요해요" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "id 누락" }, { status: 400 });
  }

  let body: z.infer<typeof PatchBody>;
  try {
    body = PatchBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `입력 검증 실패: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 400 },
    );
  }

  const update: MaterialUpdate = {};
  if (body.title !== undefined) {
    const t = body.title.trim();
    if (!t) {
      return NextResponse.json({ ok: false, error: "제목은 비울 수 없어요" }, { status: 400 });
    }
    update.title = t;
  }
  if (body.course_id !== undefined) update.course_id = body.course_id;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: "수정할 항목이 없어요" }, { status: 400 });
  }

  const admin = getAdminSupabase();

  // course_id 옮길 때는 그 강의가 본인 소유인지 확인
  if (typeof update.course_id === "string") {
    const { data: course } = await admin
      .from("courses")
      .select("id")
      .eq("id", update.course_id)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (!course) {
      return NextResponse.json(
        { ok: false, error: "옮길 강의를 찾을 수 없어요" },
        { status: 404 },
      );
    }
  }

  const { data, error } = await admin
    .from("materials")
    .update(update)
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id, title")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, error: `수정 실패: ${error.message}` },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "자료를 찾을 수 없어요" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, material: { id: data.id, title: data.title } });
}

/**
 * 자료 삭제 — DB 행 + Storage 원본 파일 둘 다.
 * Storage 실패해도 DB는 지움 (사용자 시야에서는 사라지는 게 우선,
 * 고아 파일은 백오피스에서 정리 가능). DB 실패 시는 throw.
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<OkResponse | ErrResponse>> {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) {
    return NextResponse.json({ ok: false, error: "로그인이 필요해요" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "id 누락" }, { status: 400 });
  }

  const admin = getAdminSupabase();

  // Storage path 미리 조회 — DB 지운 다음엔 못 찾음
  const { data: row, error: fetchErr } = await admin
    .from("materials")
    .select("storage_path")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json(
      { ok: false, error: `조회 실패: ${fetchErr.message}` },
      { status: 500 },
    );
  }
  if (!row) {
    return NextResponse.json({ ok: false, error: "자료를 찾을 수 없어요" }, { status: 404 });
  }

  const { error: delErr, count } = await admin
    .from("materials")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("owner_id", ownerId);

  if (delErr) {
    return NextResponse.json(
      { ok: false, error: `삭제 실패: ${delErr.message}` },
      { status: 500 },
    );
  }
  if (!count) {
    return NextResponse.json({ ok: false, error: "자료를 찾을 수 없어요" }, { status: 404 });
  }

  // Storage 정리 — 실패해도 DB 트랜잭션은 이미 완료됐고 사용자 화면에선 사라짐
  if (row.storage_path) {
    await deleteMaterialFile(row.storage_path);
  }

  return NextResponse.json({ ok: true });
}
