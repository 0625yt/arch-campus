import { afterEach, describe, expect, it, vi } from "vitest";

const { getDocumentProxy, extractText, generateWithFile } = vi.hoisted(() => ({
  getDocumentProxy: vi.fn(),
  extractText: vi.fn(),
  generateWithFile: vi.fn(),
}));

vi.mock("unpdf", () => ({ getDocumentProxy, extractText }));
vi.mock("../claude", () => ({ generateWithFile }));

import { parsePdf } from "./pdf";

describe("parsePdf", () => {
  const previousGoogleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  afterEach(() => {
    getDocumentProxy.mockReset();
    extractText.mockReset();
    generateWithFile.mockReset();
    if (previousGoogleKey === undefined) delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    else process.env.GOOGLE_GENERATIVE_AI_API_KEY = previousGoogleKey;
  });

  it("keeps an independent byte copy for OCR when pdfjs detaches its input", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";
    extractText.mockImplementation(async (received: Uint8Array) => {
      structuredClone(received.buffer, { transfer: [received.buffer] });
      return { text: ["unpdf text"], totalPages: 1 };
    });
    generateWithFile.mockImplementation(async ({ fileBytes }: { fileBytes: Uint8Array }) => {
      expect(fileBytes.byteLength).toBe(6);
      return {
        text: "=== Page 1 ===\nOCR text that is longer than the fallback text",
        modelId: "gemini-test",
        usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
      };
    });

    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const parsed = await parsePdf({ bytes, filename: "시간표.pdf", mimeType: "application/pdf" });

    expect(generateWithFile).toHaveBeenCalledOnce();
    expect(parsed.text).toContain("OCR text");
    expect(bytes.byteLength).toBe(6);
  });

  it("preserves native facts missing from a longer OCR response", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "test-key";
    extractText.mockResolvedValue({ text: ["Threshold must be exactly 0.017."], totalPages: 1 });
    generateWithFile.mockResolvedValue({
      text: "=== Page 1 ===\nA long diagram description with many details that omits the numeric condition.",
      finishReason: "stop",
    });
    const parsed = await parsePdf({ bytes: new Uint8Array([1]), filename: "facts.pdf" });
    expect(parsed.text).toContain("Threshold must be exactly 0.017.");
    expect(parsed.text).toContain("A long diagram description");
  });
});

it("keeps all 100 absolute page numbers across locally numbered OCR chunks", async () => {
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  for (let i = 0; i < 100; i++) pdf.addPage();
  vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test");
  vi.stubEnv("PDF_OCR_VENDOR", "google");
  getDocumentProxy.mockResolvedValue({});
  extractText.mockResolvedValue({
    text: Array.from({ length: 100 }, (_, i) => `Plain page ${i + 1}`),
    totalPages: 100,
  });
  let start = 0;
  let active = 0;
  let peak = 0;
  generateWithFile.mockImplementation(async ({ fileBytes }: { fileBytes: Uint8Array }) => {
    const chunk = await PDFDocument.load(fileBytes);
    const length = chunk.getPageCount();
    const originalStart = start;
    start += length;
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, originalStart === 0 ? 25 : 5));
    const text = Array.from(
      { length },
      (_, i) =>
        `=== Page ${i + 1} ===\nOCR contents from original source page ${originalStart + i + 1}`,
    ).join("\n\n");
    active -= 1;
    return { text, finishReason: "stop" };
  });
  try {
    const output = await parsePdf({
      bytes: await pdf.save(),
      filename: "100.pdf",
      mimeType: "application/pdf",
    });
    expect([...output.text.matchAll(/^=== Page (\d+) ===$/gm)].map((m) => Number(m[1]))).toEqual(
      Array.from({ length: 100 }, (_, i) => i + 1),
    );
    expect(output.text).toContain("OCR contents from original source page 100");
    expect(generateWithFile).toHaveBeenCalledTimes(13);
    expect(peak).toBe(2);
  } finally {
    vi.unstubAllEnvs();
    generateWithFile.mockReset();
  }
});
