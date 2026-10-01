import { defineConfig } from "@playwright/test";

const externalBaseUrl = process.env.E2E_BASE_URL;
const baseURL = externalBaseUrl ?? "http://localhost:3010";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    storageState: process.env.E2E_STORAGE_STATE || undefined,
  },
  projects: [
    {
      name: "mobile-390",
      use: {
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: "ipad-834",
      use: {
        viewport: { width: 834, height: 1112 },
        hasTouch: true,
      },
    },
    {
      name: "laptop-1280",
      use: {
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "npm run dev -- --port 3010",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
