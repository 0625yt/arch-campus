import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parsePptx } from "./office";

describe("PPTX text extraction", () => {
  it("preserves Korean slide text through the OfficeParser 8 generator API", async () => {
    const bytes = await readFile(
      new URL("../../test/fixtures/study-example.pptx", import.meta.url),
    );
    const result = await parsePptx({ filename: "study-example.pptx", bytes });
    expect(result.text).toContain("자료구조: 스택과 큐");
    expect(result.text).toContain("스택은 후입선출, 큐는 선입선출 방식이다.");
    expect(result.source).toBe("pptx");
  });
});
