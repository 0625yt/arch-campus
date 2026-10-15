import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MODELS } from "@/lib/claude";
import { SummarizeOutput } from "@/lib/schemas";
import { auditSummary } from "@/lib/services/summary-audit";
import { PROMPT_QUALITY_FIXTURES } from "./fixtures/prompt-quality";

describe.skipIf(process.env.RUN_SUMMARY_AUDIT_EVAL !== "1")("summary audit repairs", () => {
  it("repairs actual missed definitions without adding ungrounded content", async () => {
    const samples = JSON.parse(readFileSync(".tmp/vendor-quality-samples.json", "utf8"));
    const repairs = [];
    for (const fixture of PROMPT_QUALITY_FIXTURES) {
      const row = samples.rows.find(
        (r: { fixture: string; tool: string; modelId: string }) =>
          r.fixture === fixture.name && r.tool === "summarize" && r.modelId === MODELS.haiku55,
      );
      const original = SummarizeOutput.parse(JSON.parse(row.rawText));
      const result = await auditSummary({ summary: original, source: fixture.source });
      expect(result.summary).not.toBeNull();
      if (!result.summary) continue;
      row.rawText = JSON.stringify(result.summary);
      repairs.push({
        fixture: fixture.name,
        additions: result.summary.blocks.slice(original.blocks.length),
        cost: result.costUsd,
      });
      writeFileSync(".tmp/summary-quality-repairs.json", JSON.stringify(repairs, null, 2));
    }
    writeFileSync(".tmp/vendor-quality-audited-samples.json", JSON.stringify(samples, null, 2));
    const statistics = JSON.parse(
      samples.rows.find(
        (r: { fixture: string; tool: string; modelId: string }) =>
          r.fixture === "statistics" && r.tool === "summarize" && r.modelId === MODELS.haiku55,
      ).rawText,
    );
    const visible = JSON.stringify(
      statistics.blocks.map(
        (b: { content?: string; items?: string[]; rows?: string[][] }) =>
          b.content ?? b.items ?? b.rows,
      ),
    );
    expect(visible).toContain("실용적 중요성");
    expect(visible).toMatch(/규모|크기/);
  }, 180_000);
});
