import { expect, test } from "@playwright/test";

test("자료 분할 핸들은 키보드로 조절되고 같은 페이지도 다시 점프한다", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dev/landing-material-preview");

  const separator = page.getByRole("separator", { name: "PDF와 요약 너비 조절" });
  if ((page.viewportSize()?.width ?? 0) < 768) {
    await expect(separator).toBeHidden();
    return;
  }

  await expect(separator).toBeVisible();
  await expect(separator).toHaveAttribute("aria-orientation", "vertical");
  await expect(separator).toHaveAttribute("aria-valuemin", "20");
  await expect(separator).toHaveAttribute("aria-valuemax", "80");
  await expect(separator).toHaveAttribute("aria-valuenow", "55");
  await expect(separator).toHaveAttribute("tabindex", "0");

  await separator.focus();
  await expect(separator).toBeFocused();
  await separator.press("End");
  await expect(separator).toHaveAttribute("aria-valuenow", "80");
  await separator.press("ArrowRight");
  await expect(separator).toHaveAttribute("aria-valuenow", "80");
  await separator.press("Home");
  await expect(separator).toHaveAttribute("aria-valuenow", "20");
  await separator.press("ArrowLeft");
  await expect(separator).toHaveAttribute("aria-valuenow", "20");
  await separator.press("ArrowRight");
  await expect(separator).toHaveAttribute("aria-valuenow", "25");
  await expect(separator).toHaveAttribute("aria-valuetext", "PDF 25%, 요약 75%");

  // 긴 태블릿 화면에서도 PDF가 실제로 스크롤되도록 원문 영역을 넓힌다.
  await separator.press("End");
  await expect(separator).toHaveAttribute("aria-valuenow", "80");

  const pdfScrollContainer = page.locator("#arch-pdf-wrap > div").first();
  await expect(page.locator("#arch-pdf-wrap canvas").first()).toBeVisible();
  await expect
    .poll(() =>
      pdfScrollContainer.evaluate((element) => element.scrollHeight > element.clientHeight + 100),
    )
    .toBe(true);
  const pageTwoChip = page.getByRole("button", { name: "p.2" }).first();

  await pageTwoChip.click();
  await expect
    .poll(() => pdfScrollContainer.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(100);

  await pdfScrollContainer.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect.poll(() => pdfScrollContainer.evaluate((element) => element.scrollTop)).toBe(0);

  // 같은 p.2를 다시 요청해도 page 값만 비교하지 않고 PDF 위치를 복원해야 한다.
  await pageTwoChip.click();
  await expect
    .poll(() => pdfScrollContainer.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(100);
});
