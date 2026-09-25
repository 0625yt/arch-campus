import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("가입 전 체험에서 일정·출처·오답 해설을 직접 확인할 수 있다", async ({ page }) => {
  await page.goto("/");
  const tabs = page.getByRole("tablist", { name: "학습 흐름 체험" });
  await page.getByRole("button", { name: "일정 확인해 보기", exact: true }).click();
  await expect(page.getByText("내 캘린더에는 저장되지 않는 체험이에요.")).toBeVisible();
  await tabs.getByRole("tab", { name: /일정 확인/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.getByRole("tab", { name: /요약 읽기/ })).toBeFocused();
  await page.getByRole("button", { name: /p.6 원문 근거 보기/ }).click();
  await expect(page.locator("#demo-source")).toBeVisible();
  await tabs.getByRole("tab", { name: /문제 풀기/ }).click();
  await page.getByRole("button", { name: /가장 먼저 넣은 데이터/ }).click();
  await expect(page.getByText("헷갈려도 괜찮아요.")).toBeVisible();
  await page.getByRole("button", { name: "문제 다시 풀기" }).click();
  await expect(page.getByRole("button", { name: /가장 먼저 넣은 데이터/ })).toBeFocused();
  await page.getByRole("button", { name: /가장 나중에 넣은 데이터/ }).click();
  await expect(page.getByText("맞았어요!")).toBeVisible();
});

test("내 캠퍼스에서 검색과 계정 설정을 키보드와 터치로 열 수 있다", async ({ page }) => {
  test.skip(
    Boolean(process.env.E2E_BASE_URL) && !process.env.E2E_STORAGE_STATE,
    "외부 환경은 로그인 세션 필요",
  );
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: /학기/ })).toBeVisible();
  const account = page
    .getByRole("button", { name: "내 계정", exact: true })
    .filter({ visible: true });
  await account.click();
  const panel = page.getByRole("dialog", { name: "계정 메뉴" });
  await expect(panel.getByRole("link", { name: "프로필 및 설정" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(account).toBeFocused();
  await account.click();
  await panel.getByRole("button", { name: "다크 모드로 전환" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^검색/ }).filter({ visible: true }).click();
  await expect(page.getByRole("dialog", { name: "명령 팔레트" })).toBeVisible();
  await page.keyboard.press("Escape");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    results.violations.filter((item) => item.impact === "serious" || item.impact === "critical"),
  ).toEqual([]);
  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1);
});

test("가로로 든 휴대폰에서도 계정 메뉴의 마지막 항목까지 접근할 수 있다", async ({ page }) => {
  test.skip(
    Boolean(process.env.E2E_BASE_URL) && !process.env.E2E_STORAGE_STATE,
    "외부 환경은 로그인 세션 필요",
  );
  await page.setViewportSize({ width: 568, height: 320 });
  await page.goto("/dashboard");
  await page
    .getByRole("button", { name: "내 계정", exact: true })
    .filter({ visible: true })
    .click();
  const logout = page.getByRole("button", { name: "로그아웃", exact: true });
  await logout.scrollIntoViewIfNeeded();
  await expect(logout).toBeInViewport();
});
