import { expect, test } from "@playwright/test";

test("설정에서 월간 AI 사용량과 보안 화면으로 이동할 수 있다", async ({ page }) => {
  test.skip(
    Boolean(process.env.E2E_BASE_URL) && !process.env.E2E_STORAGE_STATE,
    "외부 환경은 로그인 세션 필요",
  );
  await page.goto("/dashboard/settings");
  await expect(page.getByRole("heading", { name: "설정", exact: true })).toBeVisible();
  await expect(page.getByText("AI 학습 도구 사용량", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /로그인 및 보안/ }).click();
  await expect(page).toHaveURL(/\/dashboard\/settings\/security$/);
  await expect(page.getByRole("heading", { name: "보안", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "설정 ‹", exact: true })).toBeVisible();
});
