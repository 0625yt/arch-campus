import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/classify-material", () => ({
  classifyMaterial: async () => null,
  classificationToContext: () => "",
}));
vi.mock("@/lib/supabase/admin", () => ({
  getAdminSupabase: () => ({ from: () => ({ insert: async () => ({ error: null }) }) }),
}));
vi.mock("@/lib/data/material-job-result", () => ({
  commitMaterialJobResult: async (input: { result: unknown }) => input.result,
}));

import { parseDocument } from "@/lib/parsers";
import { runSummarize } from "@/lib/services/summarize";
import { sourcePages } from "@/lib/summary-chunks";

describe.skipIf(process.env.RUN_LONG_SUMMARY_EVAL !== "1")("100-page PDF summary", () => {
  it("retains all pages through extraction, sanitization, model calls and merge", async () => {
    vi.stubEnv("PDF_OCR_VENDOR", "off");
    vi.stubEnv("SUMMARY_MODEL_ID", process.env.EVAL_SUMMARY_MODEL ?? "claude-haiku-5-5");
    const parsed = await parseDocument({
      bytes: readFileSync("tmp/pdfs/coverage-100-pages.pdf"),
      filename: "coverage-100-pages.pdf",
      mimeType: "application/pdf",
    });
    expect(parsed.pageCount).toBe(100);
    expect(parsed.sanitizedText.length).toBeGreaterThan(60_000);
    expect(sourcePages(parsed.sanitizedText)).toHaveLength(100);
    const output = await runSummarize({
      ownerId: "synthetic",
      materialId: "synthetic",
      title: "100개 모듈 안전 절차",
      type: "lecture",
      fullText: parsed.text,
      sanitizedText: parsed.sanitizedText,
      pageCount: 100,
      parserWarnings: parsed.warnings ?? [],
      styles: ["analyze"],
      intentNote:
        "각 Module 번호와 고유 임계값·예외를 빠짐없이 한국어로 정리. 방법 A/B는 표로, 절차는 단계 도식으로.",
      jobExecution: { jobId: "synthetic", retryCount: 0 },
    });
    writeFileSync(".tmp/summary-100-pages-result.json", JSON.stringify(output, null, 2));
    expect(output.ok).toBe(true);
    if (!output.ok) return;
    writeFileSync(".tmp/summary-100-pages.json", JSON.stringify(output.summary, null, 2));
    expect(output.summary.coverage?.sourcePages).toHaveLength(100);
    const text = JSON.stringify(output.summary.blocks);
    const missing = Array.from({ length: 100 }, (_, i) => i + 1).filter(
      (n) => !text.includes(String(n * 7 + 3)),
    );
    writeFileSync(
      ".tmp/summary-100-pages-metrics.json",
      JSON.stringify(
        {
          model: output.modelId,
          cost: output.costUsd,
          blocks: output.summary.blocks.length,
          missingThresholds: missing,
          citedPages: output.summary.coverage?.citedPages.length,
          tables: output.summary.blocks.filter((b) => b.type === "table").length,
          flows: output.summary.blocks.filter((b) => b.type === "flow").length,
        },
        null,
        2,
      ),
    );
    expect(missing).toEqual([]);
    for (let n = 1; n <= 100; n++) expect(text).toContain(String(n).padStart(3, "0"));
    expect(output.summary.blocks.some((b) => b.type === "table")).toBe(true);
    expect(output.summary.blocks.some((b) => b.type === "flow")).toBe(true);
    expect(output.costUsd).toBeLessThan(1);
  }, 600_000);
});
