import type { SupabaseClient, User } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { requiresMfa } from "./mfa";

function fixture(status: string | null, currentLevel: string | null, error: object | null = null) {
  const check = vi.fn().mockResolvedValue({ data: { currentLevel }, error });
  const client = {
    auth: { mfa: { getAuthenticatorAssuranceLevel: check } },
  } as unknown as SupabaseClient;
  const user = { id: "user-a", factors: status ? [{ status }] : [] } as unknown as User;
  return { client, user, check };
}
describe("MFA authorization", () => {
  it.each([null, "unverified"])("does not lock out unenrolled users (%s)", async (status) => {
    const { client, user, check } = fixture(status, "aal1");
    expect(await requiresMfa(client, user)).toBe(false);
    expect(check).not.toHaveBeenCalled();
  });
  it.each(["aal1", null])("rejects verified accounts without AAL2 (%s)", async (level) => {
    const { client, user } = fixture("verified", level);
    expect(await requiresMfa(client, user)).toBe(true);
  });
  it("allows verified AAL2 sessions", async () => {
    const { client, user } = fixture("verified", "aal2");
    expect(await requiresMfa(client, user)).toBe(false);
  });
  it("fails closed when assurance lookup fails", async () => {
    const { client, user } = fixture("verified", "aal2", {});
    expect(await requiresMfa(client, user)).toBe(true);
  });
});
