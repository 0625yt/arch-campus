import { NextResponse } from "next/server";
import { z } from "zod";
import { tryGetOwnerId } from "@/lib/auth";
import { listCoursesWithMaterialCount, type CourseListItem } from "@/lib/data/materials";
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

const CreateBody = z.object({
  name: z.string().min(1).max(60),
  /** 정규 강의 추가는 시간표 업로드로 — POST는 personal 전용 */
  category: z.literal("personal").default("personal"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

/**
 * 개인 공부 주제 (자격증·토익·공무원·개인 프로젝트) 직접 생성.
 *
 * 정규 강의는 시간표/강의계획서 업로드 경로에서만 만들어진다.
 * 그래서 이 엔드포인트는 category='personal' 만 허용.
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
  const { data: existing } = await admin
    .from("courses")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("name", name)
    .eq("archived", false)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { ok: false, error: `"${name}" 같은 이름의 주제가 이미 있어요` },
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
    })
    .select("id, name")
    .single();

  if (error || !created) {
    return NextResponse.json(
      { ok: false, error: `생성 실패: ${error?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, course: { id: created.id, name: created.name } });
}
