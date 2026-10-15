import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyStudyWorkspace } from "@/lib/study-plan";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  from: vi.fn(),
  eq: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  single: vi.fn(),
  maybeSingle: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ getAdminSupabase: mocks.admin }));
vi.mock("./reviews", () => ({ listReviewQueue: vi.fn() }));

import { getStudyWorkspace, saveStudyWorkspace } from "./study-plans";

describe("study persistence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: mocks.eq,
      insert: mocks.insert,
      update: mocks.update,
      single: mocks.single,
      maybeSingle: mocks.maybeSingle,
    };
    mocks.eq.mockReturnValue(query);
    mocks.insert.mockReturnValue(query);
    mocks.update.mockReturnValue(query);
    mocks.from.mockReturnValue(query);
    mocks.admin.mockReturnValue({ from: mocks.from });
  });
  it("creates a default only when there really is no stored row", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await getStudyWorkspace("owner-a")).toEqual(emptyStudyWorkspace());
    expect(mocks.eq).toHaveBeenCalledWith("owner_id", "owner-a");
  });
  it("does not disguise storage outages or malformed plans as an empty workspace", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { code: "42P01" } });
    await expect(getStudyWorkspace("owner-a")).rejects.toMatchObject({ status: 503 });
    mocks.maybeSingle.mockResolvedValue({
      data: { daily_minutes: 0, plans: [], revision: 1 },
      error: null,
    });
    await expect(getStudyWorkspace("owner-a")).rejects.toMatchObject({ status: 503 });
  });
  it("uses the server owner on first insert and returns the saved revision", async () => {
    mocks.single.mockResolvedValue({ data: { revision: 1 }, error: null });
    expect((await saveStudyWorkspace("owner-a", emptyStudyWorkspace())).revision).toBe(1);
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ owner_id: "owner-a", revision: 1 }),
    );
  });
  it("compares the owner and observed revision in the actual update query", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { revision: 3 }, error: null });
    await saveStudyWorkspace("owner-a", { ...emptyStudyWorkspace(), revision: 2 });
    expect(mocks.eq.mock.calls).toEqual([
      ["owner_id", "owner-a"],
      ["revision", 2],
    ]);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ revision: 3 }));
  });
  it("reports a stale update or concurrent first insert as conflict", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(
      saveStudyWorkspace("owner-a", { ...emptyStudyWorkspace(), revision: 1 }),
    ).rejects.toMatchObject({ status: 409 });
    mocks.single.mockResolvedValue({ data: null, error: { code: "23505" } });
    await expect(saveStudyWorkspace("owner-a", emptyStudyWorkspace())).rejects.toMatchObject({
      status: 409,
    });
  });
});
