import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    row: { id: "job", owner_id: "owner", status: "pending", retry_count: 0 } as Record<
      string,
      unknown
    >,
    rows: null as Record<string, unknown>[] | null,
    error: false,
    completeBeforeUpdate: false,
    restartBeforeUpdate: false,
    advanceRetryBeforeUpdate: true,
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  getAdminSupabase: () => ({
    from: () => {
      let single = false;
      let orderKey = "";
      let ascending = true;
      let rowLimit = Number.POSITIVE_INFINITY;
      let patch: Record<string, unknown> = {},
        filters: ((row: Record<string, unknown>) => boolean)[] = [];
      const execute = () => {
        if (patch.status === "error" && state.completeBeforeUpdate) state.row.status = "done";
        if (patch.status && state.restartBeforeUpdate) {
          state.row.started_at = new Date().toISOString();
          if (state.advanceRetryBeforeUpdate) state.row.retry_count = 1;
        }
        if (state.error) return { data: null, error: { message: "database unavailable" } };
        const matched = (state.rows ?? [state.row])
          .filter((row) => filters.every((filter) => filter(row)))
          .sort((a, b) =>
            ascending
              ? String(a[orderKey]).localeCompare(String(b[orderKey]))
              : String(b[orderKey]).localeCompare(String(a[orderKey])),
          )
          .slice(0, rowLimit);
        for (const row of matched) Object.assign(row, patch);
        const data = matched.map((row) => ({ ...row }));
        return { data: single ? (data[0] ?? null) : data, error: null };
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
        is: (key: string, value: unknown) => {
          filters.push((row) => row[key] === value);
          return query;
        },
        select: () => query,
        order: (key: string, options: { ascending: boolean }) => {
          orderKey = key;
          ascending = options.ascending;
          return query;
        },
        limit: (value: number) => {
          rowLimit = value;
          return query;
        },
        maybeSingle: () => {
          single = true;
          return query;
        },
      });
      return query;
    },
  }),
}));

import {
  canAutoRetry,
  claimStaleMaterialJobsForRetry,
  getLatestJob,
  listActiveJobs,
  markJobDone,
  markJobError,
  markJobRunning,
} from "./jobs";

beforeEach(() => {
  state.row = { id: "job", owner_id: "owner", status: "pending", retry_count: 0 };
  state.rows = null;
  state.error = false;
  state.completeBeforeUpdate = false;
  state.restartBeforeUpdate = false;
  state.advanceRetryBeforeUpdate = true;
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
  it("does not let the original callback claim a retry", async () => {
    state.row.retry_count = 1;
    expect(await markJobRunning({ jobId: "job", ownerId: "owner" })).toBe(false);
    expect(await markJobRunning({ jobId: "job", ownerId: "owner", retryCount: 1 })).toBe(true);
  });
  it("ignores an original execution's late completion and error during a retry", async () => {
    state.row.status = "running";
    state.row.retry_count = 1;
    await markJobDone({
      jobId: "job",
      ownerId: "owner",
      result: { stale: true },
      modelId: "fixture",
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
      costUsd: 0,
    });
    await markJobError({ jobId: "job", ownerId: "owner", errorMessage: "late" });
    expect(state.row.status).toBe("running");
    expect(state.row.result).toBeUndefined();
    await markJobError({ jobId: "job", ownerId: "owner", retryCount: 1, errorMessage: "current" });
    expect(state.row.status).toBe("error");
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

describe("stale automatic retry policy", () => {
  const stale = {
    tool: "summarize",
    status: "running" as const,
    retry_count: 0,
    created_at: "2020-01-01T00:00:00Z",
    started_at: "2020-01-01T00:00:00Z",
  };
  it("retries a stale summary once", () => {
    expect(canAutoRetry(stale)).toBe(true);
    expect(canAutoRetry({ ...stale, retry_count: 1 })).toBe(false);
  });
  it("keeps unsupported tools on the manual recovery path", () => {
    expect(canAutoRetry({ ...stale, tool: "presentation" })).toBe(false);
  });
});

it("stale cleanup preserves a worker completion that won the race", async () => {
  state.row = {
    id: "job",
    owner_id: "owner",
    material_id: "material",
    tool: "summarize",
    status: "running",
    retry_count: 1,
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

it("keeps a retry that restarts after the latest stale row was read", async () => {
  state.row = {
    id: "job",
    owner_id: "owner",
    material_id: "material",
    tool: "presentation",
    status: "running",
    retry_count: 0,
    created_at: "2020-01-01T00:00:00Z",
    started_at: "2020-01-01T00:00:00Z",
  };
  state.restartBeforeUpdate = true;
  const result = await getLatestJob({
    ownerId: "owner",
    materialId: "material",
    tool: "presentation",
  });
  expect(result?.status).toBe("running");
  expect(result?.retryCount).toBe(1);
});

it("claims one stale job per poll and leaves the rest eligible for recovery", async () => {
  state.rows = ["first", "second", "other-owner"].map((id) => ({
    id,
    owner_id: id === "other-owner" ? "other" : "owner",
    tool: "summarize",
    status: "running",
    retry_count: 0,
    created_at: "2020-01-01T00:00:00Z",
    started_at: "2020-01-01T00:00:00Z",
  }));
  const claimed = await claimStaleMaterialJobsForRetry({ ownerId: "owner" });
  expect(claimed.map((job) => job.id)).toEqual(["first"]);
  const active = await listActiveJobs({ ownerId: "owner" });
  expect(active.map((job) => job.id)).toEqual(["first", "second"]);
  expect(state.rows[1].retry_count).toBe(0);
  expect(state.rows[1].status).toBe("running");
  expect(state.rows[2].retry_count).toBe(0);
});

it("does not claim a job whose worker started after the stale SELECT", async () => {
  state.row = {
    id: "job",
    owner_id: "owner",
    tool: "quiz",
    status: "pending",
    retry_count: 0,
    created_at: "2020-01-01T00:00:00Z",
    started_at: null,
  };
  state.restartBeforeUpdate = true;
  state.advanceRetryBeforeUpdate = false;
  expect(await claimStaleMaterialJobsForRetry({ ownerId: "owner" })).toEqual([]);
  expect(state.row.status).toBe("pending");
});

it("active-list cleanup preserves a completion after the list was read", async () => {
  state.row = {
    id: "job",
    owner_id: "owner",
    status: "running",
    retry_count: 1,
    created_at: "2020-01-01T00:00:00Z",
    started_at: "2020-01-01T00:00:00Z",
  };
  state.completeBeforeUpdate = true;
  await listActiveJobs({ ownerId: "owner" });
  expect(state.row.status).toBe("done");
});
