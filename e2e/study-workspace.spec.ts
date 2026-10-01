import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(() => {
  test.skip(Boolean(process.env.E2E_BASE_URL), "개발용 예시 데이터로만 검증");
});

test("공부 공간에서 강의실 검색과 분류 전환 후 과목을 찾는다", async ({ page }) => {
  await page.goto("/dev/campus-preview?view=study");
  const library = page.getByRole("region", { name: /내 과목/ });
  await expect(library.getByRole("article")).toHaveCount(6);
  const termSelect = page.getByRole("combobox", { name: "공부할 학기" });
  await termSelect.selectOption("2026-spring");
  await expect(library.getByRole("article")).toHaveCount(2);
  await expect(library.getByRole("heading", { name: "알고리즘 기초" })).toBeVisible();
  await expect(library.getByRole("heading", { name: "자료구조" })).toHaveCount(0);
  await termSelect.selectOption("2026-fall");
  await expect(library.getByRole("article")).toHaveCount(6);
  await page.getByRole("textbox", { name: "과목 검색" }).fill("공학관 302");
  await expect(library.getByRole("article")).toHaveCount(1);
  await expect(library.getByRole("heading", { name: "자료구조" })).toBeVisible();
  await page.getByRole("button", { name: "검색어 지우기" }).click();
  await expect(page.getByRole("textbox", { name: "과목 검색" })).toBeFocused();
  await page.getByRole("button", { name: "개인 공부 1", exact: true }).click();
  await expect(library.getByRole("article")).toHaveCount(1);
  await expect(library.getByRole("heading", { name: "정보처리기사" })).toBeVisible();
  await page.getByRole("textbox", { name: "과목 검색" }).fill("없는과목");
  await expect(page.getByRole("heading", { name: "찾는 과목이 없어요" })).toBeVisible();
  await page.getByRole("button", { name: "검색 초기화" }).click();
  await expect(library.getByRole("article")).toHaveCount(6);
  await expect(library.getByRole("link", { name: /자료구조/ })).toHaveAttribute(
    "href",
    "/dashboard/study/preview-structures",
  );
  await library.getByRole("button", { name: "주제 추가", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "개인 공부 주제 추가" })).toBeVisible();
});

test("공부 공간의 모바일·다크·동작 줄이기 접근성", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dev/campus-preview?view=study");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const check = async () => {
    const widths = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    expect(widths[0]).toBeLessThanOrEqual(widths[1] + 1);
    const result = await new AxeBuilder({ page })
      .include("main")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      result.violations.filter((item) => item.impact === "serious" || item.impact === "critical"),
    ).toEqual([]);
  };
  await check();
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await check();
});

test("오늘 할 일 페이지가 404 없이 열리고 빈 상태의 다음 행동이 유효하다", async ({ page }) => {
  await page.goto("/dashboard/today");
  await expect(page.getByRole("heading", { name: "오늘의 우선순위", exact: true })).toBeVisible();
  await expect(page.getByText("This page could not be found.")).toHaveCount(0);
  await page.goto("/dev/campus-preview?view=today");
  await expect(page.getByRole("link", { name: /내 과목에서 공부 이어가기/ })).toHaveAttribute(
    "href",
    "/dashboard/study",
  );
  await expect(page.getByRole("link", { name: /강의계획서에서 일정 가져오기/ })).toHaveAttribute(
    "href",
    "/dashboard/calendar/import?kind=syllabus",
  );
});
