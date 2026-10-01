import { describe, expect, it } from "vitest";
import { lastProcessingCheckpoint, parseJobCheckpoints } from "./job-checkpoints";

const at = "2026-10-01T00:00:00Z";
describe("job failure diagnostics", () => {
  it("shows the interrupted generation stage rather than the final failure marker", () => {
    expect(
      lastProcessingCheckpoint([
        { stage: "processing", progress: 15, at },
        { stage: "generating-summary", progress: 45, at },
        { stage: "failed", progress: 100, at },
      ]),
    ).toMatchObject({ stage: "generating-summary", progress: 45 });
  });
  it("uses the latest retry stage", () => {
    expect(
      lastProcessingCheckpoint([
        { stage: "generating-summary", progress: 45, at },
        { stage: "retry-queued", progress: 0, at },
        { stage: "rebuilding-input", progress: 25, at },
        { stage: "failed", progress: 100, at },
      ])?.stage,
    ).toBe("rebuilding-input");
  });
  it("ignores malformed or legacy history", () => {
    expect(
      parseJobCheckpoints([
        null,
        { stage: "x", progress: 500, at },
        { stage: "x", progress: 1, at: "bad" },
      ]),
    ).toEqual([]);
    expect(lastProcessingCheckpoint(null)).toBeNull();
  });
});
