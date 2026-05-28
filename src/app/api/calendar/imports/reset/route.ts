import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const RequestBody = z.object({
  scope: z.enum(["timetable", "syllabus", "all"]),
});

type OkResponse = {
  ok: true;
  deletedEvents: number;
  updatedCourses: number;
};

type ErrResponse = {
  ok: false;
  error: string;
};

export async function POST(req: Request): Promise<NextResponse<OkResponse | ErrResponse>> {
  let ownerId: string;
  try {
    ownerId = await getOwnerId();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    throw e;
  }

  let body: z.infer<typeof RequestBody>;
  try {
    body = RequestBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `요청 형식 오류: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 400 },
    );
  }

  const admin = getAdminSupabase();
  const tools =
    body.scope === "all"
      ? ["timetable", "syllabus"]
      : body.scope === "timetable"
        ? ["timetable"]
        : ["syllabus"];

  const { data: generationRows, error: generationError } = await admin
    .from("generations")
    .select("material_id")
    .eq("owner_id", ownerId)
    .in("tool", tools)
    .not("material_id", "is", null);

  if (generationError) {
    return NextResponse.json(
      { ok: false, error: `자료 기록을 찾지 못했어요: ${generationError.message}` },
      { status: 500 },
    );
  }

  const sourceMaterialIds = Array.from(
    new Set((generationRows ?? []).map((row) => row.material_id).filter(Boolean) as string[]),
  );

  if (sourceMaterialIds.length === 0) {
    return NextResponse.json({ ok: true, deletedEvents: 0, updatedCourses: 0 });
  }

  const { data: eventRows, error: eventSelectError } = await admin
    .from("events")
    .select("id, course_id")
    .eq("owner_id", ownerId)
    .in("source_material_id", sourceMaterialIds);

  if (eventSelectError) {
    return NextResponse.json(
      { ok: false, error: `일정 기록을 찾지 못했어요: ${eventSelectError.message}` },
      { status: 500 },
    );
  }

  const affectedCourseIds = Array.from(
    new Set((eventRows ?? []).map((row) => row.course_id).filter(Boolean) as string[]),
  );

  const { error: deleteError } = await admin
    .from("events")
    .delete()
    .eq("owner_id", ownerId)
    .in("source_material_id", sourceMaterialIds);

  if (deleteError) {
    return NextResponse.json(
      { ok: false, error: `일정을 초기화하지 못했어요: ${deleteError.message}` },
      { status: 500 },
    );
  }

  let updatedCourses = 0;
  if (affectedCourseIds.length > 0 && (body.scope === "timetable" || body.scope === "all")) {
    const { error: courseUpdateError } = await admin
      .from("courses")
      .update({
        schedule: null,
        term_start: null,
        term_end: null,
      })
      .eq("owner_id", ownerId)
      .in("id", affectedCourseIds);

    if (courseUpdateError) {
      return NextResponse.json(
        { ok: false, error: `과목 시간표를 비우지 못했어요: ${courseUpdateError.message}` },
        { status: 500 },
      );
    }
    updatedCourses = affectedCourseIds.length;
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/today");
  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard/study");

  return NextResponse.json({
    ok: true,
    deletedEvents: eventRows?.length ?? 0,
    updatedCourses,
  });
}
