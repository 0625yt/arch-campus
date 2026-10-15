import { PDFDocument, StandardFonts } from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePdf } from "./pdf";

afterEach(() => vi.unstubAllEnvs());

describe("real PDF extraction without OCR", () => {
  it("preserves table values and the end of a sixteen-page file", async () => {
    vi.stubEnv("PDF_OCR_VENDOR", "off");
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    for (let index = 1; index <= 16; index++) {
      const page = document.addPage();
      page.drawText(`Synthetic lecture page ${index}`, { x: 40, y: 750, font, size: 16 });
      page.drawText(`Assessment | Points\nMidterm | 30\nFinal | 40`, {
        x: 40,
        y: 650,
        font,
        size: 12,
      });
      page.drawText(`End marker ${index}`, { x: 40, y: 100, font, size: 12 });
    }
    const result = await parsePdf({ filename: "sixteen-pages.pdf", bytes: await document.save() });
    expect(result.pageCount).toBe(16);
    expect(result.text).toContain("Midterm | 30");
    expect(result.text).toContain("Final | 40");
    expect(result.text).toContain("End marker 16");
    expect(result.text.match(/Synthetic lecture page/g)).toHaveLength(16);
  });

  it("reports corrupt PDF input as empty extraction with a warning", async () => {
    vi.stubEnv("PDF_OCR_VENDOR", "off");
    const result = await parsePdf({ filename: "broken.pdf", bytes: new Uint8Array([1, 2, 3]) });
    expect(result.pageCount).toBe(0);
    expect(result.text).toBe("");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("rejects a zero-byte PDF", async () => {
    await expect(
      parsePdf({ filename: "empty.pdf", bytes: new Uint8Array() }),
    ).rejects.toMatchObject({ reason: "empty" });
  });
});
