import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ config: vi.fn(), dispatch: vi.fn() }));
vi.mock("@/lib/push", () => ({ getPushConfig: mocks.config }));
vi.mock("@/lib/services/push-reminders", () => ({ dispatchPushReminders: mocks.dispatch }));

import { GET, POST } from "./route";

const secret = "s".repeat(32);
const request = (token = secret, body: unknown = {}) =>
  new Request("http://localhost/api/internal/push-reminders", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
describe("scheduled reminder worker", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("PUSH_WORKER_SECRET", secret);
    mocks.config.mockReturnValue({ publicKey: "key" });
    mocks.dispatch.mockResolvedValue({ sent: 1, retried: 0, closed: 0 });
  });
  afterEach(() => vi.unstubAllEnvs());
  it("rejects missing configuration and bad worker credentials without claiming deliveries", async () => {
    vi.stubEnv("PUSH_WORKER_SECRET", "");
    expect((await POST(request())).status).toBe(503);
    vi.stubEnv("PUSH_WORKER_SECRET", secret);
    expect((await POST(request("bad"))).status).toBe(401);
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });
  it("checks readiness without sending notifications", async () => {
    expect((await GET(request())).status).toBe(200);
    expect(mocks.dispatch).not.toHaveBeenCalled();
    mocks.config.mockReturnValue(null);
    expect((await POST(request())).status).toBe(503);
  });
  it("rejects unbounded input and awaits the bounded dispatch result", async () => {
    expect((await POST(request(secret, { limit: 1000 }))).status).toBe(400);
    expect(await (await POST(request())).json()).toEqual({
      ok: true,
      sent: 1,
      retried: 0,
      closed: 0,
    });
    expect(mocks.dispatch).toHaveBeenCalledWith(undefined);
  });
});
