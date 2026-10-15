import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";

const timing = vi.hoisted(() => ({ active: 0, peak: 0, calls: 0, totalMs: 0 }));
vi.mock("../claude", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../claude")>();
  return {
    ...actual,
    generateWithFile: async (...args: Parameters<typeof actual.generateWithFile>) => {
      const start = performance.now();
      timing.active++;
      timing.calls++;
      timing.peak = Math.max(timing.peak, timing.active);
      try {
        return await actual.generateWithFile(...args);
      } finally {
        timing.active--;
        timing.totalMs += performance.now() - start;
      }
    },
  };
});

import { parsePdf } from "./pdf";

describe.skipIf(process.env.RUN_PDF_OCR_EVAL !== "1")("live multi-page PDF OCR", () => {
  it("preserves all page conditions with two bounded concurrent OCR calls", async () => {
    vi.stubEnv("PDF_OCR_VENDOR", "google");
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    for (let i = 1; i <= 16; i++) {
      const page = document.addPage([400, 400]);
      page.drawText(`Module ${i}: threshold = ${1000 + i}`, { x: 30, y: 350, size: 14, font });
      page.drawRectangle({ x: 30, y: 200, width: 80, height: 50, color: rgb(0.2, 0.6, 0.9) });
      page.drawText("Collect", { x: 45, y: 220, size: 12, font });
      page.drawText("-->", { x: 130, y: 220, size: 12, font });
      page.drawRectangle({ x: 180, y: 200, width: 100, height: 50, color: rgb(0.4, 0.8, 0.5) });
      page.drawText("Validate", { x: 195, y: 220, size: 12, font });
    }
    try {
      const start = performance.now();
      const parsed = await parsePdf({ bytes: await document.save(), filename: "synthetic-16.pdf" });
      const elapsedMs = performance.now() - start;
      expect(parsed.pageCount).toBe(16);
      expect(parsed.warnings).toEqual([]);
      const pages = parsed.text.split(/^=== Page \d+ ===$/m).slice(1);
      expect(pages).toHaveLength(16);
      for (let i = 1; i <= 16; i++) {
        expect(pages[i - 1]).toContain(String(1000 + i));
        expect(pages[i - 1]).toContain("Collect");
        expect(pages[i - 1]).toContain("Validate");
      }
      expect(timing.peak).toBe(2);
      expect(timing.calls).toBe(2);
      console.info(
        JSON.stringify({
          pages: 16,
          elapsedMs,
          providerCallMsSum: timing.totalMs,
          peak: timing.peak,
        }),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  }, 120_000);
});
