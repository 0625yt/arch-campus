import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    row: { id: "job", owner_id: "owner", status: "pending" } as Record<string, unknown>,
    error: false,
    completeBeforeUpdate: false,
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  getAdminSupabase: () => ({
    from: () => {
      let patch: Record<string, unknown> = {},
        filters: ((row: Record<string, unknown>) => boolean)[] = [];
      const execute = () => {
        if (patch.status === "error" && state.completeBeforeUpdate) state.row.status = "done";
        if (state.error) return { data: null, error: { message: "database unavailable" } };
        if (!filters.every((f) => f(state.row))) return { data: null, error: null };
        Object.assign(state.row, patch);
        return { data: { ...state.row }, error: null };
      };
      const query = Object.assign(Promise.resolve().then(execute), {
        update: (value: Record<string, unknown>) => {
          patch = value;
          return query;
        },
        eq: (key: string, value: unknown) => {
          filters.push((row) => row[key] === value);
          return query;
        },
        in: (key: string, values: unknown[]) => {
          filters.push((row) => values.includes(row[key]));
          return query;
        },
        select: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: () => query,
      });
      return query;
    },
  }),
}));

import { getLatestJob, markJobDone, markJobError, markJobRunning } from "./jobs";

beforeEach(() => {
  state.row = { id: "job", owner_id: "owner", status: "pending" };
  state.error = false;
  state.completeBeforeUpdate = false;
});
describe("job state transitions", () => {
  it("only one worker can claim the pending job", async () => {
    expect(await markJobRunning({ jobId: "job", ownerId: "owner" })).toBe(true);
    expect(await markJobRunning({ jobId: "job", ownerId: "owner" })).toBe(false);
  });
  it("rejects a different owner's claim", async () => {
    expect(await markJobRunning({ jobId: "job", ownerId: "other" })).toBe(false);
    expect(state.row.status).toBe("pending");
  });
  it("keeps completed results when a delayed failure arrives", async () => {
    state.row.status = "done";
    await markJobError({ jobId: "job", ownerId: "owner", errorMessage: "late" });
    expect(state.row.status).toBe("done");
  });
  it("does not resurrect an expired job on late completion", async () => {
    state.row.status = "error";
    await markJobDone({
      jobId: "job",
      ownerId: "owner",
      result: {},
      modelId: "fixture",
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
      costUsd: 0,
    });
    expect(state.row.status).toBe("error");
  });
  it("does not silently claim success when persistence fails", async () => {
    state.error = true;
    await expect(markJobRunning({ jobId: "job", ownerId: "owner" })).rejects.toThrow();
    await expect(
      markJobError({ jobId: "job", ownerId: "owner", errorMessage: "failure" }),
    ).rejects.toThrow();
  });
});

it("stale cleanup preserves a worker completion that won the race", async () => {
  state.row = {
    id: "job",
    owner_id: "owner",
    material_id: "material",
    tool: "summarize",
    status: "running",
    created_at: "2020-01-01T00:00:00Z",
    started_at: "2020-01-01T00:00:00Z",
  };
  state.completeBeforeUpdate = true;
  const result = await getLatestJob({
    ownerId: "owner",
    materialId: "material",
    tool: "summarize",
  });
  expect(result?.status).toBe("done");
  expect(state.row.status).toBe("done");
});
