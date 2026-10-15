import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  test.skip(
    Boolean(process.env.E2E_BASE_URL) && !process.env.E2E_STORAGE_STATE,
    "외부 환경은 로그인 세션 필요",
  );
  await page.addInitScript(() => {
    const endpoint = "https://fcm.googleapis.com/test-browser";
    const sub = {
      endpoint,
      toJSON: () => ({
        endpoint,
        expirationTime: null,
        keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) },
      }),
      unsubscribe: async () => {
        sessionStorage.removeItem("test-push-active");
        return true;
      },
    };
    const registration = {
      pushManager: {
        getSubscription: async () => (sessionStorage.getItem("test-push-active") ? sub : null),
        subscribe: async () => {
          sessionStorage.setItem("test-push-active", "1");
          return sub;
        },
      },
    };
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register: async () => registration, ready: Promise.resolve(registration) },
    });
    Object.defineProperty(window, "PushManager", { configurable: true, value: class {} });
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: {
        permission: "default",
        requestPermission: async () => {
          sessionStorage.setItem("test-push-prompted", "1");
          return "granted";
        },
      },
    });
  });
});

test("명시적 동의로 알림을 켜고 이 브라우저의 구독을 해제한다", async ({ page }) => {
  const methods: string[] = [];
  await page.route("**/api/push/subscriptions", async (route) => {
    methods.push(route.request().method());
    if (route.request().method() === "GET")
      return route.fulfill({
        json: { ok: true, configured: true, publicKey: "B".repeat(87), endpointHashes: [] },
      });
    if (route.request().method() === "POST")
      expect(route.request().postDataJSON().endpoint).toContain("fcm.googleapis.com");
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/dashboard/settings");
  const enable = page.getByRole("button", { name: "이 브라우저 알림 켜기" });
  await expect(enable).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("test-push-prompted"))).toBeNull();
  await enable.click();
  await expect(page.getByText(/이 브라우저의 일정 알림이 켜져/)).toBeVisible();
  await page.getByRole("button", { name: "이 브라우저 알림 끄기" }).click();
  await expect(enable).toBeVisible();
  expect(methods.filter((method) => method !== "GET")).toEqual(["POST", "DELETE"]);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    results.violations.filter((item) => item.impact === "serious" || item.impact === "critical"),
  ).toEqual([]);
});

test("전송 설정이 없으면 권한 요청 없이 준비 상태를 안내한다", async ({ page }) => {
  await page.route("**/api/push/subscriptions", (route) =>
    route.fulfill({ json: { ok: true, configured: false, publicKey: null, endpointHashes: [] } }),
  );
  await page.goto("/dashboard/settings");
  await expect(page.getByText(/일정 알림을 준비 중이에요/)).toBeVisible();
  await expect(page.getByRole("button", { name: "이 브라우저 알림 켜기" })).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem("test-push-prompted"))).toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width + 1,
  );
});

test("구독 저장 실패 시 브라우저 구독을 되돌리고 다시 시도할 수 있다", async ({ page }) => {
  await page.route("**/api/push/subscriptions", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({
          json: { ok: true, configured: true, publicKey: "B".repeat(87), endpointHashes: [] },
        })
      : route.fulfill({ status: 503, json: { ok: false, error: "잠시 후 다시 시도해 주세요." } }),
  );
  await page.goto("/dashboard/settings");
  await page.getByRole("button", { name: "이 브라우저 알림 켜기" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "잠시 후 다시 시도" })).toBeVisible();
  await expect(page.getByRole("button", { name: "이 브라우저 알림 켜기" })).toBeEnabled();
  expect(await page.evaluate(() => sessionStorage.getItem("test-push-active"))).toBeNull();
});

test("새 일정의 알림 시각을 저장하고 연결 실패를 화면에서 안내한다", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/events", async (route) => {
    if (route.request().method() !== "POST")
      return route.fulfill({ json: { ok: true, events: [] } });
    expect(route.request().postDataJSON().reminder_minutes).toBe(60);
    attempts++;
    if (attempts === 1) return route.abort("failed");
    return route.fulfill({
      json: { ok: true, event: { id: "test-event", title: "알림 회귀 일정" } },
    });
  });
  await page.goto("/dev/campus-preview?view=calendar");
  await page
    .getByRole("button", { name: /일정 추가|AI로 일정/ })
    .filter({ visible: true })
    .first()
    .click();
  await page.getByRole("button", { name: "직접 적기", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "새 일정" });
  await dialog.getByPlaceholder("새 일정", { exact: true }).fill("알림 회귀 일정");
  await dialog.getByRole("button", { name: "기타", exact: true }).click();
  await dialog.getByRole("combobox", { name: "일정 알림 시각" }).selectOption("60");
  await dialog.getByRole("button", { name: "추가", exact: true }).click();
  await expect(dialog.getByText(/일정을 저장하지 못했어요/)).toBeVisible();
  await dialog.getByRole("button", { name: "추가", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(attempts).toBe(2);
});
