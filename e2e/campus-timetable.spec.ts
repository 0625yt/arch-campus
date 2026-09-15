import { expect, test } from "@playwright/test";

test("등록된 시간표를 펼치고 과목 자료 진입을 확인할 수 있다", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-10T00:30:00Z"));
  await page.goto("/dev/campus-preview");
  await expect(page.getByRole("heading", { name: "지민님의 이번 주" })).toBeVisible();
  const classButton = page.getByRole("button", { name: /^자료구조 09:00/ }).first();
  await expect(classButton).toBeVisible();
  const bounds = await classButton.boundingBox();
  expect(bounds?.height).toBeGreaterThan(24);
  await classButton.click();
  const sheet = page.getByRole("dialog", { name: "자료구조 상세" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("link", { name: /강의로 들어가기/ })).toHaveAttribute(
    "href",
    /dashboard\/study\//,
  );
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await page.getByRole("button", { name: "오늘만", exact: true }).click();
  await expect(classButton).toBeHidden();
  await expect(page.getByRole("button", { name: /^인터랙션 디자인 10:00/ })).toBeVisible();
  await page.getByRole("button", { name: "한 주", exact: true }).click();
  await expect(classButton).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width + 1,
  );
});
