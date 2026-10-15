import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyStudyWorkspace } from "@/lib/study-plan";

const mocks = vi.hoisted(() => ({
  owner: vi.fn(),
  limit: vi.fn(),
  load: vi.fn(),
  catalog: vi.fn(),
  save: vi.fn(),
  admin: vi.fn(),
  from: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
  in: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ tryGetOwnerId: mocks.owner }));
vi.mock("@/lib/ratelimit", () => ({ guardRateLimit: mocks.limit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminSupabase: mocks.admin }));
vi.mock("@/lib/data/study-plans", () => ({
  getStudyWorkspace: mocks.load,
  getStudyCatalog: mocks.catalog,
  saveStudyWorkspace: mocks.save,
  StudyStorageError: class extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));

import { GET, POST } from "./route";

const courseId = "00000000-0000-4000-8000-000000000010";
const materialId = "00000000-0000-4000-8000-000000000020";
const eventId = "00000000-0000-4000-8000-000000000030";
const body = {
  action: "create",
  revision: 0,
  courseId,
  title: "자료구조 시험",
  targetDate: "2026-10-15",
  scope: "3~7주차",
  materialIds: [materialId],
};
const request = (value: unknown) =>
  new Request("http://localhost/api/study-plans", { method: "POST", body: JSON.stringify(value) });

describe("study workspace API boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.setSystemTime(new Date("2026-10-08T03:00:00Z"));
    mocks.owner.mockResolvedValue("owner-a");
    mocks.limit.mockResolvedValue(null);
    mocks.load.mockResolvedValue(emptyStudyWorkspace());
    mocks.catalog.mockResolvedValue({ courses: [] });
    mocks.save.mockImplementation(async (_owner, workspace) => ({
      ...workspace,
      revision: workspace.revision + 1,
    }));
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: mocks.eq,
      maybeSingle: mocks.single,
      in: mocks.in,
    };
    mocks.eq.mockReturnValue(query);
    mocks.from.mockReturnValue(query);
    mocks.admin.mockReturnValue({ from: mocks.from });
    mocks.single.mockResolvedValue({ data: { id: courseId }, error: null });
    mocks.in.mockResolvedValue({ data: [{ id: materialId, title: "3주차" }], error: null });
  });
  it("rejects reads and writes without authentication before storage access", async () => {
    mocks.owner.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await POST(request(body))).status).toBe(401);
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("does not cache personal plans", async () => {
    const response = await GET();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.load).toHaveBeenCalledWith("owner-a");
    expect(mocks.catalog).toHaveBeenCalledWith("owner-a");
  });
  it("takes ownership only from the session and rejects unknown fields", async () => {
    expect((await POST(request({ ...body, owner_id: "other" }))).status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
    expect((await POST(request(body))).status).toBe(200);
    expect(mocks.eq).toHaveBeenCalledWith("owner_id", "owner-a");
    expect(mocks.eq).toHaveBeenCalledWith("course_id", courseId);
    expect(mocks.save).toHaveBeenCalledWith(
      "owner-a",
      expect.objectContaining({
        plans: [expect.objectContaining({ scope: body.scope, tasks: expect.any(Array) })],
      }),
    );
  });
  it("rejects foreign courses and materials", async () => {
    mocks.single.mockResolvedValue({ data: null, error: null });
    expect((await POST(request(body))).status).toBe(404);
    mocks.single.mockResolvedValue({ data: { id: courseId }, error: null });
    mocks.in.mockResolvedValue({ data: [], error: null });
    expect((await POST(request(body))).status).toBe(404);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("requires a confirmed owned exam matching the target date", async () => {
    mocks.single
      .mockResolvedValueOnce({ data: { id: courseId }, error: null })
      .mockResolvedValueOnce({ data: { starts_at: "2026-10-16T03:00:00Z" }, error: null });
    expect((await POST(request({ ...body, eventId }))).status).toBe(400);
    expect(mocks.eq).toHaveBeenCalledWith("confirmed", true);
    expect(mocks.eq).toHaveBeenCalledWith("kind", "exam");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("refuses stale revisions before any mutation", async () => {
    mocks.load.mockResolvedValue({ ...emptyStudyWorkspace(), revision: 2 });
    expect((await POST(request(body))).status).toBe(409);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("rejects invalid dates, oversized inputs and duplicate material IDs", async () => {
    expect((await POST(request({ ...body, targetDate: "2026-10-07" }))).status).toBe(400);
    expect((await POST(request({ ...body, materialIds: [materialId, materialId] }))).status).toBe(
      400,
    );
    expect((await POST(request({ ...body, scope: "x".repeat(9000) }))).status).toBe(413);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("rejects task IDs from other workspaces", async () => {
    expect(
      (
        await POST(
          request({ action: "complete", revision: 0, planId: courseId, taskId: materialId }),
        )
      ).status,
    ).toBe(404);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("does not remove active plans or another workspace's history", async () => {
    expect((await POST(request({ action: "remove", revision: 0, planId: courseId }))).status).toBe(
      400,
    );
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("keeps rate limiting before a write", async () => {
    mocks.limit.mockResolvedValue(new Response("limited", { status: 429 }));
    expect((await POST(request(body))).status).toBe(429);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it("rejects cross-origin browser writes before reading the workspace", async () => {
    const crossSite = new Request("http://localhost/api/study-plans", {
      method: "POST",
      headers: { origin: "https://other.example" },
      body: JSON.stringify(body),
    });
    expect((await POST(crossSite)).status).toBe(403);
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
