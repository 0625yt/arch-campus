import { tryGetOwnerId } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) return Response.json({ ok: false, error: "로그인이 필요해요." }, { status: 401 });
  const admin = getAdminSupabase();
  const [
    profile,
    courses,
    materials,
    quizzes,
    attempts,
    events,
    goals,
    reviewCards,
    reviewLogs,
    threads,
    messages,
  ] = await Promise.all([
    admin.from("profiles").select("*").eq("id", ownerId).maybeSingle(),
    admin.from("courses").select("*").eq("owner_id", ownerId).order("created_at"),
    admin
      .from("materials")
      .select(
        "id, course_id, title, type, original_filename, mime_type, page_count, full_text, summary_payload, summary_keywords, uploaded_at, last_summarized_at",
      )
      .eq("owner_id", ownerId)
      .order("uploaded_at"),
    admin.from("quizzes").select("*").eq("owner_id", ownerId).order("created_at"),
    admin.from("quiz_attempts").select("*").eq("owner_id", ownerId).order("created_at"),
    admin.from("events").select("*").eq("owner_id", ownerId).order("starts_at"),
    admin.from("semester_goals").select("*").eq("owner_id", ownerId).order("semester_year"),
    admin.from("review_cards").select("*").eq("owner_id", ownerId).order("due_at"),
    admin.from("review_logs").select("*").eq("owner_id", ownerId).order("reviewed_at"),
    admin
      .from("chat_threads")
      .select(
        "id, material_id, course_id, title, material_snapshot_chars, created_at, updated_at, last_message_at",
      )
      .eq("owner_id", ownerId)
      .order("created_at"),
    admin
      .from("chat_messages")
      .select("thread_id, role, content, citations, created_at")
      .eq("owner_id", ownerId)
      .order("created_at"),
  ]);
  const results = [
    profile,
    courses,
    materials,
    quizzes,
    attempts,
    events,
    goals,
    reviewCards,
    reviewLogs,
    threads,
    messages,
  ];
  if (results.some((result) => result.error)) {
    return Response.json(
      { ok: false, error: "데이터를 모으는 중 오류가 발생했어요." },
      { status: 500 },
    );
  }
  const exportedAt = new Date().toISOString();
  const archive = {
    format: "arch-campus-export-v1",
    exportedAt,
    profile: profile.data,
    courses: courses.data ?? [],
    materials: materials.data ?? [],
    quizzes: quizzes.data ?? [],
    attempts: attempts.data ?? [],
    events: events.data ?? [],
    semesterGoals: goals.data ?? [],
    reviewCards: reviewCards.data ?? [],
    reviewLogs: reviewLogs.data ?? [],
    chatThreads: threads.data ?? [],
    chatMessages: messages.data ?? [],
  };
  return new Response(JSON.stringify(archive, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="arch-data-${exportedAt.slice(0, 10)}.json"`,
      "cache-control": "private, no-store",
    },
  });
}
