import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

async function waitForWorker(page: Page) {
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
}

const cachedPaths = [
  "/offline.html",
  "/pwa/apple-icon.png",
  "/pwa/icon-192.png",
  "/pwa/icon-512.png",
].sort();

async function publicCachePaths(page: Page) {
  return page.evaluate(async () => {
    const paths: string[] = [];
    for (const name of (await caches.keys()).filter((key) =>
      key.startsWith("arch-public-offline-"),
    )) {
      for (const request of await (await caches.open(name)).keys()) {
        const url = new URL(request.url);
        paths.push(url.pathname + url.search);
      }
    }
    return paths.sort();
  });
}

test("PWA 공개 파일과 설치 아이콘이 인증 없이 열리고 이전 공개 캐시만 정리한다", async ({
  page,
  request,
}) => {
  for (const path of ["/sw.js", "/offline.html", "/manifest.webmanifest"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(200);
  }
  const worker = await request.get("/sw.js");
  expect(worker.headers()["content-type"]).toContain("javascript");
  expect(worker.headers()["cache-control"]).toContain("no-store");
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({
    id: "/",
    scope: "/",
    start_url: "/dashboard",
    display: "standalone",
  });
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" }),
      expect.objectContaining({ src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png" }),
    ]),
  );

  await page.goto("/offline.html");
  await page.evaluate(async () => {
    await caches.open("arch-public-offline-obsolete");
    await caches.open("unrelated-cache");
  });
  await page.goto("/login");
  await waitForWorker(page);
  const cacheNames = await page.evaluate(() => caches.keys());
  expect(cacheNames).not.toContain("arch-public-offline-obsolete");
  expect(cacheNames).toContain("unrelated-cache");
  expect(await publicCachePaths(page)).toEqual(cachedPaths);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    "/pwa/apple-icon.png",
  );
  for (const [path, size] of [
    ["/pwa/icon-192.png", 192],
    ["/pwa/icon-512.png", 512],
    ["/pwa/apple-icon.png", 180],
  ] as const) {
    const dimensions = await page.evaluate(async (src) => {
      const icon = new Image();
      icon.src = src;
      await icon.decode();
      return [icon.naturalWidth, icon.naturalHeight];
    }, path);
    expect(dimensions).toEqual([size, size]);
  }
});

test("오프라인 새로고침은 공개 안내를 보여주고 다시 연결할 수 있다", async ({ page, context }) => {
  await page.goto("/login");
  await waitForWorker(page);
  await context.setOffline(true);
  await page.goto("/dashboard/study/fixture-course/fixture-material");
  await expect(page.getByRole("heading", { name: "인터넷 연결을 확인해 주세요" })).toBeVisible();
  expect(
    await page
      .getByRole("img", { name: "arch", exact: true })
      .evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBe(192);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    accessibility.violations.filter((violation) =>
      ["critical", "serious"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
  expect(await publicCachePaths(page)).toEqual(cachedPaths);
  await context.setOffline(false);
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "인터넷 연결을 확인해 주세요" })).toHaveCount(0);
});

test("연결 상태를 알리고 개인 화면·API·POST 응답을 오프라인 캐시에 넣지 않는다", async ({
  page,
  context,
}) => {
  await page.goto("/login");
  await waitForWorker(page);
  await page.evaluate(async () => {
    await fetch("/dashboard/settings");
    await fetch("/api/jobs/00000000-0000-0000-0000-000000000000");
    await fetch("/api/materials", { method: "POST", body: "synthetic fixture" });
  });
  expect(await publicCachePaths(page)).toEqual(cachedPaths);
  await context.setOffline(true);
  await expect(page.getByRole("status")).toContainText("인터넷 연결이 끊겼어요");
  expect(
    await page.evaluate(async () => {
      try {
        await fetch("/api/jobs/00000000-0000-0000-0000-000000000000");
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
  await context.setOffline(false);
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(await publicCachePaths(page)).toEqual(cachedPaths);
});
