import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { COURSE_GRADES, SEMESTER_TERMS } from "@/lib/academic";
import { tryGetOwnerId } from "@/lib/auth";
import { type CourseListItem, listCoursesWithMaterialCount } from "@/lib/data/materials";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

interface OkResponse {
  ok: true;
  courses: CourseListItem[];
}

interface CreateOk {
  ok: true;
  course: { id: string; name: string };
}

interface ErrResponse {
  ok: false;
  error: string;
}

export async function GET(): Promise<NextResponse<OkResponse | ErrResponse>> {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) {
    return NextResponse.json({ ok: false, error: "로그인이 필요해요" }, { status: 401 });
  }
  const courses = await listCoursesWithMaterialCount({ ownerId });
  return NextResponse.json({ ok: true, courses });
}

const PALETTE = ["#7aa6d6", "#cca06b", "#7fb38c", "#a08bc4", "#e0445e", "#5b8a8a"] as const;

const CreateBody = z
  .object({
    name: z.string().min(1).max(60),
    category: z.enum(["semester", "personal"]).default("personal"),
    professor: z.string().max(60).nullable().optional(),
    location: z.string().max(120).nullable().optional(),
    semesterYear: z.number().int().min(2000).max(2100).nullable().optional(),
    semesterTerm: z.enum(SEMESTER_TERMS).nullable().optional(),
    credits: z.number().min(0).max(30).multipleOf(0.5).nullable().optional(),
    grade: z.enum(COURSE_GRADES).nullable().optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.category !== "semester") return;
    if (!value.semesterYear) {
      ctx.addIssue({ code: "custom", path: ["semesterYear"], message: "학기 연도가 필요해요" });
    }
    if (!value.semesterTerm) {
      ctx.addIssue({ code: "custom", path: ["semesterTerm"], message: "학기가 필요해요" });
    }
  });

/**
 * 개인 공부 주제와 직접 입력하는 학기 강의를 생성.
 * 시간표 파일이 없어도 성적·학점 관리를 시작할 수 있다.
 */
export async function POST(req: Request): Promise<NextResponse<CreateOk | ErrResponse>> {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) {
    return NextResponse.json({ ok: false, error: "로그인이 필요해요" }, { status: 401 });
  }

  let body: z.infer<typeof CreateBody>;
  try {
    body = CreateBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `입력 검증 실패: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 400 },
    );
  }

  const name = body.name.trim();
  if (name.length === 0) {
    return NextResponse.json({ ok: false, error: "이름을 적어주세요" }, { status: 400 });
  }

  const admin = getAdminSupabase();
  let duplicateQuery = admin
    .from("courses")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("name", name)
    .eq("archived", false)
    .eq("category", body.category);
  if (body.category === "semester") {
    duplicateQuery = duplicateQuery
      .eq("semester_year", body.semesterYear as number)
      .eq("semester_term", body.semesterTerm!);
  }
  const { data: existing } = await duplicateQuery.limit(1).maybeSingle();

  if (existing) {
    return NextResponse.json(
      {
        ok: false,
        error:
          body.category === "semester"
            ? `이 학기에 "${name}" 과목이 이미 있어요`
            : `"${name}" 같은 이름의 주제가 이미 있어요`,
      },
      { status: 409 },
    );
  }

  // 색은 지정 안 받으면 기존 개수 기반으로 팔레트 순환
  let color = body.color;
  if (!color) {
    const { count } = await admin
      .from("courses")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId);
    color = PALETTE[(count ?? 0) % PALETTE.length];
  }

  const { data: created, error } = await admin
    .from("courses")
    .insert({
      owner_id: ownerId,
      name,
      category: body.category,
      color,
      professor: body.professor?.trim() || null,
      location: body.location?.trim() || null,
      semester_year: body.category === "semester" ? body.semesterYear : null,
      semester_term: body.category === "semester" ? body.semesterTerm : null,
      credits: body.category === "semester" ? (body.credits ?? 3) : null,
      grade: body.category === "semester" ? (body.grade ?? null) : null,
    })
    .select("id, name")
    .single();

  if (error || !created) {
    return NextResponse.json(
      { ok: false, error: `과목을 만들지 못했어요: ${error?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/grades");
  revalidatePath("/dashboard/study", "layout");
  return NextResponse.json({ ok: true, course: { id: created.id, name: created.name } });
}
