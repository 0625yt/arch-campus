import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  writes: [] as Array<Record<string, unknown>>,
  filters: [] as Array<[string, string]>,
}));
vi.mock("@/lib/supabase/admin", () => ({
  getAdminSupabase: () => ({
    rpc: mocks.rpc,
    from: () => ({
      update: (row: Record<string, unknown>) => {
        mocks.writes.push(row);
        const query = {
          eq: (key: string, value: string) => {
            mocks.filters.push([key, value]);
            return mocks.filters.length === 2 ? Promise.resolve({ error: null }) : query;
          },
        };
        return query;
      },
    }),
  }),
}));

import { commitMaterialJobResult } from "./material-job-result";

const input = {
  execution: { jobId: "job", retryCount: 1 },
  ownerId: "owner",
  materialId: "material",
  modelId: "fixture",
  usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0 },
  costUsd: 0.01,
  result: { quality: {} },
  generationId: "generation",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.writes.length = 0;
  mocks.filters.length = 0;
});
describe("atomic job result transport", () => {
  it("keeps discarded billed calls out of successful activity without changing their costs", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect(await commitMaterialJobResult(input)).toBeNull();
    expect(mocks.writes).toEqual([{ status: "error", error_message: expect.any(String) }]);
    expect(mocks.filters).toEqual([
      ["id", "generation"],
      ["owner_id", "owner"],
    ]);
  });
  it("does not fall back to writes when the RPC outcome is unknown", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "network" } });
    await expect(commitMaterialJobResult(input)).rejects.toThrow("저장하지 못했어요");
    expect(mocks.writes).toHaveLength(0);
  });
  it("returns the committed result without writing a separate completion", async () => {
    mocks.rpc.mockResolvedValue({ data: { quizId: "saved" }, error: null });
    expect(await commitMaterialJobResult(input)).toEqual({ quizId: "saved" });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "commit_material_job_result",
      expect.objectContaining({
        p_owner_id: "owner",
        p_material_id: "material",
        p_retry_count: 1,
        p_generation_id: "generation",
      }),
    );
    expect(mocks.writes).toHaveLength(0);
  });
});
