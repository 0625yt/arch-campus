import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
  }));
  expect(
    metrics.page,
    `가로 오버플로: ${metrics.page}px > ${metrics.viewport}px`,
  ).toBeLessThanOrEqual(metrics.viewport + 1);
}

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
  expect(
    blocking,
    blocking
      .map(
        (violation) =>
          `${violation.id}: ${violation.help}\n${violation.nodes.map((node) => node.target.join(" ")).join("\n")}`,
      )
      .join("\n\n"),
  ).toEqual([]);
}

test("로그인 화면은 세 기기에서 깨지지 않고 접근 가능하다", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("main")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAccessibilityViolations(page);

  await page.evaluate(() => localStorage.setItem("arch-theme", "dark"));
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".auth-light")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAccessibilityViolations(page);
});

test("랜딩의 제품 흐름과 자료 정리 장면은 세 기기에서 깨지지 않는다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /이번 학기,.*좀 가볍게/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /자료 하나를 열면/ })).toBeAttached();
  await expect(page.getByText("p.6 → 원문", { exact: true })).toBeAttached();
  await expect(page.getByRole("heading", { name: /정리한 순간부터/ })).toBeAttached();
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAccessibilityViolations(page);

  const calendarTab = page.locator("#product").getByRole("tab", { name: /일정/ });
  const materialTab = page.locator("#product").getByRole("tab", { name: /자료 정리/ });
  await calendarTab.focus();
  await calendarTab.press("ArrowRight");
  await expect(materialTab).toHaveAttribute("aria-selected", "true");

  await page.locator("#material").scrollIntoViewIfNeeded();
  await expect(page.getByRole("heading", { name: /시험공부가 끝까지 이어집니다/ })).toBeVisible();
  const materialSection = page.locator("#material");
  await expect(
    materialSection.getByRole("img", { name: /PDF 원문과 출처 페이지가 표시된 요약/ }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "다크 모드로 전환" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expectNoHorizontalOverflow(page);
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation instanceof CSSTransition)
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  await expectNoSeriousAccessibilityViolations(page);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior))
    .toBe("auto");
});

test("로그인 후 홈과 문제 생성 진입이 세 기기에서 유지된다", async ({ page }) => {
  test.skip(
    !process.env.E2E_STORAGE_STATE,
    "E2E_STORAGE_STATE가 있을 때 로그인 흐름까지 검사합니다.",
  );

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /이번 주/ })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAccessibilityViolations(page);

  await page.goto("/dashboard/quiz");
  await expect(page.getByRole("heading", { name: /내 문제/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "새 문제" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousAccessibilityViolations(page);
});
