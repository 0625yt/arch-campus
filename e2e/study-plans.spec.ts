import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  applyStudyTaskAction,
  createStudyTasks,
  emptyStudyWorkspace,
  type StudyPlan,
  type StudyWorkspace,
} from "../src/lib/study-plan";

const courseId = "00000000-0000-4000-8000-000000000010";
const materialId = "00000000-0000-4000-8000-000000000020";
const quizId = "00000000-0000-4000-8000-000000000030";
const now = new Date("2026-10-08T03:00:00Z");
let sequence = 100;
const id = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
const catalog = {
  courses: [{ id: courseId, name: "자료구조" }],
  materials: [{ id: materialId, courseId, title: "3주차 강의" }],
  events: [],
  dueReview: { count: 8, quizId },
};
function samplePlan(): StudyPlan {
  return {
    id: id(),
    courseId,
    title: "중간고사",
    targetDate: "2026-10-09",
    scope: "3~7주차, 부록 제외",
    eventId: null,
    materialIds: [materialId],
    createdAt: now.toISOString(),
    archived: false,
    tasks: createStudyTasks([{ id: materialId, title: "3주차 강의" }], "2026-10-08", id),
  };
}
async function mockWorkspace(
  page: Page,
  initial = emptyStudyWorkspace(),
  failFirst = false,
  timer = false,
) {
  let workspace: StudyWorkspace = initial;
  let fail = failFirst;
  if (timer) {
    await page.clock.install({ time: now });
    await page.clock.pauseAt(new Date(now.getTime() + 60_000));
  } else await page.clock.setFixedTime(now);
  await page.route("**/api/study-plans", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { ok: true, workspace, catalog } });
    if (fail) {
      fail = false;
      return route.abort("failed");
    }
    const action = route.request().postDataJSON();
    expect(action.revision).toBe(workspace.revision);
    if (action.action === "create")
      workspace = {
        ...workspace,
        plans: [
          ...workspace.plans,
          {
            ...samplePlan(),
            title: action.title,
            targetDate: action.targetDate,
            scope: action.scope,
          },
        ],
      };
    else if (action.action === "budget")
      workspace = { ...workspace, dailyMinutes: action.dailyMinutes };
    else if (action.action === "archive")
      workspace = {
        ...workspace,
        plans: workspace.plans.map((plan) =>
          plan.id === action.planId ? { ...plan, archived: true } : plan,
        ),
      };
    else workspace = applyStudyTaskAction(workspace, action, now)!;
    workspace = { ...workspace, revision: workspace.revision + 1 };
    return route.fulfill({ json: { ok: true, workspace } });
  });
  return () => workspace;
}
test.beforeEach(() => {
  test.skip(
    Boolean(process.env.E2E_BASE_URL) && !process.env.E2E_STORAGE_STATE,
    "외부 환경은 로그인 세션 필요",
  );
});

test("시험 계획을 만들고 완료·미룸·시간 변경을 다음 접속까지 유지한다", async ({ page }) => {
  const read = await mockWorkspace(page);
  await page.goto("/dashboard/study/plans");
  await page.getByLabel("시험 이름", { exact: true }).fill("자료구조 중간고사");
  await page.getByLabel("목표 날짜", { exact: true }).fill("2026-10-08");
  await page.getByLabel("시험 범위와 제외할 부분").fill("3~7주차, 부록 제외");
  await page.getByLabel("3주차 강의", { exact: true }).check();
  await page.getByRole("button", { name: "시험 준비 계획 만들기" }).click();
  await expect(page.getByRole("heading", { name: "자료구조 중간고사", exact: true })).toBeVisible();
  const task = page.getByRole("listitem").filter({ hasText: "핵심 개념과 원문 확인" }).first();
  await task.getByRole("button", { name: "완료", exact: true }).click();
  await page
    .getByRole("listitem")
    .filter({ hasText: "5문제로 이해 점검" })
    .first()
    .getByRole("button", { name: "내일로", exact: true })
    .click();
  await page.getByLabel("하루 공부 시간").selectOption("15");
  await expect(page.getByText("목표일까지 배치하지 못한 공부 15분")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("하루 공부 시간")).toHaveValue("15");
  expect(read().plans[0].tasks[0].status).toBe("done");
  expect(read().plans[0].tasks[1].notBefore).toBe("2026-10-09");
  expect(read().plans[0].scope).toBe("3~7주차, 부록 제외");
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(
    axe.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    ),
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width + 1,
  );
});

test("집중 타이머를 일시정지하고 공부 메모를 직접 완료로 저장한다", async ({ page }) => {
  const read = await mockWorkspace(
    page,
    { ...emptyStudyWorkspace(), plans: [samplePlan()] },
    false,
    true,
  );
  await page.goto("/dashboard/study/plans");
  await page.getByRole("button", { name: "집중 시작" }).first().click();
  const focus = page.getByRole("region", { name: "집중 공부" });
  await focus.getByRole("button", { name: "타이머 시작" }).click();
  await page.clock.runFor(3000);
  await expect(focus.getByRole("timer")).toHaveText("14:57");
  await focus.getByRole("button", { name: "일시정지" }).click();
  await page.clock.runFor(5000);
  await expect(focus.getByRole("timer")).toHaveText("14:57");
  await focus.getByLabel("다음에 다시 볼 개념").fill("이진 탐색의 정렬 조건");
  await focus.getByRole("button", { name: "공부 완료하고 기록" }).click();
  await page.getByText("오늘 완료한 공부 1개").click();
  await expect(page.getByText("이진 탐색의 정렬 조건").first()).toBeVisible();
  expect(read().plans[0].tasks[0].reflection).toBe("이진 탐색의 정렬 조건");
});

test("타이머 만료가 작업을 자동 완료하지 않는다", async ({ page }) => {
  const read = await mockWorkspace(
    page,
    { ...emptyStudyWorkspace(), plans: [samplePlan()] },
    false,
    true,
  );
  await page.goto("/dashboard/study/plans");
  await page.getByRole("button", { name: "집중 시작" }).first().click();
  await page.getByRole("button", { name: "타이머 시작" }).click();
  await page.clock.fastForward(16 * 60 * 1000);
  await expect(page.getByText("시간이 끝났어요. 공부를 마쳤다면 직접 완료해주세요.")).toBeVisible();
  expect(read().plans[0].tasks[0].status).toBe("pending");
});

test("저장 연결 실패 후 입력을 유지하고 다시 시도한다", async ({ page }) => {
  await mockWorkspace(page, emptyStudyWorkspace(), true);
  await page.goto("/dashboard/study/plans");
  await page.getByLabel("시험 이름", { exact: true }).fill("저장 재시도 시험");
  await page.getByLabel("3주차 강의", { exact: true }).check();
  await page.getByRole("button", { name: "시험 준비 계획 만들기" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "다시 불러오기" })).toBeVisible();
  await expect(page.getByLabel("시험 이름", { exact: true })).toHaveValue("저장 재시도 시험");
  await page.getByRole("button", { name: "시험 준비 계획 만들기" }).click();
  await expect(page.getByRole("heading", { name: "저장 재시도 시험", exact: true })).toBeVisible();
});

test("Today에서 최대 5문제 복습과 시험 준비실로 이어진다", async ({ page }) => {
  await mockWorkspace(page);
  await page.goto("/dashboard/today");
  await expect(page.getByRole("link", { name: /최대 5문제 빠른 복습/ })).toHaveAttribute(
    "href",
    `/dashboard/quiz/${quizId}/review?limit=5`,
  );
  await page.getByRole("link", { name: "시험 준비실", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "시험 준비실" })).toBeVisible();
});

test("저장된 시험 범위를 기다린 뒤 같은 자료 묶음으로 문제 생성을 요청한다", async ({ page }) => {
  const plan = samplePlan();
  const extraId = "00000000-0000-4000-8000-000000000021";
  plan.materialIds.push(extraId);
  let release: () => void = () => {};
  await page.route("**/api/study-plans", async (route) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return route.fulfill({
      json: { ok: true, workspace: { ...emptyStudyWorkspace(), plans: [plan] }, catalog },
    });
  });
  let requests = 0;
  await page.route(`**/api/materials/${materialId}/quiz`, async (route) => {
    requests++;
    expect(route.request().postDataJSON()).toMatchObject({
      scope: plan.scope,
      extraMaterialIds: [extraId],
    });
    return route.fulfill({
      status: 503,
      json: { ok: false, error: "생성 응답 오류도 입력을 보존해요" },
    });
  });
  await page.goto(
    `/dev/campus-preview?view=study-generate&studyPlan=${plan.id}&studyTask=${plan.tasks[1].id}&studyPractice=1`,
  );
  await expect(page.getByRole("button", { name: "시험 범위를 불러오는 중…" })).toBeDisabled();
  expect(requests).toBe(0);
  release();
  await expect(page.getByPlaceholder("예: 1~3장만 / p.10~30 위주")).toHaveValue(plan.scope);
  await page.getByRole("button", { name: "5문제 만들기", exact: true }).click();
  await expect(page.getByText("생성 응답 오류도 입력을 보존해요")).toBeVisible();
  expect(requests).toBe(1);
});

test("풀이 결과에서 개념 메모를 시험 계획에 기록하고 Today로 돌아간다", async ({ page }) => {
  // Isolate the destination from server-side database calls. The live release
  // workflow separately verifies authenticated Today rendering and persistence.
  await page.route("**/dashboard/today**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><html lang='ko'><body><main>오늘의 공부</main></body></html>",
    }),
  );
  const plan = samplePlan();
  const read = await mockWorkspace(page, { ...emptyStudyWorkspace(), plans: [plan] });
  await page.goto(
    `/dev/campus-preview?view=study-result&studyPlan=${plan.id}&studyTask=${plan.tasks[1].id}`,
  );
  await page.getByRole("button", { name: "공부 완료하고 Today로" }).click();
  await expect(page).toHaveURL(/\/dashboard\/today$/);
  expect(read().plans[0].tasks[1]).toMatchObject({
    status: "done",
    reflection: "문제 점검 완료 · 다시 볼 개념: 스택",
  });
});

test("새 공부 계획은 다크 모드와 동작 줄이기에서도 읽을 수 있다", async ({ page }) => {
  await mockWorkspace(page, { ...emptyStudyWorkspace(), plans: [samplePlan()] });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dashboard/study/plans");
  await expect(page.getByRole("heading", { name: "중간고사", exact: true })).toBeVisible();
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  const axe = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    axe.violations.filter((item) => item.impact === "serious" || item.impact === "critical"),
  ).toEqual([]);
  await page.screenshot({ path: test.info().outputPath("study-plans-dark.png") });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  await expect(page.getByRole("heading", { name: "오늘의 공부", exact: true })).toHaveCSS(
    "color",
    "rgb(29, 29, 31)",
  );
  await page.screenshot({ path: test.info().outputPath("study-plans-light.png") });
});
