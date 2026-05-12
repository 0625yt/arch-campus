import { NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const EventInput = z.object({
  kind: z.enum(["exam", "assignment", "presentation", "class", "etc"]),
  title: z.string().min(1).max(120),
  notes: z.string().max(500).nullable().optional(),
  startsAt: z.string().min(8).max(40),
  endsAt: z.string().min(8).max(40).nullable().optional(),
  allDay: z.boolean().default(true),
  weightPercent: z.number().min(0).max(100).nullable().optional(),
  confidence: z.number().min(0).max(1).default(0.7),
});

const RequestBody = z.object({
  courseId: z.string().uuid(),
  sourceMaterialId: z.string().uuid().nullable().optional(),
  events: z.array(EventInput).min(0).max(60),
});

interface OkResponse {
  ok: true;
  inserted: number;
}

interface ErrResponse {
  ok: false;
  error: string;
}

/**
 * 강의계획서에서 추출한 events를 사용자가 검토·편집 후 일괄 등록.
 * 모두 confirmed = true로 박힘 (사용자가 명시적으로 승인했으니).
 */
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
    const json = await req.json();
    body = RequestBody.parse(json);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `요청 형식 오류: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 400 },
    );
  }

  const admin = getAdminSupabase();

  // 코스가 본인 거인지 검증
  const { data: course, error: courseErr } = await admin
    .from("courses")
    .select("id")
    .eq("id", body.courseId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (courseErr || !course) {
    return NextResponse.json({ ok: false, error: "코스를 찾을 수 없어요" }, { status: 404 });
  }

  if (body.events.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 });
  }

  const rows = body.events.map((e) => ({
    owner_id: ownerId,
    course_id: body.courseId,
    source_material_id: body.sourceMaterialId ?? null,
    kind: e.kind,
    title: e.title,
    notes: e.notes ?? null,
    starts_at: e.startsAt,
    ends_at: e.endsAt ?? null,
    all_day: e.allDay ?? true,
    weight_percent: e.weightPercent ?? null,
    confidence: e.confidence ?? 0.7,
    confirmed: true,
  }));

  const { error } = await admin.from("events").insert(rows);
  if (error) {
    return NextResponse.json(
      { ok: false, error: `events 저장 실패: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, inserted: rows.length });
}
