import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { tryGetOwnerId } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

export const runtime = "nodejs";

type EventInsert = Database["public"]["Tables"]["events"]["Insert"];

interface OkResponse {
  ok: true;
  event: { id: string; title: string };
}

interface ErrResponse {
  ok: false;
  error: string;
}

/**
 * 단발성 일정 직접 추가용. class kind는 받지 않음 — 그건 시간표 업로드 경로의 책임.
 *
 * 사용 흐름:
 *   - 강의계획서 없는 과목의 시험·과제 직접 입력
 *   - "내일 동아리 모임" 같은 etc 일정
 *   - course_id는 옵셔널 — 있으면 캘린더에 컬러 매칭, 없으면 미분류
 */
const CreateBody = z
  .object({
    course_id: z.string().uuid().nullable().optional(),
    kind: z.enum(["exam", "assignment", "presentation", "etc"]),
    title: z.string().min(1).max(120),
    notes: z.string().max(2000).nullable().optional(),
    starts_at: z.string().datetime(),
    ends_at: z.string().datetime().nullable().optional(),
    all_day: z.boolean().optional().default(false),
    weight_percent: z.number().min(0).max(100).nullable().optional(),
  })
  .strict();

export async function POST(req: Request): Promise<NextResponse<OkResponse | ErrResponse>> {
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

  const title = body.title.trim();
  if (!title) {
    return NextResponse.json({ ok: false, error: "제목을 적어주세요" }, { status: 400 });
  }

  const admin = getAdminSupabase();

  // course_id 있으면 본인 소유 강의인지 확인
  if (body.course_id) {
    const { data: course } = await admin
      .from("courses")
      .select("id")
      .eq("id", body.course_id)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (!course) {
      return NextResponse.json({ ok: false, error: "강의를 찾을 수 없어요" }, { status: 404 });
    }
  }

  const insert: EventInsert = {
    owner_id: ownerId,
    course_id: body.course_id ?? null,
    kind: body.kind,
    title,
    notes: body.notes?.trim() ? body.notes.trim() : null,
    starts_at: body.starts_at,
    ends_at: body.ends_at ?? null,
    all_day: body.all_day ?? false,
    weight_percent: body.weight_percent ?? null,
    confirmed: true, // 사용자가 직접 입력 = 무조건 확정
  };

  const { data, error } = await admin
    .from("events")
    .insert(insert)
    .select("id, title")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: `생성 실패: ${error?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/calendar");
  return NextResponse.json({ ok: true, event: { id: data.id, title: data.title } });
}
