import { tryGetOwnerId } from "@/lib/auth";
import { collectExportRows } from "@/lib/export-rows";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) return Response.json({ ok: false, error: "로그인이 필요해요." }, { status: 401 });
  const admin = getAdminSupabase();
  let archiveData: Record<string, unknown>;
  try {
    const [
      profile,
      courses,
      materials,
      quizzes,
      attempts,
      events,
      goals,
      reflections,
      reviewCards,
      reviewLogs,
      threads,
      messages,
    ] = await Promise.all([
      admin.from("profiles").select("*").eq("id", ownerId).maybeSingle(),
      collectExportRows((from, to) =>
        admin
          .from("courses")
          .select("*")
          .eq("owner_id", ownerId)
          .order("created_at")
          .order("id")
          .range(from, to),
      ),
      collectExportRows((from, to) =>
        admin
          .from("materials")
          .select(
            "id, course_id, title, type, original_filename, mime_type, page_count, full_text, summary_payload, summary_keywords, uploaded_at, last_summarized_at",
          )
          .eq("owner_id", ownerId)
          .order("uploaded_at")
          .order("id")
          .range(from, to),
      ),
      collectExportRows((from, to) =>
        admin
          .from("quizzes")
          .select("*")
          .eq("owner_id", ownerId)
          .order("created_at")
          .order("id")
          .range(from, to),
      ),
      collectExportRows((from, to) =>
        admin
          .from("quiz_attempts")
          .select("*")
          .eq("owner_id", ownerId)
          .order("created_at")
          .order("id")
          .range(from, to),
      ),
      collectExportRows((from, to) =>
        admin
          .from("events")
          .select("*")
          .eq("owner_id", ownerId)
          .order("starts_at")
          .order("id")
          .range(from, to),
      ),
      collectExportRows((from, to) =>
        admin
          .from("semester_goals")
          .select("*")
          .eq("owner_id", ownerId)
          .order("semester_year")
          .order("id")
          .range(from, to),
      ),
      collectExportRows((from, to) =>
        admin
          .from("attempt_reflections")
          .select("*")
          .eq("owner_id", ownerId)
          .order("updated_at")
          .order("id")
          .range(from, to),
      ),
      collectExportRows((from, to) =>
        admin
          .from("review_cards")
          .select("*")
          .eq("owner_id", ownerId)
          .order("due_at")
          .order("id")
          .range(from, to),
      ),
      collectExportRows((from, to) =>
        admin
          .from("review_logs")
          .select("*")
          .eq("owner_id", ownerId)
          .order("reviewed_at")
          .order("id")
          .range(from, to),
      ),
      collectExportRows((from, to) =>
        admin
          .from("chat_threads")
          .select(
            "id, material_id, course_id, title, material_snapshot_chars, created_at, updated_at, last_message_at",
          )
          .eq("owner_id", ownerId)
          .order("created_at")
          .order("id")
          .range(from, to),
      ),
      collectExportRows((from, to) =>
        admin
          .from("chat_messages")
          .select("thread_id, role, content, citations, created_at")
          .eq("owner_id", ownerId)
          .order("created_at")
          .order("id")
          .range(from, to),
      ),
    ]);
    if (profile.error) throw new Error("profile export failed");
    archiveData = {
      profile: profile.data,
      courses,
      materials,
      quizzes,
      attempts,
      events,
      semesterGoals: goals,
      attemptReflections: reflections,
      reviewCards,
      reviewLogs,
      chatThreads: threads,
      chatMessages: messages,
    };
  } catch {
    return Response.json(
      { ok: false, error: "데이터를 모으는 중 오류가 발생했어요. 잠시 후 다시 내려받아 주세요." },
      { status: 500 },
    );
  }
  const exportedAt = new Date().toISOString();
  const archive = {
    format: "arch-campus-export-v1",
    exportedAt,
    ...archiveData,
  };
  return new Response(JSON.stringify(archive, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="arch-data-${exportedAt.slice(0, 10)}.json"`,
      "cache-control": "private, no-store",
    },
  });
}
