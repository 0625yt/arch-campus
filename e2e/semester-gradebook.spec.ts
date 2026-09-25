import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("학기별 성적과 학점 가중 평점을 한눈에 관리한다", async ({ page }) => {
  await page.goto("/dev/grades-preview");

  await expect(page.getByRole("heading", { name: "내 성적" })).toBeVisible();
  await expect(page.getByText("4.00", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("article").filter({ hasText: "이번 학기" })).toContainText(
    /8\s*학점/,
  );
  await expect(page.getByRole("article").filter({ hasText: "자료구조" })).toContainText("A+");

  const termSelect = page.getByRole("combobox", { name: "조회할 학기" });
  await expect(termSelect.locator('option[value="2026-spring"]')).toHaveText("2026년 1학기");
  await expect(termSelect.locator('option[value="2026-winter"]')).toHaveText("2026년 겨울학기");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    results.violations.filter((item) => item.impact === "serious" || item.impact === "critical"),
  ).toEqual([]);

  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  const darkResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    darkResults.violations.filter(
      (item) => item.impact === "serious" || item.impact === "critical",
    ),
  ).toEqual([]);

  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1);
});
