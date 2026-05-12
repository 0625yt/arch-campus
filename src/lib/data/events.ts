import "server-only";
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
  kind: EventRow["kind"];
  title: string;
  notes: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  weightPercent: number | null;
  confidence: number | null;
  confirmed: boolean;
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
  courses: {
    id: string;
    name: string;
    color: string | null;
    term_start: string | null;
  } | null;
}

function mapEvent(row: EventJoinRaw): EventView {
  return {
    id: row.id,
    courseId: row.course_id,
    courseName: row.courses?.name ?? null,
    courseColor: row.courses?.color ?? null,
    courseTermStart: row.courses?.term_start ?? null,
    kind: row.kind,
    title: row.title,
    notes: row.notes,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    allDay: row.all_day,
    weightPercent: row.weight_percent,
    confidence: row.confidence,
    confirmed: row.confirmed,
  };
}

const SELECT_COLS =
  "id, course_id, kind, title, notes, starts_at, ends_at, all_day, weight_percent, confidence, confirmed, courses(id, name, color, term_start)";

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
    .gte("starts_at", opts.fromIso)
    .lt("starts_at", opts.toIso)
    .order("starts_at", { ascending: true });

  if (error || !data) return [];
  return (data as unknown as EventJoinRaw[]).map(mapEvent);
}

export async function listUpcomingEvents(opts: {
  ownerId: string;
  limit?: number;
}): Promise<EventView[]> {
  const admin = getAdminSupabase();
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("events")
    .select(SELECT_COLS)
    .eq("owner_id", opts.ownerId)
    .gte("starts_at", nowIso)
    .order("starts_at", { ascending: true })
    .limit(opts.limit ?? 8);

  if (error || !data) return [];
  return (data as unknown as EventJoinRaw[]).map(mapEvent);
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
