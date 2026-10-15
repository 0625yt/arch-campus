import { describe, expect, it } from "vitest";
import { sanitizeDocumentForPrompt } from "./sanitize";
import { sourcePages, splitSummarySource } from "./summary-chunks";

describe("complete document coverage", () => {
  it("preserves the middle and tail of a 100-page, 200K-character document", () => {
    const source = Array.from(
      { length: 100 },
      (_, i) =>
        `=== Page ${i + 1} ===\n${`고유 개념 ${i + 1}의 정의와 예외입니다. `.repeat(90)}\n\n`,
    ).join("");
    const sanitized = sanitizeDocumentForPrompt(source);
    expect(sanitized).toBe(source.trim());
    const chunks = splitSummarySource(sanitized);
    expect(chunks).toHaveLength(13);
    expect(chunks.join("")).toBe(sanitized);
    expect(chunks.flatMap(sourcePages)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
    expect(chunks.every((c) => sourcePages(c).length <= 8)).toBe(true);
  });
  it("retains oversized paragraphs and page provenance when a page must split", () => {
    const source = `=== Page 74 ===\n${"x".repeat(120_000)}`;
    const chunks = splitSummarySource(source);
    expect(chunks.every((c) => c.length <= 50_000 && sourcePages(c)[0] === 74)).toBe(true);
    expect(chunks.join("").replaceAll("=== Page 74 ===\n", "")).toBe("x".repeat(120_000));
  });
});
