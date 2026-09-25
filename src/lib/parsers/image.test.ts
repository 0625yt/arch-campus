import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateText, getModelIdFor, modelInstance } = vi.hoisted(() => ({
  generateText: vi.fn(),
  getModelIdFor: vi.fn(),
  modelInstance: vi.fn(),
}));

vi.mock("ai", () => ({ generateText }));
vi.mock("../claude", () => ({ getModelIdFor, modelInstance }));

import { parseImage } from "./image";

describe("parseImage", () => {
  beforeEach(() => {
    generateText.mockReset();
    getModelIdFor.mockReset();
    modelInstance.mockReset();
  });

  it("uses the configured OCR route instead of a hard-coded provider", async () => {
    const configuredModel = { modelId: "gemini-ocr" };
    getModelIdFor.mockReturnValue("gemini-3.5-flash-lite");
    modelInstance.mockReturnValue(configuredModel);
    generateText.mockResolvedValue({ text: "월요일 데이터구조 10:00" });

    const result = await parseImage({
      filename: "시간표.jpeg",
      mimeType: "image/jpeg",
      bytes: new Uint8Array([1, 2, 3]),
    });

    expect(getModelIdFor).toHaveBeenCalledWith("pdf-ocr");
    expect(modelInstance).toHaveBeenCalledWith("gemini-3.5-flash-lite");
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({ model: configuredModel }));
    expect(result.text).toContain("데이터구조");
  });
});
