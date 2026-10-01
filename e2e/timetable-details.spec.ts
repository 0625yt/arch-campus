import { expect, test } from "@playwright/test";

test("시간표와 목록에서 강의실을 확인하고 기존 강의 수정으로 이어진다", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-10T00:30:00Z"));
  await page.goto("/dev/campus-preview");
  const timetable = page.getByRole("region", { name: "내 강의 시간표", exact: true });
  const gridCourse = timetable.getByRole("button", { name: /^자료구조 09:00/ }).first();
  await expect(gridCourse.getByText("공학관 302", { exact: true })).toBeVisible();
  await expect(gridCourse).toHaveAccessibleName(/공학관 302/);
  const courseBounds = await gridCourse.boundingBox();
  const timeBounds = await timetable.locator(".time-bar-pulse").boundingBox();
  // Thursday's current-time marker must not cover the room in Monday's class.
  expect(timeBounds?.x).toBeGreaterThan((courseBounds?.x ?? 0) + (courseBounds?.width ?? 0));

  await timetable.getByRole("button", { name: "목록", exact: true }).click();
  const agenda = page.getByRole("region", { name: "요일별 강의 목록" });
  const listCourse = agenda.getByRole("button", { name: /자료구조/ }).first();
  await expect(listCourse.getByText("공학관 302", { exact: true })).toBeVisible();
  await expect(listCourse.getByText("김교수", { exact: true })).toBeVisible();
  await expect(listCourse.getByText("10:30", { exact: true })).toBeVisible();
  await listCourse.click();

  const dialog = page.getByRole("dialog", { name: "자료구조 상세" });
  await dialog.getByRole("button", { name: "강의 수정", exact: true }).click();
  const location = dialog.getByPlaceholder("예: 백마관 201");
  await expect(location).toHaveValue("공학관 302");
  await location.fill("공학관 405");

  let savedLocation: string | undefined;
  await page.route("**/api/courses/preview-structures", async (route) => {
    savedLocation = route.request().postDataJSON().location;
    await route.fulfill({ json: { ok: true } });
  });
  await dialog.getByRole("button", { name: "저장", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(savedLocation).toBe("공학관 405");

  await timetable.getByRole("button", { name: "한 주", exact: true }).click();
  await expect(gridCourse).toBeVisible();
  expect((await gridCourse.boundingBox())?.height).toBeGreaterThan(60);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width + 1,
  );
});

test("동작 줄이기 설정에서는 시간표 목록 전환 애니메이션이 재생되지 않는다", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dev/campus-preview");
  await page.getByRole("button", { name: "목록", exact: true }).click();
  const agenda = page.getByRole("region", { name: "요일별 강의 목록" });
  await expect(agenda).toBeVisible();
  await expect(agenda).toHaveCSS("animation-name", "none");
});
