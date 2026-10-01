import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { reserveMonthlyAiBudget } = vi.hoisted(() => ({ reserveMonthlyAiBudget: vi.fn() }));
vi.mock("@/lib/data/ai-usage", () => ({ reserveMonthlyAiBudget }));

import { guardRateLimit } from "./ratelimit";

function reservation(allowed: boolean) {
  return {
    resetsAt: "2026-09-30T15:00:00.000Z",
    spentUsd: allowed ? 1 : 3,
    reservedUsd: allowed ? 0.1 : 0,
    allowed,
  };
}

describe("월간 AI 비용 한도", () => {
  beforeEach(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("AI_MONTHLY_BUDGET_USD", "3");
    reserveMonthlyAiBudget.mockReset();
  });

  afterEach(() => vi.unstubAllEnvs());

  it("한도 아래에서는 요청을 통과시킨다", async () => {
    reserveMonthlyAiBudget.mockResolvedValue(reservation(true));
    expect(await guardRateLimit("ai", `under-${Math.random()}`)).toBeNull();
  });

  it("한도에 도달하면 다음 달 초기화 시각과 함께 차단한다", async () => {
    reserveMonthlyAiBudget.mockResolvedValue(reservation(false));
    const response = await guardRateLimit("ai", `blocked-${Math.random()}`);
    expect(response?.status).toBe(429);
    expect(await response?.json()).toMatchObject({
      kind: "ai-monthly",
      resetAt: "2026-09-30T15:00:00.000Z",
    });
  });

  it("사용량 저장소 오류 때 비용 발생 작업을 시작하지 않는다", async () => {
    reserveMonthlyAiBudget.mockRejectedValue(new Error("db unavailable"));
    const response = await guardRateLimit("ai", `unavailable-${Math.random()}`);
    expect(response?.status).toBe(503);
    expect(response?.headers.get("Retry-After")).toBe("30");
  });
});
