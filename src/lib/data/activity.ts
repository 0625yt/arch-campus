import "server-only";
import { listRecentAttempts, type RecentAttempt } from "@/lib/data/attempts";
import { getAdminSupabase } from "@/lib/supabase/admin";

/**
 * 최근 활동 — generations + quiz_attempts를 통합한 timeline.
 * History 페이지·Today 페이지가 공유.
 */

export interface Activity {
  id: string;
  kind:
    | "summarize"
    | "quiz"
    | "syllabus"
    | "presentation"
    | "exam-cram"
    | "report-checklist"
    | "chat"
    | "wizard"
    | "attempt";
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
  materials: {
    id: string;
    title: string;
    course_id: string | null;
    courses: { name: string } | null;
  } | null;
}

const GENERATION_LABEL: Record<string, string> = {
  summarize: "요약",
  quiz: "문제",
  syllabus: "강의계획서",
  presentation: "발표",
  "wizard-assignment": "과제",
  "wizard-exam": "시험",
  "wizard-cram": "벼락치기",
  "report-checklist": "과제 체크",
  "post-mortem": "회고",
  chat: "자료 챗",
  "chat-free": "코치 챗",
};

const KIND_FOR_TOOL: Record<string, Activity["kind"]> = {
  summarize: "summarize",
  quiz: "quiz",
  syllabus: "syllabus",
  presentation: "presentation",
  "wizard-cram": "exam-cram",
  "report-checklist": "report-checklist",
  chat: "chat",
  "chat-free": "chat",
};

export async function getRecentActivities(opts: {
  ownerId: string;
  limit?: number;
}): Promise<Activity[]> {
  const limit = opts.limit ?? 20;
  const admin = getAdminSupabase();

  const [{ data: gens }, attempts] = await Promise.all([
    admin
      .from("generations")
      .select(
        "id, tool, material_id, cost_usd, status, payload, created_at, materials(id, title, course_id, courses(name))",
      )
      .eq("owner_id", opts.ownerId)
      .eq("status", "ok")
      .order("created_at", { ascending: false })
      .limit(limit),
    listRecentAttempts({ ownerId: opts.ownerId, limit }),
  ]);

  const list: Activity[] = [];

  for (const row of (gens ?? []) as unknown as GenerationRow[]) {
    list.push(mapGeneration(row));
  }
  for (const row of attempts) {
    list.push(mapAttempt(row));
  }

  list.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
  return list.slice(0, limit);
}

function mapGeneration(row: GenerationRow): Activity {
  const kind = KIND_FOR_TOOL[row.tool] ?? "wizard";
  const kindLabel = GENERATION_LABEL[row.tool] ?? row.tool;
  const title = titleFor(row);
  const href = hrefFor(row);

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

function titleFor(row: GenerationRow): string {
  // 위저드는 payload에 입력 메타가 있음 — 자료 제목 대신 사용자 입력 요약 보여줌
  if (row.tool === "presentation") {
    const topic = typeof row.payload?.topic === "string" ? row.payload.topic : null;
    if (topic) return topic;
  }
  if (row.tool === "wizard-cram") {
    const subject = typeof row.payload?.subject === "string" ? row.payload.subject : null;
    if (subject) return subject;
  }
  if (row.tool === "report-checklist") {
    const assignmentTitle =
      typeof row.payload?.assignmentTitle === "string" ? row.payload.assignmentTitle : null;
    if (assignmentTitle) return assignmentTitle;
  }
  if (row.tool === "chat-free") {
    const userMessage =
      typeof row.payload?.userMessage === "string" ? row.payload.userMessage : null;
    if (userMessage) return userMessage.slice(0, 80);
  }
  return row.materials?.title ?? "(자료 없음)";
}

function hrefFor(row: GenerationRow): string {
  // 자유 챗 — 챗 페이지로
  if (row.tool === "chat-free") return "/dashboard/chat";
  // 위저드 — 결과 재방문 페이지로
  const WIZARDS = new Set([
    "presentation",
    "wizard-cram",
    "wizard-assignment",
    "wizard-exam",
    "report-checklist",
    "post-mortem",
  ]);
  if (WIZARDS.has(row.tool)) return `/dashboard/history/${row.id}`;
  // 자료 기반(summarize·quiz·자료 챗) — 자료 페이지로
  const courseName = row.materials?.courses?.name;
  if (courseName && row.materials) {
    return `/dashboard/study/${encodeURIComponent(courseName)}/${row.materials.id}`;
  }
  return `/dashboard/history/${row.id}`;
}

function mapAttempt(row: RecentAttempt): Activity {
  const title = row.quizTitle;
  const detail = `정답률 ${Math.round((row.score / Math.max(row.total, 1)) * 100)}% · ${row.score}/${row.total}`;
  const href = `/dashboard/quiz/${row.quizId}/result/${row.attemptId}`;
  return {
    id: `att-${row.attemptId}`,
    kind: "attempt",
    kindLabel: "풀이",
    title,
    detail,
    createdAt: row.attemptedAt,
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
  if (tool === "presentation") {
    const audience = typeof payload.audience === "string" ? payload.audience : null;
    const durationMin = typeof payload.durationMin === "number" ? payload.durationMin : null;
    if (audience && durationMin) return `${durationMin}분 · 청중 ${audience}`;
  }
  if (tool === "wizard-cram") {
    const remainingMin = typeof payload.remainingMin === "number" ? payload.remainingMin : null;
    if (remainingMin) {
      const h = Math.floor(remainingMin / 60);
      const m = remainingMin % 60;
      const label = h === 0 ? `${m}분` : m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
      return `남은 ${label} 기준 계획`;
    }
  }
  if (tool === "report-checklist") {
    return "교수 공지 체크리스트";
  }
  return null;
}
