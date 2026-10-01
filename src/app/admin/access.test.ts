import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  owner: vi.fn(),
  allowed: vi.fn(),
  database: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ tryGetOwnerId: mocks.owner }));
vi.mock("@/lib/auth/admin", () => ({ isAdminUserId: mocks.allowed }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminSupabase: mocks.database }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("404");
  },
}));

import AdminFeedbackPage from "./feedback/page";
import AdminJobsPage from "./jobs/page";

beforeEach(() => vi.clearAllMocks());
describe("admin data access", () => {
  for (const [label, page] of [
    ["jobs", AdminJobsPage],
    ["feedback", AdminFeedbackPage],
  ] as const) {
    it(`${label}: denies signed-in non-admins before accessing privileged data`, async () => {
      mocks.owner.mockResolvedValue("ordinary-user");
      mocks.allowed.mockReturnValue(false);
      await expect(page({ searchParams: Promise.resolve({}) })).rejects.toThrow("404");
      expect(mocks.database).not.toHaveBeenCalled();
    });
    it(`${label}: denies missing sessions before accessing privileged data`, async () => {
      mocks.owner.mockResolvedValue(null);
      mocks.allowed.mockReturnValue(false);
      await expect(page({ searchParams: Promise.resolve({}) })).rejects.toThrow("404");
      expect(mocks.database).not.toHaveBeenCalled();
    });
  }
});
