import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseImage } from "./image";

describe.skipIf(process.env.RUN_FILE_EVAL !== "1")("real image OCR regression", () => {
  it("extracts Korean table labels, values and the final formula from a PNG", async () => {
    const bytes = await readFile(
      new URL("../../test/fixtures/accounting-example.png", import.meta.url),
    );
    const result = await parseImage({ filename: "accounting-example.png", bytes });
    expect(result.text).toContain("가상 회계학");
    for (const value of ["매출", "비용", "이익", "1200", "800", "400"])
      expect(result.text).toContain(value);
    expect(result.text).toMatch(/이익\s*=\s*매출\s*-\s*비용/);
    expect(result.warnings).toHaveLength(0);
  }, 60_000);
});
