import ExcelJS from "exceljs";
import { toUint8Array, type ParseBytes } from "./types";

/**
 * Excel 격자 재구성 — 시간표/표 자료의 (row, col) 좌표가 PDF와 달리
 * 셀 자체에 박혀있다. 그래서 추측 없이 헤더 row를 찾고 그 row의 열
 * 인덱스로 컬럼을 잡으면 끝.
 *
 * - 셀 병합(merge)도 ExcelJS가 모델로 알려줘서 같은 강의가 여러 행에
 *   걸친 경우 위쪽 셀의 값으로 합쳐 채운다.
 * - "일/월/화/수/목/금/토" 같은 헤더 키워드를 인자로 받아 일반화 가능.
 */

export interface XlsxGrid {
  sheetName: string;
  headerRow: number;
  /** 헤더로 잡힌 컬럼들 — col index와 라벨 */
  columns: Array<{ label: string; col: number }>;
  rows: Array<{
    /** 첫 컬럼(보통 교시·주차) 텍스트, 없으면 "" */
    rowLabel: string;
    /** 헤더 라벨 → 셀 텍스트 */
    cells: Record<string, string>;
  }>;
  markdown: string;
}

export interface ExtractXlsxGridResult {
  ok: true;
  grids: XlsxGrid[];
}

export interface ExtractXlsxGridFailure {
  ok: false;
  reason: "no-header" | "empty-workbook" | "exceljs-failed";
  message: string;
}

export async function extractTimetableGridFromXlsx(
  bytes: ParseBytes,
  opts: {
    headerKeywords: readonly string[];
    minMatches: number;
  },
): Promise<ExtractXlsxGridResult | ExtractXlsxGridFailure> {
  let workbook: ExcelJS.Workbook;
  try {
    const u8 = toUint8Array(bytes);
    workbook = new ExcelJS.Workbook();
    const ab =
      u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength
        ? (u8.buffer as ArrayBuffer)
        : (u8.slice().buffer as ArrayBuffer);
    await workbook.xlsx.load(ab as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch (e) {
    return {
      ok: false,
      reason: "exceljs-failed",
      message: e instanceof Error ? e.message : String(e),
    };
  }

  const grids: XlsxGrid[] = [];
  workbook.eachSheet((sheet) => {
    const grid = scanSheet(sheet, opts.headerKeywords, opts.minMatches);
    if (grid) grids.push(grid);
  });

  if (grids.length === 0) {
    return { ok: false, reason: "no-header", message: "헤더 키워드를 만족하는 표를 못 찾음" };
  }
  return { ok: true, grids };
}

function scanSheet(
  sheet: ExcelJS.Worksheet,
  keywords: readonly string[],
  minMatches: number,
): XlsxGrid | null {
  // 1) 헤더 row 찾기 — 한 row 안에 keywords 중 minMatches 이상 일치
  let headerRow = -1;
  let columns: Array<{ label: string; col: number }> = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (headerRow !== -1) return;
    const matched: typeof columns = [];
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const text = cellText(cell);
      const norm = text.replace(/\s/g, "");
      const kw = keywords.find((k) => k === text || k === norm);
      if (kw) matched.push({ label: kw, col: colNumber });
    });
    if (matched.length >= minMatches) {
      headerRow = rowNumber;
      columns = matched.sort((a, b) => a.col - b.col);
    }
  });
  if (headerRow === -1) return null;

  // 2) 셀 병합 정보 — value가 빈 셀은 위쪽 병합 셀의 master 값을 가져옴.
  //    ExcelJS는 sheet.getCell(row, col).master 로 master cell 노출.
  const dataRows: XlsxGrid["rows"] = [];
  const lastRow = sheet.actualRowCount;
  for (let r = headerRow + 1; r <= lastRow; r += 1) {
    const cells: Record<string, string> = {};
    let any = false;
    let rowLabel = "";
    // 첫 컬럼(보통 교시) — 헤더의 leftmost col보다 더 왼쪽 칸이 라벨 위치
    const leftmostHeaderCol = columns[0].col;
    if (leftmostHeaderCol > 1) {
      const leftCell = sheet.getCell(r, 1);
      rowLabel = mergedText(leftCell);
    }
    for (const col of columns) {
      const cell = sheet.getCell(r, col.col);
      const text = mergedText(cell);
      cells[col.label] = text;
      if (text.length > 0) any = true;
    }
    if (any) dataRows.push({ rowLabel, cells });
  }
  if (dataRows.length === 0) return null;

  return {
    sheetName: sheet.name,
    headerRow,
    columns,
    rows: dataRows,
    markdown: gridToMarkdown(columns, dataRows),
  };
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && "richText" in v) {
    return v.richText.map((r) => r.text).join("").trim();
  }
  if (typeof v === "object" && "text" in v && typeof v.text === "string") {
    return v.text.trim();
  }
  if (typeof v === "object" && "result" in v) {
    // formula cell — 결과만
    const result = (v as { result?: unknown }).result;
    if (result == null) return "";
    return String(result);
  }
  return String(v);
}

function mergedText(cell: ExcelJS.Cell): string {
  const direct = cellText(cell);
  if (direct.length > 0) return direct;
  // 빈 셀이면 master(병합 시작 셀) 값으로 채움
  const master = (cell as { master?: ExcelJS.Cell }).master;
  if (master && master !== cell) {
    return cellText(master);
  }
  return "";
}

function gridToMarkdown(
  columns: XlsxGrid["columns"],
  rows: XlsxGrid["rows"],
): string {
  const headers = ["행", ...columns.map((c) => c.label)];
  const lines: string[] = [];
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
  for (const r of rows) {
    const cells = [
      r.rowLabel || "-",
      ...columns.map((c) => (r.cells[c.label] || "-").replace(/\|/g, "/")),
    ];
    lines.push(`| ${cells.join(" | ")} |`);
  }
  return lines.join("\n");
}
