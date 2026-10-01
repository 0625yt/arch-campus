import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor() {
      throw new Error("unavailable");
    }
  },
}));

import { checkRateLimit, guardRateLimit } from "./ratelimit";

afterEach(() => vi.unstubAllEnvs());
describe("rate limit outage", () => {
  it("does not run billable work when the limiter cannot initialize", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.invalid");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "fixture");
    expect((await checkRateLimit("ai", "owner")).success).toBe(false);
    const response = await guardRateLimit("ai", "owner");
    expect(response?.status).toBe(503);
    expect(response?.headers.get("Retry-After")).toBe("30");
  });
});
