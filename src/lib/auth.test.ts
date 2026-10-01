import { beforeEach, describe, expect, it, vi } from "vitest";

const { currentUser } = vi.hoisted(() => ({ currentUser: vi.fn() }));
vi.mock("./supabase/server", () => ({ getCurrentUser: currentUser }));

import { DEV_FALLBACK_USER_ID, getOwnerId, tryGetOwnerId, UnauthorizedError } from "./auth";
import { MfaRequiredError } from "./mfa";

beforeEach(() => {
  vi.unstubAllEnvs();
  currentUser.mockReset();
});
describe("owner authorization", () => {
  it("uses the authenticated identity", async () => {
    currentUser.mockResolvedValue({ id: "actual-owner" });
    expect(await getOwnerId()).toBe("actual-owner");
  });
  it("denies missing production sessions", async () => {
    vi.stubEnv("NODE_ENV", "production");
    currentUser.mockResolvedValue(null);
    await expect(getOwnerId()).rejects.toBeInstanceOf(UnauthorizedError);
  });
  it("allows an explicit development fixture only without a real session", async () => {
    vi.stubEnv("NODE_ENV", "development");
    currentUser.mockResolvedValue(null);
    expect(await getOwnerId()).toBe(DEV_FALLBACK_USER_ID);
  });
  it.each([
    "production",
    "development",
  ])("never downgrades pending MFA to a fallback identity (%s)", async (env) => {
    vi.stubEnv("NODE_ENV", env);
    currentUser.mockRejectedValue(new MfaRequiredError());
    await expect(getOwnerId()).rejects.toBeInstanceOf(UnauthorizedError);
    expect(await tryGetOwnerId()).toBeNull();
  });
  it("does not substitute a user when the auth service fails", async () => {
    currentUser.mockRejectedValue(new Error("unavailable"));
    await expect(getOwnerId()).rejects.toThrow("unavailable");
  });
});
