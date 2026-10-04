import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  run: vi.fn(),
  callbacks: [] as Array<() => unknown>,
}));
vi.mock("@/lib/data/jobs", () => ({ claimStaleMaterialJobForWorker: mocks.claim }));
vi.mock("@/lib/services/recover-material-job", () => ({ runRecoveredMaterialJob: mocks.run }));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (callback: () => unknown) => mocks.callbacks.push(callback),
}));

import { GET, POST } from "./route";

const secret = "fixture".repeat(8);
const ownerId = "00000000-0000-4000-8000-000000000001";
function request(body: unknown = {}, authorization = `Bearer ${secret}`) {
  return new Request("http://localhost/api/internal/material-jobs/recover", {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("JOB_WORKER_SECRET", secret);
  mocks.callbacks.length = 0;
  mocks.claim.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());
describe("server material job worker", () => {
  it("checks authenticated readiness without claiming real jobs", async () => {
    expect((await GET(request({}, ""))).status).toBe(401);
    expect(await (await GET(request())).json()).toEqual({ ok: true });
    expect(mocks.claim).not.toHaveBeenCalled();
  });
  it("fails closed when the secret is absent", async () => {
    vi.stubEnv("JOB_WORKER_SECRET", "");
    expect((await POST(request())).status).toBe(503);
    expect(mocks.claim).not.toHaveBeenCalled();
  });
  it("rejects anonymous and wrong tokens before reading jobs", async () => {
    for (const token of ["", "Bearer wrong", secret])
      expect((await POST(request({}, token))).status).toBe(401);
    expect(mocks.claim).not.toHaveBeenCalled();
  });
  it("rejects invalid operator scopes and extra input", async () => {
    for (const body of [{ ownerId: "wrong" }, { tool: "quiz" }])
      expect((await POST(request(body))).status).toBe(400);
    expect(mocks.claim).not.toHaveBeenCalled();
  });
  it("returns no private job data when there is nothing due", async () => {
    const response = await POST(request());
    expect(await response.json()).toEqual({ ok: true, resumed: 0, closed: 0 });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.claim).toHaveBeenCalledWith(undefined);
    expect(mocks.callbacks).toHaveLength(0);
  });
  it("schedules only the claimed database owner and attempt", async () => {
    const job = { id: "job", ownerId, retryCount: 1, status: "pending" };
    mocks.claim.mockResolvedValue(job);
    const response = await POST(request({ ownerId }));
    expect(await response.json()).toEqual({ ok: true, resumed: 1, closed: 0 });
    expect(mocks.claim).toHaveBeenCalledWith(ownerId);
    expect(mocks.callbacks).toHaveLength(1);
    await mocks.callbacks[0]();
    expect(mocks.run).toHaveBeenCalledWith(job);
  });
  it("does not start AI when the second interrupted attempt is closed", async () => {
    mocks.claim.mockResolvedValue({ status: "error" });
    expect(await (await POST(request())).json()).toEqual({ ok: true, resumed: 0, closed: 1 });
    expect(mocks.callbacks).toHaveLength(0);
  });
  it("does not report success when the database claim fails", async () => {
    mocks.claim.mockRejectedValue(new Error("fixture"));
    expect((await POST(request())).status).toBe(503);
    expect(mocks.callbacks).toHaveLength(0);
  });
});
