import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { COURSE_GRADES } from "@/lib/academic";
import { tryGetOwnerId } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

type CourseUpdate = Database["public"]["Tables"]["courses"]["Update"];

export const runtime = "nodejs";

function bustCourseCache() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/study", "layout");
  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard/grades");
}

interface OkResponse {
  ok: true;
  course?: { id: string; name: string };
}

interface ErrResponse {
  ok: false;
  error: string;
}

// 시간표 slot 한 줄: "월 09:00-10:50" — timetable-grid 파서가 받는 그 형식.
const SLOT_RE = /^[월화수목금토일]\s+\d{1,2}:\d{2}-\d{1,2}:\d{2}$/;

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
    credits: z.number().min(0.5).max(30).multipleOf(0.5).nullable().optional(),
    grade: z.enum(COURSE_GRADES).nullable().optional(),
    // 인라인 시간표 편집 — slots 통째 교체. null이면 schedule 비움.
    schedule: z.array(z.string().regex(SLOT_RE)).max(10).nullable().optional(),
  })
  .strict();

/**
 * 강의 이름·교수·강의실·시간·학점·등급을 소유자 범위에서 수정한다.
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
  if (body.credits !== undefined) update.credits = body.credits;
  if (body.grade !== undefined) update.grade = body.grade;
  if (body.schedule !== undefined) {
    update.schedule = body.schedule === null ? null : body.schedule;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: "수정할 항목이 없어요" }, { status: 400 });
  }

  const admin = getAdminSupabase();

  const { data: current } = await admin
    .from("courses")
    .select("category, semester_year, semester_term")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!current) {
    return NextResponse.json({ ok: false, error: "강의를 찾을 수 없어요" }, { status: 404 });
  }

  // 같은 학기 안에서만 이름 충돌을 막는다. 다른 학기의 동일 과목은 별도 성적 이력으로 보존한다.
  if (typeof update.name === "string") {
    const nextName = update.name;
    let duplicateQuery = admin
      .from("courses")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("name", nextName)
      .eq("archived", false)
      .eq("category", current.category)
      .neq("id", id);
    if (current.category === "semester") {
      const nextYear = current.semester_year;
      const nextTerm = current.semester_term;
      duplicateQuery =
        nextYear === null
          ? duplicateQuery.is("semester_year", null)
          : duplicateQuery.eq("semester_year", nextYear);
      duplicateQuery =
        nextTerm === null
          ? duplicateQuery.is("semester_term", null)
          : duplicateQuery.eq("semester_term", nextTerm);
    }
    const { data: dup } = await duplicateQuery.limit(1).maybeSingle();
    if (dup) {
      return NextResponse.json(
        { ok: false, error: `이 학기에 "${nextName}" 과목이 이미 있어요` },
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
    return NextResponse.json({ ok: false, error: `수정 실패: ${error.message}` }, { status: 500 });
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
    return NextResponse.json({ ok: false, error: `삭제 실패: ${error.message}` }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ ok: false, error: "강의를 찾을 수 없어요" }, { status: 404 });
  }

  bustCourseCache();
  return NextResponse.json({ ok: true });
}
