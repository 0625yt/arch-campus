import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  owner: vi.fn(),
  config: vi.fn(),
  limit: vi.fn(),
  admin: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  query: { select: vi.fn(), delete: vi.fn(), eq: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ tryGetOwnerId: mocks.owner }));
vi.mock("@/lib/push", () => ({ getPushConfig: mocks.config }));
vi.mock("@/lib/ratelimit", () => ({ guardRateLimit: mocks.limit }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminSupabase: mocks.admin }));

import { DELETE, GET, POST } from "./route";

const body = {
  endpoint: "https://fcm.googleapis.com/test",
  keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) },
};
const request = (method: string, value: unknown) =>
  new Request("http://localhost/api/push/subscriptions", { method, body: JSON.stringify(value) });

describe("push subscription authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.owner.mockResolvedValue("owner-a");
    mocks.config.mockReturnValue({ publicKey: "public" });
    mocks.limit.mockResolvedValue(null);
    mocks.admin.mockReturnValue({ rpc: mocks.rpc, from: mocks.from });
    mocks.from.mockReturnValue(mocks.query);
    mocks.query.select.mockReturnThis();
    mocks.query.delete.mockReturnThis();
    mocks.query.eq.mockReturnThis();
    mocks.rpc.mockResolvedValue({ data: "id", error: null });
  });
  it("requires a session before querying or accepting any subscription", async () => {
    mocks.owner.mockResolvedValue(null);
    for (const response of [
      await GET(),
      await POST(request("POST", body)),
      await DELETE(request("DELETE", { endpoint: body.endpoint })),
    ])
      expect(response.status).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("reports missing configuration without connecting to the database", async () => {
    mocks.config.mockReturnValue(null);
    expect(await (await GET()).json()).toMatchObject({ configured: false });
    expect((await POST(request("POST", body))).status).toBe(503);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("returns only owner-filtered hashes, never endpoint or encryption keys", async () => {
    mocks.query.eq.mockResolvedValue({ data: [{ endpoint_hash: "hash" }], error: null });
    expect(await (await GET()).json()).toEqual({
      ok: true,
      configured: true,
      publicKey: "public",
      endpointHashes: ["hash"],
    });
    expect(mocks.query.eq).toHaveBeenCalledWith("owner_id", "owner-a");
    expect(mocks.query.select).toHaveBeenCalledWith("endpoint_hash");
  });
  it("takes the owner only from the authenticated session", async () => {
    expect((await POST(request("POST", { ...body, owner_id: "other" }))).status).toBe(400);
    expect((await POST(request("POST", body))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "register_push_subscription",
      expect.objectContaining({ p_owner_id: "owner-a", p_endpoint: body.endpoint }),
    );
  });
  it("refuses arbitrary outbound URLs before database registration", async () => {
    expect(
      (await POST(request("POST", { ...body, endpoint: "https://127.0.0.1/admin" }))).status,
    ).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not steal another owner's browser subscription", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "23505" } });
    expect((await POST(request("POST", body))).status).toBe(409);
  });
  it("owner-scopes revocation even while delivery configuration is disabled", async () => {
    mocks.config.mockReturnValue(null);
    mocks.query.eq.mockReturnValueOnce(mocks.query).mockResolvedValueOnce({ error: null });
    expect((await DELETE(request("DELETE", { endpoint: body.endpoint }))).status).toBe(200);
    expect(mocks.query.eq.mock.calls).toEqual([
      ["owner_id", "owner-a"],
      ["endpoint", body.endpoint],
    ]);
  });
});
