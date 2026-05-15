import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { tryGetOwnerId } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

type CourseUpdate = Database["public"]["Tables"]["courses"]["Update"];

export const runtime = "nodejs";

function bustCourseCache() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/study", "layout");
  revalidatePath("/dashboard/calendar");
}

interface OkResponse {
  ok: true;
  course?: { id: string; name: string };
}

interface ErrResponse {
  ok: false;
  error: string;
}

const PatchBody = z
  .object({
    name: z.string().min(1).max(80).optional(),
    professor: z.string().max(60).nullable().optional(),
    location: z.string().max(120).nullable().optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .nullable()
      .optional(),
    target_grade: z.enum(["A+", "A", "B+", "B"]).nullable().optional(),
  })
  .strict();

/**
 * 강의 일부 속성 수정. 시간표(slots)·학기·category는 여기서 손대지 않음 —
 * 그건 시간표 재업로드 흐름이 책임진다.
 */
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

  // 내용 정리 — 빈 문자열은 null로
  const update: CourseUpdate = {};
  if (body.name !== undefined) {
    const trimmed = body.name.trim();
    if (trimmed.length === 0) {
      return NextResponse.json({ ok: false, error: "이름은 비울 수 없어요" }, { status: 400 });
    }
    update.name = trimmed;
  }
  if (body.professor !== undefined) {
    update.professor = body.professor?.trim() ? body.professor.trim() : null;
  }
  if (body.location !== undefined) {
    update.location = body.location?.trim() ? body.location.trim() : null;
  }
  if (body.color !== undefined) update.color = body.color;
  if (body.target_grade !== undefined) update.target_grade = body.target_grade;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: "수정할 항목이 없어요" }, { status: 400 });
  }

  const admin = getAdminSupabase();

  // 이름 변경 시 같은 owner의 다른 활성 강의와 충돌 막기
  if (typeof update.name === "string") {
    const { data: dup } = await admin
      .from("courses")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("name", update.name)
      .eq("archived", false)
      .neq("id", id)
      .maybeSingle();
    if (dup) {
      return NextResponse.json(
        { ok: false, error: `"${update.name}" 같은 이름의 강의가 이미 있어요` },
        { status: 409 },
      );
    }
  }

  const { data, error } = await admin
    .from("courses")
    .update(update)
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id, name")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, error: `수정 실패: ${error.message}` },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "강의를 찾을 수 없어요" }, { status: 404 });
  }

  bustCourseCache();
  return NextResponse.json({ ok: true, course: { id: data.id, name: data.name } });
}

/**
 * 강의 삭제. 관련 events·materials는 cascade=set null이라 미분류로 남는다.
 * (사용자에게 확인받은 정책 — 한 학기 데이터 통째로 날리는 실수 방지)
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
  const { error, count } = await admin
    .from("courses")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("owner_id", ownerId);

  if (error) {
    return NextResponse.json(
      { ok: false, error: `삭제 실패: ${error.message}` },
      { status: 500 },
    );
  }
  if (!count) {
    return NextResponse.json({ ok: false, error: "강의를 찾을 수 없어요" }, { status: 404 });
  }

  bustCourseCache();
  return NextResponse.json({ ok: true });
}
