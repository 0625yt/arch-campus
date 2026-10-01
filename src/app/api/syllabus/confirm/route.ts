import { NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { validateEventRange } from "@/lib/calendar-event-time";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const EventInput = z
  .object({
    kind: z.enum(["exam", "assignment", "presentation", "class", "etc"]),
    title: z.string().min(1).max(120),
    notes: z.string().max(500).nullable().optional(),
    startsAt: z.string().min(8).max(40),
    endsAt: z.string().min(8).max(40).nullable().optional(),
    allDay: z.boolean().default(true),
    weightPercent: z.number().min(0).max(100).nullable().optional(),
    confidence: z.number().min(0).max(1).default(0.7),
  })
  .superRefine((event, ctx) => {
    const rangeError = validateEventRange(event.startsAt, event.endsAt ?? null, {
      allowDateOnly: event.allDay,
    });
    if (rangeError) {
      ctx.addIssue({ code: "custom", path: ["startsAt"], message: rangeError });
    }
  });

const RequestBody = z.object({
  courseId: z.string().uuid(),
  sourceMaterialId: z.string().uuid().nullable().optional(),
  events: z.array(EventInput).min(0).max(60),
});

interface OkResponse {
  ok: true;
  inserted: number;
  skippedClassOverlap?: number;
  skippedDuplicates?: number;
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

  if (body.sourceMaterialId) {
    const { data: material, error: materialErr } = await admin
      .from("materials")
      .select("id")
      .eq("id", body.sourceMaterialId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (materialErr) {
      return NextResponse.json(
        { ok: false, error: `자료 확인 실패: ${materialErr.message}` },
        { status: 500 },
      );
    }
    if (!material) {
      return NextResponse.json({ ok: false, error: "자료를 찾을 수 없어요" }, { status: 404 });
    }
  }

  if (body.events.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 });
  }

  // 시간표(반복 class)가 이미 있는 과목이면, 강의계획서 class는 중복으로 간주하고 스킵.
  const { data: classProbe } = await admin
    .from("events")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("course_id", body.courseId)
    .eq("kind", "class")
    .limit(1);
  const hasTimetableClass = (classProbe?.length ?? 0) > 0;

  const afterClassPolicy = hasTimetableClass
    ? body.events.filter((e) => e.kind !== "class")
    : body.events;
  const skippedClassOverlap = body.events.length - afterClassPolicy.length;
  if (afterClassPolicy.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0, skippedClassOverlap, skippedDuplicates: 0 });
  }

  const dateKeys = afterClassPolicy.map((e) => isoToKstDateKey(e.startsAt)).filter(Boolean);
  const minDate = dateKeys.sort()[0];
  const maxDate = dateKeys.sort()[dateKeys.length - 1];
  const fromDate = minDate ? shiftDateKey(minDate, -1) : null;
  const toDate = maxDate ? shiftDateKey(maxDate, 1) : null;

  let existing: Array<{ kind: string; title: string; starts_at: string }> = [];
  if (fromDate && toDate) {
    const { data } = await admin
      .from("events")
      .select("kind, title, starts_at")
      .eq("owner_id", ownerId)
      .eq("course_id", body.courseId)
      .gte("starts_at", `${fromDate}T00:00:00+09:00`)
      .lte("starts_at", `${toDate}T23:59:59+09:00`)
      .in("kind", Array.from(new Set(afterClassPolicy.map((e) => e.kind))));
    existing = data ?? [];
  }

  const existingSignatures = new Set(
    existing.map((row) => makeSignature(row.kind, row.title, row.starts_at)),
  );
  const deduped = afterClassPolicy.filter((e) => {
    const sig = makeSignature(e.kind, e.title, e.startsAt);
    if (existingSignatures.has(sig)) return false;
    existingSignatures.add(sig);
    return true;
  });
  const skippedDuplicates = afterClassPolicy.length - deduped.length;
  if (deduped.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0, skippedClassOverlap, skippedDuplicates });
  }

  const rows = deduped.map((e) => ({
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

  return NextResponse.json({
    ok: true,
    inserted: rows.length,
    skippedClassOverlap,
    skippedDuplicates,
  });
}

function makeSignature(kind: string, title: string, startsAt: string): string {
  const dateKey = isoToKstDateKey(startsAt) ?? "";
  return `${kind}|${normalizeTitle(title)}|${dateKey}`;
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function isoToKstDateKey(iso: string): string | null {
  if (!iso) return null;
  if (!iso.includes("T")) return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
}

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
