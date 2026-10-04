import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), reserve: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminSupabase: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/data/ai-usage", () => ({ reserveMonthlyAiBudget: mocks.reserve }));

import { checkRateLimit, guardRateLimit } from "./ratelimit";

function result(data: unknown, error: unknown = null) {
  mocks.rpc.mockReturnValue({ abortSignal: () => Promise.resolve({ data, error }) });
}
function bucket(allowed = true, remaining = 5) {
  return [{ allowed, remaining, reset_ms: Date.now() + 60_000 }];
}

describe("shared rate limits", () => {
  beforeEach(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "server-only-fixture");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AI_MONTHLY_BUDGET_USD", "3");
    vi.clearAllMocks();
    result(bucket());
  });
  afterEach(() => vi.unstubAllEnvs());

  it("uses a stable secret-keyed hash and keeps raw identifiers out of the database", async () => {
    await checkRateLimit("ai", "192.0.2.10");
    await checkRateLimit("ai", "192.0.2.10");
    const args = mocks.rpc.mock.calls[0][1];
    expect(args).toEqual({
      p_kind: "ai",
      p_identifier_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_tokens: 6,
      p_window_ms: 60_000,
    });
    expect(mocks.rpc.mock.calls[1][1]).toEqual(args);
    expect(JSON.stringify(args)).not.toContain("192.0.2.10");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "rotated-fixture");
    await checkRateLimit("ai", "192.0.2.10");
    expect(mocks.rpc.mock.calls[2][1].p_identifier_hash).not.toBe(args.p_identifier_hash);
  });

  it("preserves the login policy and normalizes unknown categories to default", async () => {
    result(bucket(true, 9));
    await checkRateLimit("login", "owner");
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_tokens: 10, p_window_ms: 300_000 });
    result(bucket(true, 59));
    await checkRateLimit("constructor", "owner");
    expect(mocks.rpc.mock.calls[1][1]).toMatchObject({ p_kind: "default", p_tokens: 60 });
  });

  it("returns shared remaining counts and a retry time when exhausted", async () => {
    expect((await checkRateLimit("ai", "owner")).headers["X-RateLimit-Remaining"]).toBe("5");
    result(bucket(false, 0));
    const response = await guardRateLimit("ai", "owner");
    expect(response?.status).toBe(429);
    expect(Number(response?.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it("never starts budget reservations on database errors or falls back to memory", async () => {
    result(null, { code: "PGRST202" });
    for (let i = 0; i < 2; i++) {
      const response = await guardRateLimit("ai", "owner");
      expect(response?.status).toBe(503);
      expect(response?.headers.get("Retry-After")).toBe("30");
    }
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it("fails closed when the database request times out", async () => {
    mocks.rpc.mockReturnValue({
      abortSignal: (signal: AbortSignal) => {
        expect(signal).toBeInstanceOf(AbortSignal);
        return Promise.reject(new Error("timeout"));
      },
    });
    expect(await checkRateLimit("ai", "owner")).toMatchObject({
      success: false,
      unavailable: true,
    });
  });

  it.each([
    null,
    [],
    [{ allowed: true, remaining: 6, reset_ms: 1 }],
    [{ allowed: false, remaining: 1, reset_ms: 1 }],
    [{ allowed: true, remaining: 1, reset_ms: "wrong" }],
  ])("rejects invalid database responses: %j", async (data) => {
    result(data);
    expect(await checkRateLimit("ai", "owner")).toMatchObject({
      success: false,
      unavailable: true,
    });
  });

  it("rejects missing shared stores in production", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(await checkRateLimit("ai", "owner")).toMatchObject({
      success: false,
      unavailable: true,
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
