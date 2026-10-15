import { z } from "zod";
import { addDaysToDateKey, dateKeyToDayNumber, kstDateKey } from "@/lib/kst";

const DateKey = z.iso.date();
export const STUDY_SCOPE_MAX = 200;
export const StudyTaskSchema = z.object({
  id: z.string().uuid(),
  materialId: z.string().uuid(),
  kind: z.enum(["study", "practice", "review"]),
  title: z.string().min(1).max(240),
  minutes: z.number().int().min(5).max(15),
  status: z.enum(["pending", "done"]),
  notBefore: DateKey,
  completedAt: z.iso.datetime().nullable(),
  reflection: z.string().max(300),
});
export const StudyPlanSchema = z.object({
  id: z.string().uuid(),
  courseId: z.string().uuid(),
  title: z.string().min(1).max(120),
  targetDate: DateKey,
  scope: z.string().max(STUDY_SCOPE_MAX),
  eventId: z.string().uuid().nullable(),
  materialIds: z.array(z.string().uuid()).min(1).max(6),
  createdAt: z.iso.datetime(),
  archived: z.boolean(),
  tasks: z.array(StudyTaskSchema).min(1).max(18),
});
export const StudyWorkspaceSchema = z.object({
  revision: z.number().int().min(0),
  dailyMinutes: z.number().int().min(15).max(180),
  plans: z.array(StudyPlanSchema).max(30),
});
export type StudyTask = z.infer<typeof StudyTaskSchema>;
export type StudyPlan = z.infer<typeof StudyPlanSchema>;
export type StudyWorkspace = z.infer<typeof StudyWorkspaceSchema>;

export const StudyPlanAction = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create"),
      revision: z.number().int().min(0),
      courseId: z.string().uuid(),
      title: z.string().trim().min(1).max(120),
      targetDate: DateKey,
      scope: z.string().trim().max(STUDY_SCOPE_MAX),
      materialIds: z.array(z.string().uuid()).min(1).max(6),
      eventId: z.string().uuid().nullable().default(null),
    })
    .strict(),
  z
    .object({
      action: z.literal("budget"),
      revision: z.number().int().min(0),
      dailyMinutes: z.number().int().min(15).max(180),
    })
    .strict(),
  z
    .object({
      action: z.enum(["complete", "defer", "undo"]),
      revision: z.number().int().min(0),
      planId: z.string().uuid(),
      taskId: z.string().uuid(),
      reflection: z.string().trim().max(300).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("archive"),
      revision: z.number().int().min(0),
      planId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal("remove"),
      revision: z.number().int().min(0),
      planId: z.string().uuid(),
    })
    .strict(),
]);
export type StudyAction = z.infer<typeof StudyPlanAction>;
export interface StudyCatalog {
  courses: { id: string; name: string }[];
  materials: { id: string; courseId: string; title: string }[];
  events: { id: string; courseId: string; title: string; date: string; notes: string }[];
  dueReview: { count: number; quizId: string | null };
}
export interface ScheduledStudyTask {
  plan: StudyPlan;
  task: StudyTask;
  date: string | null;
}
export const emptyStudyWorkspace = (): StudyWorkspace => ({
  revision: 0,
  dailyMinutes: 45,
  plans: [],
});

export function validateStudyTarget(target: string, today: string): string | null {
  const days = dateKeyToDayNumber(target) - dateKeyToDayNumber(today);
  if (!Number.isFinite(days) || days < 0 || days > 90)
    return "목표 날짜는 오늘부터 90일 안으로 정해주세요.";
  return null;
}

export function createStudyTasks(
  materials: { id: string; title: string }[],
  today: string,
  makeId: () => string,
): StudyTask[] {
  return materials.flatMap((material) =>
    (
      [
        ["study", "핵심 개념과 원문 확인", 15],
        ["practice", "5문제로 이해 점검", 10],
        ["review", "헷갈린 개념을 내 말로 설명", 5],
      ] as const
    ).map(([kind, label, minutes]) => ({
      id: makeId(),
      materialId: material.id,
      kind,
      title: `${material.title.slice(0, 160)} · ${label}`,
      minutes,
      status: "pending",
      notBefore: today,
      completedAt: null,
      reflection: "",
    })),
  );
}

/** A shared daily budget prevents independent exams from overbooking the same day. */
export function scheduleStudyTasks(
  workspace: StudyWorkspace,
  today: string = kstDateKey(new Date()),
): ScheduledStudyTask[] {
  const used = new Map<string, number>();
  const scheduled: ScheduledStudyTask[] = [];
  const plans = workspace.plans
    .filter((plan) => !plan.archived)
    .sort(
      (a, b) => a.targetDate.localeCompare(b.targetDate) || a.createdAt.localeCompare(b.createdAt),
    );
  for (const plan of workspace.plans) {
    for (const task of plan.tasks.filter((task) => task.status === "done")) {
      const date = task.completedAt ? kstDateKey(task.completedAt) : today;
      used.set(date, (used.get(date) ?? 0) + task.minutes);
      scheduled.push({ plan, task, date });
    }
  }
  for (const plan of plans) {
    let previousDate = today;
    for (const task of plan.tasks.filter((task) => task.status === "pending")) {
      let date = [today, previousDate, task.notBefore].sort().at(-1)!;
      while (
        date <= plan.targetDate &&
        (used.get(date) ?? 0) + task.minutes > workspace.dailyMinutes
      )
        date = addDaysToDateKey(date, 1);
      if (date > plan.targetDate) {
        scheduled.push({ plan, task, date: null });
        previousDate = date;
        continue;
      }
      used.set(date, (used.get(date) ?? 0) + task.minutes);
      previousDate = date;
      scheduled.push({ plan, task, date });
    }
  }
  return scheduled;
}

export function applyStudyTaskAction(
  workspace: StudyWorkspace,
  action: Extract<StudyAction, { action: "complete" | "defer" | "undo" }>,
  now: Date,
): StudyWorkspace | null {
  const plan = workspace.plans.find((p) => p.id === action.planId && !p.archived);
  const task = plan?.tasks.find((t) => t.id === action.taskId);
  if (!plan || !task) return null;
  if (action.action === "defer" && task.status === "done") return null;
  if (action.action === "complete" && task.status === "done") return workspace;
  return {
    ...workspace,
    plans: workspace.plans.map((p) =>
      p.id !== plan.id
        ? p
        : {
            ...p,
            tasks: p.tasks.map((t) =>
              t.id !== task.id
                ? t
                : {
                    ...t,
                    status: action.action === "complete" ? "done" : "pending",
                    completedAt: action.action === "complete" ? now.toISOString() : null,
                    notBefore:
                      action.action === "defer"
                        ? addDaysToDateKey(kstDateKey(now), 1)
                        : t.notBefore,
                    reflection: action.reflection ?? t.reflection,
                  },
            ),
          },
    ),
  };
}

export function studyTaskHref(plan: StudyPlan, task: StudyTask): string {
  const params = new URLSearchParams({ studyPlan: plan.id });
  if (task.kind === "practice") {
    params.set("studyPractice", "1");
    params.set("studyTask", task.id);
  }
  return `/dashboard/study/${plan.courseId}/${task.materialId}?${params}`;
}

export function studyQuizHref(
  quizId: string,
  planId: string | null,
  taskId: string | null,
): string {
  const ids = z
    .object({ planId: z.string().uuid(), taskId: z.string().uuid() })
    .safeParse({ planId, taskId });
  if (!ids.success) return `/dashboard/quiz/${quizId}`;
  return `/dashboard/quiz/${quizId}?${new URLSearchParams({ studyPlan: ids.data.planId, studyTask: ids.data.taskId })}`;
}
