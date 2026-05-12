import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";

/**
 * 최근 활동 — generations + quiz_attempts를 통합한 timeline.
 * History 페이지·Today 페이지가 공유.
 */

export interface Activity {
  id: string;
  kind: "summarize" | "quiz" | "syllabus" | "presentation" | "wizard" | "attempt";
  kindLabel: string;
  title: string;
  detail: string | null;
  createdAt: string;
  href: string;
}

interface GenerationRow {
  id: string;
  tool: string;
  material_id: string | null;
  cost_usd: number;
  status: string;
  payload: Record<string, unknown>;
  created_at: string;
  materials: { id: string; title: string; course_id: string | null } | null;
}

interface AttemptRow {
  id: string;
  quiz_id: string;
  score: number;
  total: number;
  created_at: string;
  quizzes: { id: string; title: string; material_id: string | null } | null;
}

const GENERATION_LABEL: Record<string, string> = {
  summarize: "요약",
  quiz: "문제",
  syllabus: "강의계획서",
  presentation: "발표",
  "wizard-assignment": "과제",
  "wizard-exam": "시험",
  "wizard-cram": "벼락치기",
  "post-mortem": "회고",
};

const KIND_FOR_TOOL: Record<string, Activity["kind"]> = {
  summarize: "summarize",
  quiz: "quiz",
  syllabus: "syllabus",
  presentation: "presentation",
};

export async function getRecentActivities(opts: {
  ownerId: string;
  limit?: number;
}): Promise<Activity[]> {
  const limit = opts.limit ?? 20;
  const admin = getAdminSupabase();

  const [{ data: gens }, { data: attempts }] = await Promise.all([
    admin
      .from("generations")
      .select(
        "id, tool, material_id, cost_usd, status, payload, created_at, materials(id, title, course_id)",
      )
      .eq("owner_id", opts.ownerId)
      .eq("status", "ok")
      .order("created_at", { ascending: false })
      .limit(limit),
    admin
      .from("quiz_attempts")
      .select("id, quiz_id, score, total, created_at, quizzes(id, title, material_id)")
      .eq("owner_id", opts.ownerId)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  const list: Activity[] = [];

  for (const row of (gens ?? []) as unknown as GenerationRow[]) {
    list.push(mapGeneration(row));
  }
  for (const row of (attempts ?? []) as unknown as AttemptRow[]) {
    list.push(mapAttempt(row));
  }

  list.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
  return list.slice(0, limit);
}

function mapGeneration(row: GenerationRow): Activity {
  const kind = KIND_FOR_TOOL[row.tool] ?? "wizard";
  const kindLabel = GENERATION_LABEL[row.tool] ?? row.tool;
  const title = row.materials?.title ?? "(자료 없음)";
  const href = row.materials
    ? `/dashboard/study/${encodeURIComponent("자료")}/${row.materials.id}`
    : "/dashboard/history";

  return {
    id: `gen-${row.id}`,
    kind,
    kindLabel,
    title,
    detail: detailFromPayload(row.tool, row.payload),
    createdAt: row.created_at,
    href,
  };
}

function mapAttempt(row: AttemptRow): Activity {
  const title = row.quizzes?.title ?? "(퀴즈)";
  const detail = `정답률 ${Math.round((row.score / Math.max(row.total, 1)) * 100)}% · ${row.score}/${row.total}`;
  const href = `/dashboard/quiz/${row.quiz_id}`;
  return {
    id: `att-${row.id}`,
    kind: "attempt",
    kindLabel: "풀이",
    title,
    detail,
    createdAt: row.created_at,
    href,
  };
}

function detailFromPayload(tool: string, payload: Record<string, unknown>): string | null {
  if (tool === "quiz" && typeof payload.questionCount === "number") {
    return `${payload.questionCount}문제 만들었어요`;
  }
  if (tool === "syllabus" && typeof payload.eventCount === "number") {
    return `일정 ${payload.eventCount}개 추출`;
  }
  return null;
}
