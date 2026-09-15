import ExcelJS from "exceljs";
import { type ParseBytes, toUint8Array } from "./types";

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

export interface XlsxLayoutSheet {
  sheetName: string;
  rowCount: number;
  columnCount: number;
  catalogLikeRows: number;
}

export interface ExtractXlsxLayoutResult {
  ok: true;
  /** 셀 주소와 병합 범위를 보존한 LLM용 텍스트 */
  markdown: string;
  sheets: XlsxLayoutSheet[];
  /** 개인 시간표가 아니라 수강편람/전체 개설강좌 목록일 가능성이 매우 높음 */
  likelyCourseCatalog: boolean;
  truncated: boolean;
}

export interface ExtractXlsxLayoutFailure {
  ok: false;
  reason: "empty-workbook" | "exceljs-failed";
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

/**
 * 월~금 헤더 격자가 아닌 Excel도 셀 좌표를 잃지 않게 직렬화한다.
 *
 * 학교마다 `요일 | 실제 시간 | 과목 | 강의실 | 교수` 행 목록, 학년별 좌우 병렬표,
 * 병합 셀 등 양식이 크게 다르다. 일반 텍스트 파서는 빈 셀과 열 위치를 버리므로
 * 요일/강의가 뒤섞인다. 여기서는 `R8: A=월 | B=10:00~13:00 ...`처럼 주소를
 * 보존하고 병합 범위도 별도 기록한다.
 */
export async function extractXlsxLayout(
  bytes: ParseBytes,
  opts: { maxRowsPerSheet?: number; maxChars?: number } = {},
): Promise<ExtractXlsxLayoutResult | ExtractXlsxLayoutFailure> {
  let workbook: ExcelJS.Workbook;
  try {
    const u8 = Uint8Array.from(toUint8Array(bytes));
    workbook = new ExcelJS.Workbook();
    const ab = u8.buffer as ArrayBuffer;
    await workbook.xlsx.load(ab as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch (e) {
    return {
      ok: false,
      reason: "exceljs-failed",
      message: e instanceof Error ? e.message : String(e),
    };
  }

  if (workbook.worksheets.length === 0) {
    return { ok: false, reason: "empty-workbook", message: "시트가 없는 Excel 파일" };
  }

  const maxRows = opts.maxRowsPerSheet ?? 180;
  const maxChars = opts.maxChars ?? 80_000;
  const parts: string[] = ["# Excel 셀 좌표 구조"];
  const sheets: XlsxLayoutSheet[] = [];
  let length = parts[0].length;
  let truncated = false;

  for (const sheet of workbook.worksheets) {
    let catalogLikeRows = 0;
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const texts: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell) => {
        const value = directCellText(cell);
        if (value) texts.push(value);
      });
      if (looksLikeCatalogCourseRow(texts)) catalogLikeRows += 1;
    });

    sheets.push({
      sheetName: sheet.name,
      rowCount: sheet.actualRowCount,
      columnCount: sheet.actualColumnCount,
      catalogLikeRows,
    });

    const merges = ((sheet.model as { merges?: string[] }).merges ?? []).slice(0, 120);
    const header = [
      "",
      `## 시트: ${escapeLayoutText(sheet.name)}`,
      `크기: ${sheet.actualRowCount}행 x ${sheet.actualColumnCount}열`,
      merges.length > 0 ? `병합 셀: ${merges.join(", ")}` : "병합 셀: 없음",
    ];
    for (const line of header) {
      if (length + line.length + 1 > maxChars) {
        truncated = true;
        break;
      }
      parts.push(line);
      length += line.length + 1;
    }
    if (truncated) break;

    let emittedRows = 0;
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (truncated) return;
      if (emittedRows >= maxRows) {
        truncated = true;
        return;
      }
      const cells: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell) => {
        const value = directCellText(cell);
        if (!value) return;
        const column = cell.address.replace(/\d+$/, "");
        cells.push(`${column}="${escapeLayoutText(value)}"`);
      });
      if (cells.length === 0) return;
      const line = `R${rowNumber}: ${cells.join(" | ")}`;
      if (length + line.length + 1 > maxChars) {
        truncated = true;
        return;
      }
      parts.push(line);
      length += line.length + 1;
      emittedRows += 1;
    });
    if (truncated) break;
  }

  if (truncated) parts.push("[이하 생략 — 원본 행 수가 안전 한도를 초과함]");
  const catalogRows = sheets.reduce((sum, sheet) => sum + sheet.catalogLikeRows, 0);
  return {
    ok: true,
    markdown: parts.join("\n"),
    sheets,
    // 개인 시간표는 보통 5~20개 수업이다. 30개 이상의 '요일+교시' 강좌 행은
    // 학과/대학 전체 개설 목록으로 보고 자동 등록하지 않는다.
    likelyCourseCatalog: catalogRows >= 30,
    truncated,
  };
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
    return v.richText
      .map((r) => r.text)
      .join("")
      .trim();
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
  if (typeof v === "boolean") return String(v);
  // ExcelJS의 일부 깨진 병합 child는 MergeValue.toString()에서 예외를 던진다.
  // 알 수 없는 객체를 억지로 문자열화하지 않아 파일 전체 파싱 실패를 막는다.
  try {
    return String(v);
  } catch {
    return "";
  }
}

function directCellText(cell: ExcelJS.Cell): string {
  const master = (cell as { master?: ExcelJS.Cell }).master;
  if (cell.isMerged && master && master !== cell) return "";
  return cellText(cell);
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

function looksLikeCatalogCourseRow(cells: string[]): boolean {
  if (cells.length < 4) return false;
  return cells.some((value) => /(?:월|화|수|목|금|토|일)\s*\d|cyber|온라인/i.test(value));
}

function escapeLayoutText(value: string): string {
  return value
    .replace(/\s*\n\s*/g, " / ")
    .replace(/"/g, "'")
    .trim();
}

function gridToMarkdown(columns: XlsxGrid["columns"], rows: XlsxGrid["rows"]): string {
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
