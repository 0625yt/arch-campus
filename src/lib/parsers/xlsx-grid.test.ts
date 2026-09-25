import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { extractTimetableGridFromXlsx, extractXlsxLayout } from "./xlsx-grid";

async function workbookBytes(build: (sheet: ExcelJS.Worksheet) => void): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("시간표");
  build(sheet);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

describe("Excel timetable structure", () => {
  it("preserves cell addresses and merge ranges for dual-panel row-list schedules", async () => {
    const bytes = await workbookBytes((sheet) => {
      sheet.mergeCells("A1:K1");
      sheet.getCell("A1").value = "2026학년도 1학기 기본시간표";
      sheet.addRow([]);
      sheet.getRow(3).values = [
        "요일",
        "강의시간",
        "1학년 과목명",
        "강의실",
        "교수",
        "",
        "요일",
        "강의시간",
        "2학년 과목명",
        "강의실",
        "교수",
      ];
      sheet.getRow(4).values = [
        "월",
        "10:00~13:00",
        "보험심사",
        "301",
        "손민희",
        "",
        "화",
        "13:00~15:00",
        "병원전산",
        "201",
        "박정숙",
      ];
    });

    const layout = await extractXlsxLayout(bytes);

    expect(layout.ok).toBe(true);
    if (!layout.ok) return;
    expect(layout.markdown).toContain("병합 셀: A1:K1");
    expect(layout.markdown).toContain('R4: A="월"');
    expect(layout.markdown).toContain('G="화"');
    expect(layout.markdown).toContain('I="병원전산"');
    expect(layout.likelyCourseCatalog).toBe(false);
  });

  it("recognizes a full course catalog instead of silently importing its first rows", async () => {
    const bytes = await workbookBytes((sheet) => {
      sheet.addRow([
        "학년",
        "교과목명",
        "과목코드",
        "분반",
        "학점",
        "담당교수명",
        "요일 및 시간",
        "강의실",
      ]);
      for (let index = 1; index <= 31; index += 1) {
        sheet.addRow([1, `강좌 ${index}`, `C${index}`, "001", 3, "교수", `화${index}`, "101"]);
      }
    });

    const layout = await extractXlsxLayout(bytes);

    expect(layout.ok).toBe(true);
    if (!layout.ok) return;
    expect(layout.sheets[0].catalogLikeRows).toBe(31);
    expect(layout.likelyCourseCatalog).toBe(true);
  });

  it("still prefers compact weekday-grid markdown when the standard form exists", async () => {
    const bytes = await workbookBytes((sheet) => {
      sheet.getRow(1).values = ["교시", "월", "화", "수", "목", "금"];
      sheet.getRow(2).values = ["1교시", "자료구조", "", "", "", ""];
    });

    const result = await extractTimetableGridFromXlsx(bytes, {
      headerKeywords: ["일", "월", "화", "수", "목", "금", "토"],
      minMatches: 4,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.grids[0].markdown).toContain("자료구조");
  });
});

it("round-trips extended conditional formatting with the patched UUID dependency", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("조건부 서식");
  sheet.addRows([[1], [2], [3]]);
  sheet.addConditionalFormatting({
    ref: "A1:A3",
    rules: [
      {
        type: "iconSet",
        iconSet: "3Stars",
        cfvo: [
          { type: "percent", value: 0 },
          { type: "percent", value: 33 },
          { type: "percent", value: 67 },
        ],
        priority: 1,
      },
    ],
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(buffer);
  expect(restored.getWorksheet("조건부 서식")?.getCell("A2").value).toBe(2);
  expect(restored.getWorksheet("조건부 서식")).toHaveProperty(
    "conditionalFormattings.0.rules.0.iconSet",
    "3Stars",
  );
});
