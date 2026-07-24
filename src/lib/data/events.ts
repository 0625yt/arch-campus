import "server-only";
import { isImportedClassInsideCourseTerm } from "@/lib/course-term";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

export interface EventView {
  id: string;
  courseId: string | null;
  courseName: string | null;
  courseColor: string | null;
  /** 학기 시작일 (ISO date) — 시간표 등록 시 박힘. N주차 계산용 */
  courseTermStart: string | null;
  /** 과목별 학기 종료일. 자동 시간표가 학기 밖으로 새는 것을 막는 경계. */
  courseTermEnd: string | null;
  kind: EventRow["kind"];
  title: string;
  notes: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  weightPercent: number | null;
  confidence: number | null;
  confirmed: boolean;
  /** 강의계획서·공지 등 이 일정이 나온 자료. 직접 입력 일정이면 null. */
  sourceMaterialId: string | null;
  sourceMaterialTitle: string | null;
  sourceMaterialType: Database["public"]["Tables"]["materials"]["Row"]["type"] | null;
  /** 일정별 색상 (#RRGGBB). NULL이면 courseColor → kindFallback 순. */
  color: string | null;
  /** 강의실·온라인 링크·장소. */
  location: string | null;
  /** iCalendar RRULE 문자열. NULL이면 단발성. */
  recurrenceRule: string | null;
  /** 시작 N분 전 알림. NULL이면 알림 없음. 0/10/60/1440 같은 값. */
  reminderMinutes: number | null;
}

interface EventJoinRaw {
  id: string;
  course_id: string | null;
  kind: EventRow["kind"];
  title: string;
  notes: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  weight_percent: number | null;
  confidence: number | null;
  confirmed: boolean;
  source_material_id: string | null;
  color: string | null;
  location: string | null;
  recurrence_rule: string | null;
  reminder_minutes: number | null;
  courses: {
    id: string;
    name: string;
    color: string | null;
    term_start: string | null;
    term_end: string | null;
  } | null;
}

function mapEvent(
  row: EventJoinRaw,
  sourceById?: Map<
    string,
    { title: string; type: Database["public"]["Tables"]["materials"]["Row"]["type"] }
  >,
): EventView {
  const source = row.source_material_id ? sourceById?.get(row.source_material_id) : null;
  return {
    id: row.id,
    courseId: row.course_id,
    courseName: row.courses?.name ?? null,
    courseColor: row.courses?.color ?? null,
    courseTermStart: row.courses?.term_start ?? null,
    courseTermEnd: row.courses?.term_end ?? null,
    kind: row.kind,
    title: row.title,
    notes: row.notes,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    allDay: row.all_day,
    weightPercent: row.weight_percent,
    confidence: row.confidence,
    confirmed: row.confirmed,
    sourceMaterialId: row.source_material_id,
    sourceMaterialTitle: source?.title ?? null,
    sourceMaterialType: source?.type ?? null,
    color: row.color,
    location: row.location,
    recurrenceRule: row.recurrence_rule,
    reminderMinutes: row.reminder_minutes,
  };
}

const SELECT_COLS =
  "id, course_id, kind, title, notes, starts_at, ends_at, all_day, weight_percent, confidence, confirmed, source_material_id, color, location, recurrence_rule, reminder_minutes, courses(id, name, color, term_start, term_end)";

export async function listEventsBetween(opts: {
  ownerId: string;
  fromIso: string;
  toIso: string;
}): Promise<EventView[]> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from("events")
    .select(SELECT_COLS)
    .eq("owner_id", opts.ownerId)
    .lt("starts_at", opts.toIso)
    // 범위 전에 시작해 범위 안까지 이어지는 종일·다일 일정도 포함한다.
    .or(`starts_at.gte.${opts.fromIso},ends_at.gte.${opts.fromIso}`)
    .order("starts_at", { ascending: true });

  if (error) throw new Error(`일정 범위 조회 실패: ${error.message}`);
  if (!data) return [];
  const rows = data as unknown as EventJoinRaw[];
  const sourceById = await loadSourceMaterialMap(opts.ownerId, rows);
  return rows.map((row) => mapEvent(row, sourceById)).filter(isImportedClassInsideCourseTerm);
}

export async function listUpcomingEvents(opts: {
  ownerId: string;
  limit?: number;
}): Promise<EventView[]> {
  const admin = getAdminSupabase();
  const nowIso = new Date().toISOString();
  const requestedLimit = opts.limit ?? 8;
  const { data, error } = await admin
    .from("events")
    .select(SELECT_COLS)
    .eq("owner_id", opts.ownerId)
    .gte("starts_at", nowIso)
    .order("starts_at", { ascending: true })
    // 레거시 학기 밖 수업을 거른 뒤에도 요청 개수를 채울 수 있게 여유 있게 읽는다.
    .limit(Math.min(100, Math.max(32, requestedLimit * 4)));

  if (error || !data) return [];
  const rows = data as unknown as EventJoinRaw[];
  const sourceById = await loadSourceMaterialMap(opts.ownerId, rows);
  return rows
    .map((row) => mapEvent(row, sourceById))
    .filter(isImportedClassInsideCourseTerm)
    .slice(0, requestedLimit);
}

async function loadSourceMaterialMap(
  ownerId: string,
  rows: EventJoinRaw[],
): Promise<
  Map<string, { title: string; type: Database["public"]["Tables"]["materials"]["Row"]["type"] }>
> {
  const ids = Array.from(
    new Set(rows.map((row) => row.source_material_id).filter((id): id is string => Boolean(id))),
  );
  if (ids.length === 0) return new Map();

  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from("materials")
    .select("id, title, type")
    .eq("owner_id", ownerId)
    .in("id", ids);

  if (error || !data) return new Map();
  return new Map(data.map((row) => [row.id, { title: row.title, type: row.type }]));
}

export async function deleteEvent(opts: { ownerId: string; eventId: string }): Promise<boolean> {
  const admin = getAdminSupabase();
  const { error } = await admin
    .from("events")
    .delete()
    .eq("id", opts.eventId)
    .eq("owner_id", opts.ownerId);
  return !error;
}
