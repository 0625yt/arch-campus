import { expect, test } from "@playwright/test";

test("채팅이 답변을 표시하고 연결 오류 뒤에도 질문을 보낼 수 있다", async ({ page }) => {
  test.skip(
    Boolean(process.env.E2E_BASE_URL) && !process.env.E2E_STORAGE_STATE,
    "외부 환경은 로그인 세션 필요",
  );
  let requestCount = 0;
  await page.route("**/api/chat/free", async (route) => {
    requestCount += 1;
    const data = (part: object) => `data: ${JSON.stringify(part)}\n\n`;
    const body =
      requestCount === 2
        ? data({ type: "text-delta", delta: "여기까지 답변" }) +
          data({ type: "error", errorText: "연결을 확인하고 다시 질문해 주세요." })
        : data({ type: "start", messageId: "example" }) +
          data({ type: "text-delta", delta: "스택은 후입선출이에요 🎓" }) +
          "data: [DONE]\n\n";
    await route.fulfill({ status: 200, contentType: "text/event-stream", body });
  });
  await page.goto("/dashboard/chat?q=스택을 설명해줘");
  await expect(page.getByText("스택은 후입선출이에요 🎓", { exact: true })).toBeVisible();
  expect(requestCount).toBe(1);
  const input = page.getByRole("textbox", { name: "코치에게 질문하기" });
  await input.fill("큐도 설명해줘");
  await page.getByRole("button", { name: "전송", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "연결을 확인하고 다시 질문해 주세요." }),
  ).toBeVisible();
  await expect(page.getByText("여기까지 답변", { exact: true })).toBeVisible();
  await input.fill("다시 설명해줘");
  await page.getByRole("button", { name: "전송", exact: true }).click();
  await expect(page.getByText("스택은 후입선출이에요 🎓", { exact: true })).toHaveCount(2);
  expect(requestCount).toBe(3);
});

test("파일 합치기 연결 실패 후 같은 파일을 다시 선택할 수 있다", async ({ page }) => {
  let uploads = 0;
  await page.route("**/api/materials/upload-url", async (route) => {
    uploads += 1;
    await route.fulfill({
      json: {
        ok: true,
        signedUrl: `http://localhost:3010/mock-storage/${uploads}`,
        storagePath: `test/${uploads}`,
        materialId: `preview-${uploads}`,
        token: "test",
      },
    });
  });
  await page.route("**/mock-storage/*", (route) => route.fulfill({ status: 200, body: "" }));
  await page.route("**/api/materials/finalize-merged", (route) => route.abort("failed"));
  await page.goto("/dev/campus-preview?view=upload");
  const files = [
    { name: "첫째.txt", mimeType: "text/plain", buffer: Buffer.from("첫 번째 강의 메모") },
    { name: "둘째.txt", mimeType: "text/plain", buffer: Buffer.from("두 번째 강의 메모") },
  ];
  await page.locator('input[type="file"]').setInputFiles(files);
  await page.getByRole("button", { name: /하나로 합치기/ }).click();
  await page.getByRole("button", { name: "2개 합치기", exact: true }).click();
  await expect(page.getByText("업로드 실패", { exact: true })).toBeVisible();
  await expect(page.locator("#upload-zone")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator('input[type="file"]')).toBeEnabled();
  await page.locator('input[type="file"]').setInputFiles(files);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: "2개 올리기", exact: true })).toBeVisible();
});
