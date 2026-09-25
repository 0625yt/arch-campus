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
    getDocumentProxy.mockImplementation(async (received: Uint8Array) => {
      structuredClone(received.buffer, { transfer: [received.buffer] });
      return { numPages: 1 };
    });
    extractText.mockResolvedValue({ text: ["unpdf text"], totalPages: 1 });
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
});
