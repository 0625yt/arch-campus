import { beforeEach, describe, expect, it, vi } from "vitest";
import { estimateCost } from "@/lib/claude";
import { runSummarize } from "./summarize";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  commit: vi.fn(),
  generations: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ row: Record<string, unknown>; filters: Array<[string, string]> }>,
}));
vi.mock("@/lib/data/material-job-result", () => ({ commitMaterialJobResult: mocks.commit }));
vi.mock("@/lib/claude", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/claude")>()),
  generate: mocks.generate,
}));
vi.mock("@/lib/classify-material", () => ({
  classifyMaterial: async () => null,
  classificationToContext: () => "",
}));
vi.mock("@/lib/supabase/admin", () => ({
  getAdminSupabase: () => ({
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        expect(table).toBe("generations");
        mocks.generations.push(row);
        return { error: null };
      },
      update: (row: Record<string, unknown>) => {
        expect(table).toBe("materials");
        const write = { row, filters: [] as Array<[string, string]> };
        mocks.updates.push(write);
        const query = {
          eq: (key: string, value: string) => {
            write.filters.push([key, value]);
            return write.filters.length === 2 ? Promise.resolve({ error: null }) : query;
          },
        };
        return query;
      },
    }),
  }),
}));

const quote = "표본 크기가 커지면 표준오차는 감소한다.";
const source = Array.from(
  { length: 3 },
  (_, index) => `=== Page ${index + 1} ===\n${quote}\n${"가".repeat(35_000)}`,
).join("\n\n");
const input = {
  ownerId: "owner",
  materialId: "material",
  title: "가상 장문 자료",
  type: "lecture",
  fullText: source,
  sanitizedText: source,
  pageCount: 3,
  parserWarnings: [],
};
const usage = { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0 };
function response(modelId = "gemini-3.5-flash-lite") {
  return {
    modelId,
    usage,
    text: JSON.stringify({
      leadSentence: "표본 크기와 표준오차의 관계를 정리합니다.",
      blocks: [
        { type: "h2", content: "표본과 오차" },
        { type: "para", content: quote, sourcePage: null, sourceQuote: quote },
        { type: "bullets", items: ["표본 크기", "표준오차"] },
        { type: "callout", tone: "info", content: "표본 크기와 오차의 관계를 확인해요." },
        { type: "callout", tone: "tip", content: "자료의 원문 문장을 함께 확인해요." },
      ],
      keywords: ["표본", "표준오차", "크기"],
      reviewSpots: [{ title: "관계 확인", why: "표본 크기와 표준오차의 관계를 다시 확인해요." }],
      watermark: "이 자료는 학습 보조용입니다.",
    }),
  };
}
beforeEach(() => {
  mocks.generate.mockReset();
  mocks.commit.mockReset();
  mocks.commit.mockImplementation(async (options) => options.result);
  mocks.generations.length = 0;
  mocks.updates.length = 0;
  mocks.generate.mockResolvedValue(response());
});

describe("summary chunk persistence and accounting", () => {
  it("commits a job summary and completion together without a separate cache write", async () => {
    const jobExecution = { jobId: "job", retryCount: 1 };
    const output = await runSummarize({ ...input, jobExecution });
    expect(output.ok).toBe(true);
    expect(mocks.updates).toHaveLength(0);
    expect(mocks.commit).toHaveBeenCalledTimes(1);
    expect(mocks.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        execution: jobExecution,
        ownerId: "owner",
        materialId: "material",
        result: { summary: expect.any(Object) },
      }),
    );
    expect(mocks.generations).toHaveLength(3);
  });

  it("does not save a stale job result through the direct cache path", async () => {
    mocks.commit.mockResolvedValue(null);
    const output = await runSummarize({ ...input, jobExecution: { jobId: "job", retryCount: 0 } });
    expect(output).toMatchObject({ ok: false, stage: "persistence" });
    expect(mocks.updates).toHaveLength(0);
    expect(mocks.generations).toHaveLength(3);
  });
  it("meters each actual call once and caches only the merged result", async () => {
    const output = await runSummarize(input);
    expect(output.ok).toBe(true);
    if (!output.ok) return;
    expect(mocks.generate).toHaveBeenCalledTimes(3);
    expect(mocks.generations).toHaveLength(3);
    expect(mocks.generations.reduce((sum, row) => sum + Number(row.cost_usd), 0)).toBeCloseTo(
      output.costUsd,
      10,
    );
    expect(mocks.generations.reduce((sum, row) => sum + Number(row.input_tokens), 0)).toBe(
      output.usage.inputTokens,
    );
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.updates[0]).toEqual({
      row: expect.objectContaining({ summary_payload: output.summary }),
      filters: [
        ["id", "material"],
        ["owner_id", "owner"],
      ],
    });
    expect(output.summary.blocks.filter((block) => block.type === "para")).toHaveLength(3);
  });

  it("sums actual per-model costs without re-pricing the aggregate at the last model", async () => {
    const models = ["gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-3.5-flash-lite"];
    for (const model of models) mocks.generate.mockResolvedValueOnce(response(model));
    const output = await runSummarize(input);
    expect(output.ok).toBe(true);
    if (!output.ok) return;
    const expected = models.reduce((sum, model) => sum + estimateCost(usage, model), 0);
    expect(output.costUsd).toBeCloseTo(expected, 10);
    expect(mocks.generations.reduce((sum, row) => sum + Number(row.cost_usd), 0)).toBeCloseTo(
      expected,
      10,
    );
  });

  it("retains billed failed calls without saving partial summaries to the material", async () => {
    mocks.generate.mockResolvedValueOnce({ ...response(), text: "invalid JSON" });
    const output = await runSummarize(input);
    expect(output.ok).toBe(true);
    if (!output.ok) return;
    expect(mocks.generations).toHaveLength(3);
    expect(mocks.generations[0]).toMatchObject({
      status: "error",
      input_tokens: 100,
      cost_usd: estimateCost(usage, response().modelId),
    });
    expect(mocks.updates).toHaveLength(1);
    expect(output.summary.blocks.filter((block) => block.type === "para")).toHaveLength(2);
    expect(output.costUsd).toBeCloseTo(
      mocks.generations.reduce((sum, row) => sum + Number(row.cost_usd), 0),
      10,
    );
    expect(output.usage.inputTokens).toBe(300);
    expect(
      output.summary.blocks.filter((block) => block.type === "h2").map((block) => block.content),
    ).toContain("── 부분 2/3 ──");
    expect(output.summary.reviewSpots[0]).toMatchObject({
      title: "일부 구간을 정리하지 못했어요",
      why: expect.stringContaining("1번째 부분"),
    });
  });

  it("keeps single-call summaries metered and cached normally", async () => {
    const output = await runSummarize({ ...input, fullText: quote, sanitizedText: quote });
    expect(output.ok).toBe(true);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.generations).toHaveLength(1);
    expect(mocks.updates).toHaveLength(1);
  });

  it("preserves the previous material cache when every chunk fails validation", async () => {
    mocks.generate.mockResolvedValue({ ...response(), text: "invalid JSON" });
    const output = await runSummarize(input);
    expect(output).toMatchObject({ ok: false, stage: "ai" });
    expect(mocks.updates).toHaveLength(0);
    expect(mocks.generations).toHaveLength(3);
    expect(
      mocks.generations.every((row) => row.status === "error" && Number(row.cost_usd) > 0),
    ).toBe(true);
  });
});
