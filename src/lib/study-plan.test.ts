import { describe, expect, it } from "vitest";
import {
  applyStudyTaskAction,
  createStudyTasks,
  emptyStudyWorkspace,
  type StudyPlan,
  StudyPlanAction,
  scheduleStudyTasks,
  studyQuizHref,
  studyTaskHref,
  validateStudyTarget,
} from "./study-plan";

let sequence = 0;
const id = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
const today = "2026-10-08";
const now = new Date("2026-10-08T12:00:00Z");
function plan(date = "2026-10-10"): StudyPlan {
  return {
    id: id(),
    courseId: id(),
    title: "중간고사",
    targetDate: date,
    scope: "3~7주차",
    eventId: null,
    materialIds: [id()],
    createdAt: now.toISOString(),
    archived: false,
    tasks: createStudyTasks([{ id: id(), title: "3주차" }], today, id),
  };
}

describe("shared study planning", () => {
  it("never overbooks a shared daily budget across exams", () => {
    const workspace = { ...emptyStudyWorkspace(), dailyMinutes: 30, plans: [plan(), plan()] };
    const totals = new Map<string, number>();
    for (const item of scheduleStudyTasks(workspace, today)) {
      if (item.date) totals.set(item.date, (totals.get(item.date) ?? 0) + item.task.minutes);
    }
    expect([...totals.values()].every((minutes) => minutes <= 30)).toBe(true);
    expect([...totals.values()].reduce((a, b) => a + b, 0)).toBe(60);
  });
  it("prioritizes the nearer exam and keeps tasks in material order", () => {
    const later = plan("2026-10-11"),
      earlier = plan("2026-10-09");
    const rows = scheduleStudyTasks(
      { ...emptyStudyWorkspace(), dailyMinutes: 15, plans: [later, earlier] },
      today,
    );
    expect(rows[0].plan.id).toBe(earlier.id);
    expect(rows.filter((row) => row.plan.id === earlier.id).map((row) => row.date)).toEqual([
      today,
      "2026-10-09",
      "2026-10-09",
    ]);
  });
  it("reports unschedulable work instead of dropping it or claiming it is complete", () => {
    const rows = scheduleStudyTasks(
      { ...emptyStudyWorkspace(), dailyMinutes: 15, plans: [plan(today)] },
      today,
    );
    expect(
      rows.filter((row) => row.date === null).reduce((sum, row) => sum + row.task.minutes, 0),
    ).toBe(15);
    expect(rows.every((row) => row.task.status === "pending")).toBe(true);
  });
  it("counts completed work from every plan before allocating pending work", () => {
    const earlier = plan("2026-10-09"),
      later = plan("2026-10-10");
    later.tasks[0] = { ...later.tasks[0], status: "done", completedAt: now.toISOString() };
    const rows = scheduleStudyTasks(
      { ...emptyStudyWorkspace(), dailyMinutes: 15, plans: [earlier, later] },
      today,
    );
    expect(
      rows.filter((row) => row.date === today).reduce((sum, row) => sum + row.task.minutes, 0),
    ).toBe(15);
    expect(rows.find((row) => row.task.id === earlier.tasks[0].id)?.date).toBe("2026-10-09");
  });
  it("archiving does not erase time already spent today", () => {
    const archived = plan();
    archived.archived = true;
    archived.tasks[0] = { ...archived.tasks[0], status: "done", completedAt: now.toISOString() };
    const rows = scheduleStudyTasks(
      { ...emptyStudyWorkspace(), dailyMinutes: 15, plans: [archived, plan()] },
      today,
    );
    expect(rows.filter((row) => row.date === today).map((row) => row.task.status)).toEqual([
      "done",
    ]);
  });
  it("deferring at the UTC date boundary uses the Korean tomorrow", () => {
    const p = plan();
    const workspace = { ...emptyStudyWorkspace(), plans: [p] };
    const next = applyStudyTaskAction(
      workspace,
      { action: "defer", revision: 0, planId: p.id, taskId: p.tasks[0].id },
      new Date("2026-10-08T15:30:00Z"),
    )!;
    expect(next.plans[0].tasks[0].notBefore).toBe("2026-10-10");
    expect(scheduleStudyTasks(next, "2026-10-09").every((row) => row.date !== "2026-10-09")).toBe(
      true,
    );
  });
  it("budget changes and reallocation preserve completed notes and timestamps", () => {
    const p = plan();
    const workspace = { ...emptyStudyWorkspace(), plans: [p] };
    const next = applyStudyTaskAction(
      workspace,
      {
        action: "complete",
        revision: 0,
        planId: p.id,
        taskId: p.tasks[0].id,
        reflection: "경계 조건 다시 보기",
      },
      now,
    )!;
    scheduleStudyTasks({ ...next, dailyMinutes: 15 }, today);
    expect(next.plans[0].tasks[0]).toMatchObject({
      status: "done",
      completedAt: now.toISOString(),
      reflection: "경계 조건 다시 보기",
    });
    expect(workspace.plans[0].tasks[0].status).toBe("pending");
    expect(
      applyStudyTaskAction(
        next,
        { action: "defer", revision: 0, planId: p.id, taskId: p.tasks[0].id },
        now,
      ),
    ).toBeNull();
  });
  it("expired targets stay visible as unscheduled work", () => {
    expect(
      scheduleStudyTasks({ ...emptyStudyWorkspace(), plans: [plan("2026-10-07")] }, today).every(
        (row) => row.date === null,
      ),
    ).toBe(true);
  });
  it("accepts only valid dates within 90 days", () => {
    expect(validateStudyTarget(today, today)).toBeNull();
    expect(validateStudyTarget("2026-10-07", today)).toBeTruthy();
    expect(validateStudyTarget("2027-02-08", today)).toBeTruthy();
    expect(
      StudyPlanAction.safeParse({
        action: "create",
        revision: 0,
        courseId: id(),
        title: "시험",
        targetDate: "2026-02-30",
        scope: "",
        materialIds: [id()],
      }).success,
    ).toBe(false);
  });
  it("does not expose private scope text in navigation URLs", () => {
    const p = plan();
    const href = studyTaskHref(p, p.tasks[1]);
    expect(href).toContain(`studyPlan=${p.id}`);
    expect(href).toContain("studyPractice=1");
    expect(href).not.toContain(encodeURIComponent(p.scope));
  });
  it("keeps task context through generated quizzes and rejects malformed IDs", () => {
    const p = plan();
    expect(studyQuizHref("quiz-id", p.id, p.tasks[1].id)).toContain(`studyTask=${p.tasks[1].id}`);
    expect(studyQuizHref("quiz-id", "../other", "bad")).toBe("/dashboard/quiz/quiz-id");
  });
});
