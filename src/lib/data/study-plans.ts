import "server-only";
import { kstDateKey, kstStartOfDay } from "@/lib/kst";
import {
  emptyStudyWorkspace,
  type StudyCatalog,
  type StudyWorkspace,
  StudyWorkspaceSchema,
} from "@/lib/study-plan";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import { listReviewQueue } from "./reviews";

export class StudyStorageError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function getStudyWorkspace(ownerId: string): Promise<StudyWorkspace> {
  const { data, error } = await getAdminSupabase()
    .from("study_workspaces")
    .select("daily_minutes, plans, revision")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error)
    throw new StudyStorageError(503, "공부 계획을 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
  if (!data) return emptyStudyWorkspace();
  const parsed = StudyWorkspaceSchema.safeParse({
    dailyMinutes: data.daily_minutes,
    plans: data.plans,
    revision: data.revision,
  });
  if (!parsed.success) throw new StudyStorageError(503, "저장된 공부 계획을 확인하지 못했어요.");
  return parsed.data;
}

export async function saveStudyWorkspace(
  ownerId: string,
  workspace: StudyWorkspace,
): Promise<StudyWorkspace> {
  const admin = getAdminSupabase();
  const checked = StudyWorkspaceSchema.parse(workspace);
  const payload = {
    owner_id: ownerId,
    daily_minutes: checked.dailyMinutes,
    plans: checked.plans as unknown as Json,
    revision: checked.revision + 1,
  };
  const result =
    checked.revision === 0
      ? await admin.from("study_workspaces").insert(payload).select("revision").single()
      : await admin
          .from("study_workspaces")
          .update(payload)
          .eq("owner_id", ownerId)
          .eq("revision", checked.revision)
          .select("revision")
          .maybeSingle();
  if (result.error?.code === "23505" || (!result.error && !result.data))
    throw new StudyStorageError(
      409,
      "다른 화면에서 계획이 바뀌었어요. 최신 계획을 불러온 뒤 다시 시도해주세요.",
    );
  if (result.error || !result.data)
    throw new StudyStorageError(
      503,
      "공부 계획을 저장하지 못했어요. 입력을 유지했으니 다시 시도해주세요.",
    );
  return { ...checked, revision: result.data.revision };
}

export async function getStudyCatalog(ownerId: string): Promise<StudyCatalog> {
  const admin = getAdminSupabase();
  const now = new Date();
  const [courses, materials, events, reviews] = await Promise.all([
    admin
      .from("courses")
      .select("id, name")
      .eq("owner_id", ownerId)
      .eq("archived", false)
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("materials")
      .select("id, course_id, title")
      .eq("owner_id", ownerId)
      .eq("type", "lecture")
      .order("uploaded_at", { ascending: false })
      .limit(300),
    admin
      .from("events")
      .select("id, course_id, title, starts_at, notes")
      .eq("owner_id", ownerId)
      .eq("kind", "exam")
      .eq("confirmed", true)
      .gte("starts_at", kstStartOfDay(now).toISOString())
      .order("starts_at")
      .limit(100),
    listReviewQueue(ownerId),
  ]);
  if (courses.error || materials.error || events.error)
    throw new StudyStorageError(503, "과목과 자료를 불러오지 못했어요. 다시 시도해주세요.");
  const due = reviews.filter((item) => Date.parse(item.dueAt) <= now.getTime());
  const courseIds = new Set((courses.data ?? []).map((course) => course.id));
  return {
    courses: courses.data ?? [],
    materials: (materials.data ?? []).flatMap((material) =>
      material.course_id && courseIds.has(material.course_id)
        ? [{ id: material.id, courseId: material.course_id, title: material.title }]
        : [],
    ),
    events: (events.data ?? []).flatMap((event) =>
      event.course_id && courseIds.has(event.course_id)
        ? [
            {
              id: event.id,
              courseId: event.course_id,
              title: event.title,
              date: kstDateKey(event.starts_at),
              notes: event.notes ?? "",
            },
          ]
        : [],
    ),
    dueReview: { count: due.length, quizId: due[0]?.quizId ?? null },
  };
}
