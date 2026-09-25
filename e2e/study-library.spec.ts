import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/jobs/active", (route) =>
    route.fulfill({ json: { ok: true, jobs: [] } }),
  );
});

test("자료 검색과 요약 필터를 함께 적용하고 선택한 결과만 삭제한다", async ({ page }) => {
  const deleted: string[] = [];
  await page.route("**/api/materials/preview-*", async (route) => {
    if (route.request().method() !== "DELETE") return route.abort();
    deleted.push(route.request().url().split("/").at(-1) ?? "");
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/dev/study-preview");
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(3);
  await page.getByRole("button", { name: "요약 완료", exact: true }).click();
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(2);
  await page.getByRole("searchbox", { name: "자료 제목 검색" }).fill("기출");
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "중간고사 기출문제", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "선택 모드", exact: true }).click();
  await page.getByRole("button", { name: "전체 선택", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("1개 선택됨");
  await page.getByRole("button", { name: "선택 삭제", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "삭제", exact: true }).click();
  await expect.poll(() => deleted).toEqual(["preview-exam"]);
  await page.getByRole("button", { name: "검색과 필터 초기화", exact: true }).click();
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "04. 트리와 그래프", exact: true })).toBeVisible();
});

test("일괄 삭제 실패 자료를 복구하고 다른 자료를 계속 사용할 수 있다", async ({ page }) => {
  await page.route("**/api/materials/preview-*", (route) => {
    if (route.request().method() !== "DELETE") return route.abort();
    return route.request().url().endsWith("preview-tree")
      ? route.abort("failed")
      : route.fulfill({ json: { ok: true } });
  });
  await page.goto("/dev/study-preview");
  await page.getByRole("button", { name: "선택 모드", exact: true }).click();
  await page.getByRole("button", { name: "전체 선택", exact: true }).click();
  await page.getByRole("button", { name: "선택 삭제", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "삭제", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "삭제하지 못한" })).toHaveText(
    "2개 삭제했어요. 삭제하지 못한 1개는 다시 표시했어요.",
  );
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(1);
  await expect(page.getByRole("link", { name: /04. 트리와 그래프/ })).toHaveAttribute(
    "href",
    /preview-tree$/,
  );
});

test("첫 자료도 생성 진행 상태가 나타난다", async ({ page }) => {
  await page.route("**/api/jobs/active", (route) =>
    route.fulfill({
      json: {
        ok: true,
        jobs: [
          {
            id: "preview-job",
            tool: "summarize",
            toolLabel: "요약",
            status: "running",
            materialId: "preview-pending",
            materialTitle: "첫 번째 강의 자료",
            courseId: "preview-course",
            createdAt: new Date().toISOString(),
            startedAt: new Date().toISOString(),
          },
        ],
      },
    }),
  );
  await page.goto("/dev/study-preview?empty=1");
  await expect(page.locator('[aria-busy="true"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "첫 번째 강의 자료", exact: true })).toBeVisible();
  await expect(page.getByText("요약·문제를 준비하고 있어요", { exact: true })).toBeVisible();
  await expect(page.getByText("첫 자료가 들어올 자리", { exact: true })).toHaveCount(0);
});

test("자료 화면은 모바일과 다크 모드에서도 읽을 수 있다", async ({ page }, testInfo) => {
  await page.goto("/dev/study-preview");
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(3);
  await page.locator("main").evaluate(async (element) => {
    await Promise.all(
      element.getAnimations({ subtree: true }).map((animation) => animation.finished),
    );
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const light = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(light.violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("library-light.png"), fullPage: true });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await page.locator("main").evaluate(async (element) => {
    await Promise.all(
      element.getAnimations({ subtree: true }).map((animation) => animation.finished),
    );
  });
  const dark = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(dark.violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("library-dark.png"), fullPage: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const animation = await page
    .getByRole("heading", { name: /03. 스택과 큐/ })
    .evaluate((element) => getComputedStyle(element.closest("li")!).animationName);
  expect(animation).toBe("none");
});
