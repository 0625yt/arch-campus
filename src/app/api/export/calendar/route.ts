import { tryGetOwnerId } from "@/lib/auth";
import { createIcalendar } from "@/lib/ical";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) return Response.json({ ok: false, error: "로그인이 필요해요." }, { status: 401 });
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from("events")
    .select(
      "id, title, notes, starts_at, ends_at, all_day, location, recurrence_rule, reminder_minutes",
    )
    .eq("owner_id", ownerId)
    .order("starts_at", { ascending: true });
  if (error)
    return Response.json({ ok: false, error: "일정을 내보내지 못했어요." }, { status: 500 });
  const ical = createIcalendar(
    (data ?? []).map((event) => ({
      id: event.id,
      title: event.title,
      notes: event.notes,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      allDay: event.all_day,
      location: event.location,
      recurrenceRule: event.recurrence_rule,
      reminderMinutes: event.reminder_minutes,
    })),
  );
  return new Response(ical, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="arch-calendar-${new Date().toISOString().slice(0, 10)}.ics"`,
      "cache-control": "private, no-store",
    },
  });
}
