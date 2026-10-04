import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseDocx, parsePptx, parseXlsx } from "./office";

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

describe("Office file regression", () => {
  it("extracts Korean DOCX paragraphs, table cells and final content", async () => {
    const bytes = await readFile(
      new URL("../../test/fixtures/study-example.docx", import.meta.url),
    );
    const result = await parseDocx({ filename: "study-example.docx", bytes });
    expect(result.text).toContain("가상 간호학 강의: 활력징후");
    expect(result.text).toContain("체온");
    expect(result.text).toContain("섭씨 36.5도");
    expect(result.text).toContain("마지막 확인: 환자 관찰 내용을 기록한다.");
    expect(result.source).toBe("docx");
  });

  it("preserves XLSX cached formula results and rich text", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("가상 성적");
    sheet.addRow(["항목", "점수"]);
    sheet.addRow(["중간고사", 30]);
    sheet.addRow(["기말고사", 40]);
    sheet.addRow([
      { richText: [{ text: "총" }, { text: "점" }] },
      { formula: "SUM(B2:B3)", result: 70 },
    ]);
    const bytes = new Uint8Array((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
    const result = await parseXlsx({ filename: "grades.xlsx", bytes });
    expect(result.text).toContain("# 가상 성적");
    expect(result.text).toContain("총점 | 70");
    expect(result.text).not.toContain("[object Object]");
  });

  it.each([
    parseDocx,
    parsePptx,
    parseXlsx,
  ])("rejects empty and corrupt Office files", async (parse) => {
    await expect(parse({ filename: "broken", bytes: new Uint8Array() })).rejects.toMatchObject({
      reason: "empty",
    });
    await expect(parse({ filename: "broken", bytes: new Uint8Array([1, 2, 3]) })).rejects.toThrow();
  });
});
