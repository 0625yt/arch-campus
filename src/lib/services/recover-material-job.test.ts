import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobView } from "@/lib/data/jobs";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  reserve: vi.fn(),
  checkpoint: vi.fn(),
  done: vi.fn(),
  error: vi.fn(),
  summary: vi.fn(),
  quiz: vi.fn(),
  materials: vi.fn(),
}));
vi.mock("@/lib/data/jobs", () => ({
  markJobRunning: mocks.claim,
  recordJobCheckpoint: mocks.checkpoint,
  markJobDone: mocks.done,
  markJobError: mocks.error,
}));
vi.mock("@/lib/data/ai-usage", () => ({ reserveMonthlyAiBudget: mocks.reserve }));
vi.mock("@/lib/services/summarize", () => ({ runSummarize: mocks.summary }));
vi.mock("@/lib/services/quiz", () => ({ runQuizGeneration: mocks.quiz }));
vi.mock("@/lib/supabase/admin", () => ({
  getAdminSupabase: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        in: mocks.materials,
      };
      return query;
    },
  }),
}));

import { runRecoveredMaterialJob } from "./recover-material-job";

const job: JobView = {
  id: "job",
  ownerId: "owner",
  materialId: "primary",
  tool: "summarize",
  status: "pending",
  inputParams: {},
  result: null,
  errorMessage: null,
  modelId: null,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  costUsd: 0,
  generationId: null,
  retryCount: 1,
  checkpointStage: "retry-queued",
  checkpointProgress: 0,
  checkpointMessage: null,
  checkpointUpdatedAt: "2026-10-03T00:00:00Z",
  createdAt: "2026-10-03T00:00:00Z",
  startedAt: null,
  finishedAt: null,
};
const execution = { jobId: "job", ownerId: "owner", retryCount: 1 };
const primary = {
  id: "primary",
  course_id: "course",
  title: "가상 강의",
  type: "lecture",
  full_text: "가상 자료 본문",
  page_count: 1,
  mime_type: "text/plain",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.claim.mockResolvedValue(true);
  mocks.reserve.mockResolvedValue({ allowed: true });
  mocks.checkpoint.mockResolvedValue(true);
  mocks.materials.mockResolvedValue({ data: [primary], error: null });
  mocks.summary.mockResolvedValue({
    ok: true,
    summary: { keywords: [] },
    modelId: "fixture",
    usage: {},
    costUsd: 0,
  });
  mocks.quiz.mockResolvedValue({
    ok: true,
    quizId: "quiz",
    quality: {},
    modelId: "fixture",
    usage: {},
    costUsd: 0,
  });
});

describe("recovered material execution", () => {
  it("skips budget and AI when another callback already owns the job", async () => {
    mocks.claim.mockResolvedValue(false);
    await runRecoveredMaterialJob(job);
    expect(mocks.claim).toHaveBeenCalledWith(execution);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.summary).not.toHaveBeenCalled();
    expect(mocks.quiz).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("does not reserve cost for a deleted source", async () => {
    mocks.materials.mockResolvedValue({ data: [], error: null });
    await runRecoveredMaterialJob(job);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.summary).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith(expect.objectContaining(execution));
  });

  it("stops before reserving or generating if its checkpoint is rejected", async () => {
    mocks.checkpoint.mockResolvedValue(false);
    await runRecoveredMaterialJob(job);
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(mocks.summary).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("records a budget denial against the retry and makes no AI call", async () => {
    mocks.reserve.mockResolvedValue({ allowed: false });
    await runRecoveredMaterialJob(job);
    expect(mocks.summary).not.toHaveBeenCalled();
    expect(mocks.quiz).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ ...execution, errorMessage: expect.stringContaining("월간 AI") }),
    );
  });

  it("resumes a summary and fences every checkpoint and completion to the retry", async () => {
    await runRecoveredMaterialJob(job);
    expect(mocks.reserve).toHaveBeenCalledTimes(1);
    expect(mocks.summary).toHaveBeenCalledWith(
      expect.objectContaining({ materialId: "primary", fullText: primary.full_text }),
    );
    for (const [checkpoint] of mocks.checkpoint.mock.calls)
      expect(checkpoint).toMatchObject(execution);
    expect(mocks.done).toHaveBeenCalledWith(expect.objectContaining(execution));
  });

  it("resumes a quiz from the saved options and keeps the primary material first", async () => {
    const extra = { ...primary, id: "extra" };
    mocks.materials.mockResolvedValue({ data: [extra, primary], error: null });
    await runRecoveredMaterialJob({
      ...job,
      tool: "quiz",
      inputParams: {
        extraMaterialIds: ["extra"],
        count: 6,
        kinds: ["essay"],
        difficulty: "어려움",
        scope: "1장",
      },
    });
    const input = mocks.quiz.mock.calls[0][0];
    expect(input.materials.map((material: { materialId: string }) => material.materialId)).toEqual([
      "primary",
      "extra",
    ]);
    expect(input).toMatchObject({
      requestedCount: 6,
      kinds: ["essay"],
      difficulty: "어려움",
      scope: "1장",
    });
    expect(mocks.done).toHaveBeenCalledWith(
      expect.objectContaining({ ...execution, result: { quizId: "quiz", quality: {} } }),
    );
  });

  it("does not complete a retry when the execution ended during generation", async () => {
    mocks.summary.mockImplementation(async () => {
      mocks.checkpoint.mockResolvedValue(false);
      return { ok: true, summary: {}, modelId: "fixture", usage: {}, costUsd: 0 };
    });
    await runRecoveredMaterialJob(job);
    expect(mocks.done).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });
});
