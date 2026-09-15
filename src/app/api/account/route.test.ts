import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOwnerId: vi.fn(),
  guardRateLimit: vi.fn(),
  getAdminSupabase: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getOwnerId: mocks.getOwnerId,
  UnauthorizedError: class UnauthorizedError extends Error {},
}));

vi.mock("@/lib/ratelimit", () => ({
  guardRateLimit: mocks.guardRateLimit,
}));

vi.mock("@/lib/supabase/admin", () => ({
  getAdminSupabase: mocks.getAdminSupabase,
}));

vi.mock("@/lib/audit", () => ({
  pickRequestContext: () => ({ ip: null, userAgent: null }),
  recordAudit: mocks.recordAudit,
}));

import { DELETE } from "./route";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";

describe("DELETE /api/account", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOwnerId.mockResolvedValue(OWNER_ID);
    mocks.guardRateLimit.mockResolvedValue(null);
  });

  it("keeps the account when storage listing fails", async () => {
    const deleteUser = vi.fn();
    const list = vi.fn().mockResolvedValue({ data: null, error: { message: "list failed" } });
    const remove = vi.fn();

    mocks.getAdminSupabase.mockReturnValue({
      storage: { from: () => ({ list, remove }) },
      auth: { admin: { deleteUser } },
    });

    const response = await DELETE(
      new Request("http://localhost/api/account", { method: "DELETE" }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("계정 삭제를 중단"),
    });
    expect(deleteUser).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("keeps the account when any storage removal fails", async () => {
    const deleteUser = vi.fn();
    const list = vi.fn().mockResolvedValue({ data: [{ name: "material.pdf" }], error: null });
    const remove = vi.fn().mockResolvedValue({ error: { message: "remove failed" } });

    mocks.getAdminSupabase.mockReturnValue({
      storage: { from: () => ({ list, remove }) },
      auth: { admin: { deleteUser } },
    });

    const response = await DELETE(
      new Request("http://localhost/api/account", { method: "DELETE" }),
    );

    expect(remove).toHaveBeenCalledWith([`${OWNER_ID}/material.pdf`]);
    expect(response.status).toBe(500);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});
