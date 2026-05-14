import { getDocumentProxy } from "unpdf";
import { toUint8Array, type ParseBytes } from "./types";

/**
 * 시간표 격자 재구성 — PDF의 텍스트 조각을 (x, y) 좌표로 클러스터링해
 * 행=교시 / 열=요일 격자를 정직하게 다시 만든다.
 *
 * 왜 필요한가:
 *   학교 포털 시간표 PDF는 텍스트 추출(unpdf merged text)만 보면
 *   요일 컬럼 정보가 사라진다. 같은 행의 셀들이 그냥 좌→우로 흘러내려
 *   "글로컬 영어 I"이 화 컬럼에 있는 건지 월 컬럼에 있는 건지 모른다.
 *
 *   pdfjs의 getTextContent는 각 텍스트 조각마다 transform 행렬을 주는데
 *   transform[4] = x, transform[5] = y(아래에서 위로 자라는 baseline).
 *   이걸로 "일/월/화/수/목/금/토" 헤더의 x를 잡고, 데이터 셀의 x가
 *   어느 헤더 구간 안에 들어가는지로 요일을 결정한다.
 *
 * 한계:
 *   - 헤더가 명확히 한 줄로 박힌 시간표만 잡힘 (대부분의 학사 포털 ✓)
 *   - 헤더 못 찾으면 null 반환 → 호출 측이 vision 폴백
 */

interface RawItem {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;
const PERIOD_RE = /^(\d{1,2})교시$/;
const TIME_RE = /^\[(\d{1,2}):(\d{2})~(\d{1,2}):(\d{2})\]$/;

export interface TimetableGrid {
  /** 헤더 row의 y 좌표 — 디버깅·로깅용 */
  headerY: number;
  /** 일/월/화/수/목/금/토 → 컬럼 경계 (left, right) x 좌표 */
  columns: Array<{ weekday: (typeof WEEKDAYS_KO)[number]; left: number; right: number }>;
  /** 행 = 교시. period: "1교시", time: "[09:00~09:50]", cells: { weekday → 셀 안의 텍스트 줄들 } */
  rows: Array<{
    period: string;
    time: string;
    cells: Record<string, string[]>;
  }>;
}

export interface ExtractGridResult {
  ok: true;
  grid: TimetableGrid;
  /** LLM에 그대로 넣을 마크다운 표 */
  markdown: string;
}

export interface ExtractGridFailure {
  ok: false;
  reason: "no-header" | "no-rows" | "pdfjs-failed";
  message: string;
}

export async function extractTimetableGrid(
  bytes: ParseBytes,
): Promise<ExtractGridResult | ExtractGridFailure> {
  let items: RawItem[];
  try {
    items = await loadAllItems(bytes);
  } catch (e) {
    return {
      ok: false,
      reason: "pdfjs-failed",
      message: e instanceof Error ? e.message : String(e),
    };
  }
  if (items.length === 0) {
    return { ok: false, reason: "no-rows", message: "텍스트 조각을 못 찾음" };
  }

  // 1) 헤더 row 찾기 — 같은 y에 "일/월/화/수/목/금/토" 중 5개 이상 모인 줄
  const header = findHeaderRow(items);
  if (!header) {
    return { ok: false, reason: "no-header", message: "요일 헤더(일/월/화/수/목/금/토) 행을 못 찾음" };
  }

  // 2) 컬럼 경계 — 인접 헤더 사이 중점을 경계로
  const columns = buildColumns(header);

  // 3) 헤더 아래쪽 (y < headerY) 아이템만 본다 — 위쪽은 학번·학기 메타
  const body = items.filter((it) => it.y < header.y - 2);

  // 4) "1교시"·"2교시" period anchor + "[HH:MM~HH:MM]" 시간 라벨 모두 수집.
  //    행 경계는 **시간 라벨의 y**로 잡는다 (period 라벨은 셀 중앙에 가까워
  //    셀 안의 마지막 줄(강의명)이 다음 행으로 새는 사례가 잦음).
  const periods = extractPeriods(body, columns[0].left);
  if (periods.length === 0) {
    return { ok: false, reason: "no-rows", message: "교시 anchor를 못 찾음" };
  }

  // 5) 각 period의 y 범위 안에 있는 데이터 셀을 컬럼별로 모은다.
  //    yTop = 시간 라벨 y (행의 진짜 윗변), yBottom = 다음 행의 시간 라벨 y.
  //    시간 라벨이 없는 row(쿼리 헤더 X)는 period y - 22로 폴백.
  const rows = periods
    .map((p, idx) => {
      const yTop = p.timeY ?? p.y + 22;
      const next = periods[idx + 1];
      const yBottom = next ? (next.timeY ?? next.y + 22) : -Infinity;
      const cells: Record<string, string[]> = {};
      for (const col of columns) {
        cells[col.weekday] = [];
      }
      for (const it of body) {
        // [yBottom, yTop) 반열린 구간 — 다음 행의 시간 라벨 자체는 다음 행 소속
        if (it.y >= yTop || it.y < yBottom) continue;
        // period anchor 자신 + 그 옆의 시간 라벨은 셀로 안 셈
        if (it.x < columns[0].left - 5) continue;
        const col = columnForX(it.x, columns);
        if (!col) continue;
        cells[col.weekday].push(it.str.trim());
      }
      return {
        period: p.period,
        time: p.time,
        cells,
      };
    })
    // 모든 셀이 비어있는 행 제외 + 표 아래 메타("교과목명","학점","교양영역","교수명","강의실"
    // 같은 footer 헤더가 데이터 셀에 잡힌 것)는 noise이므로 제외.
    .filter((r) => {
      const allCells = Object.values(r.cells).flat();
      if (allCells.length === 0) return false;
      const META = ["교과목명", "학점", "교양영역", "교수명", "강의실", "강좌", "번호", "이수", "구분"];
      const metaHits = allCells.filter((s) => META.some((m) => s.includes(m))).length;
      // 셀 안 절반 이상이 메타 헤더면 표 footer로 판단
      if (metaHits >= Math.max(2, Math.floor(allCells.length * 0.5))) return false;
      return true;
    });

  if (rows.length === 0) {
    return { ok: false, reason: "no-rows", message: "데이터 셀이 모두 비어있음" };
  }

  const grid: TimetableGrid = { headerY: header.y, columns, rows };
  return { ok: true, grid, markdown: gridToMarkdown(grid) };
}

async function loadAllItems(bytes: ParseBytes): Promise<RawItem[]> {
  const u8 = toUint8Array(bytes);
  const pdf = await getDocumentProxy(u8);
  const all: RawItem[] = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    for (const it of content.items) {
      if (!("str" in it) || typeof it.str !== "string") continue;
      const s = it.str.trim();
      if (s.length === 0) continue;
      const t = it.transform as number[];
      if (!Array.isArray(t) || t.length < 6) continue;
      all.push({
        str: s,
        x: round1(t[4]),
        y: round1(t[5]),
        w: round1((it as { width?: number }).width ?? 0),
        h: round1((it as { height?: number }).height ?? 0),
      });
    }
  }
  return all;
}

interface HeaderRow {
  y: number;
  positions: Array<{ weekday: (typeof WEEKDAYS_KO)[number]; x: number }>;
}

function findHeaderRow(items: RawItem[]): HeaderRow | null {
  // 같은 y(±1)로 묶고, 그 묶음 안에 요일 단어 3개 이상 들어있으면 헤더 후보
  const buckets = new Map<number, RawItem[]>();
  for (const it of items) {
    const key = Math.round(it.y);
    const arr = buckets.get(key) ?? [];
    arr.push(it);
    buckets.set(key, arr);
  }
  let best: HeaderRow | null = null;
  for (const [yKey, arr] of buckets) {
    const found: HeaderRow["positions"] = [];
    for (const wd of WEEKDAYS_KO) {
      const hit = arr.find((it) => it.str === wd);
      if (hit) found.push({ weekday: wd, x: hit.x });
    }
    if (found.length >= 3) {
      // 가장 많이 잡힌 row를 헤더로
      if (!best || found.length > best.positions.length) {
        best = { y: yKey, positions: found.sort((a, b) => a.x - b.x) };
      }
    }
  }
  return best;
}

function buildColumns(header: HeaderRow): TimetableGrid["columns"] {
  const sorted = [...header.positions].sort((a, b) => a.x - b.x);
  const cols: TimetableGrid["columns"] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const cur = sorted[i];
    const prev = sorted[i - 1];
    const next = sorted[i + 1];
    // 경계 = 인접 헤더 중점. 양 끝은 ±넉넉히.
    const left = prev ? (prev.x + cur.x) / 2 : cur.x - 50;
    const right = next ? (cur.x + next.x) / 2 : cur.x + 80;
    cols.push({ weekday: cur.weekday, left, right });
  }
  return cols;
}

function columnForX(x: number, cols: TimetableGrid["columns"]): TimetableGrid["columns"][number] | null {
  for (const c of cols) {
    if (x >= c.left && x < c.right) return c;
  }
  return null;
}

interface PeriodAnchor {
  period: string;
  time: string;
  /** period 라벨 ("N교시")의 y */
  y: number;
  /** 시간 라벨 ("[HH:MM~HH:MM]")의 y — 행의 진짜 윗변. 없으면 null */
  timeY: number | null;
}

function extractPeriods(body: RawItem[], firstColLeft: number): PeriodAnchor[] {
  // period 라벨은 첫 컬럼(요일 셀)보다 왼쪽에 박힘. period 텍스트 = "N교시"
  const periodCandidates = body.filter(
    (it) => it.x < firstColLeft - 5 && PERIOD_RE.test(it.str),
  );
  // 같은 period 라벨이 여러 줄이면 가장 위쪽(y 큰 것)만
  const seen = new Set<string>();
  const periods: PeriodAnchor[] = [];
  for (const it of periodCandidates.sort((a, b) => b.y - a.y)) {
    if (seen.has(it.str)) continue;
    seen.add(it.str);
    // 같은 period의 시간 라벨 — period y보다 약간 아래(같은 셀 안)에 있다.
    // 보통 [HH:MM~HH:MM]은 period y에서 -10~-20 정도 (PDF 좌표는 위로 갈수록 y 큼).
    const time = body
      .filter(
        (t2) => t2.x < firstColLeft - 5 && TIME_RE.test(t2.str) && Math.abs(t2.y - it.y) < 36,
      )
      .sort((a, b) => Math.abs(a.y - it.y) - Math.abs(b.y - it.y))[0];
    periods.push({
      period: it.str,
      time: time ? time.str : "",
      y: it.y,
      timeY: time ? time.y : null,
    });
  }
  return periods.sort((a, b) => b.y - a.y); // 위→아래 (y 큰 게 위)
}

function gridToMarkdown(grid: TimetableGrid): string {
  const headerCols = grid.columns.map((c) => c.weekday);
  const lines: string[] = [];
  lines.push(`| 교시 | 시간 | ${headerCols.join(" | ")} |`);
  lines.push(`| --- | --- | ${headerCols.map(() => "---").join(" | ")} |`);
  for (const row of grid.rows) {
    const cells = headerCols.map((wd) => {
      const lines = row.cells[wd] ?? [];
      // 셀 안 줄들을 " / "로 합쳐 한 칸에. 빈 칸은 "-"
      return lines.length > 0 ? lines.join(" / ").replace(/\|/g, "/") : "-";
    });
    lines.push(`| ${row.period} | ${row.time} | ${cells.join(" | ")} |`);
  }
  return lines.join("\n");
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/* ────────────────────────────────────────────────────────────
 * 일반 표 추출 — 강의계획서 평가표·주차표 등 임의의 격자에 적용
 * ──────────────────────────────────────────────────────────── */

export interface GenericTableRow {
  /** 헤더 컬럼명 → 셀 안의 텍스트 줄들 */
  cells: Record<string, string[]>;
}

export interface GenericTable {
  page: number;
  /** 헤더로 잡힌 컬럼 라벨들 (좌→우) */
  columns: string[];
  rows: GenericTableRow[];
  /** LLM에 그대로 넣을 마크다운 표 */
  markdown: string;
}

export interface ExtractTablesResult {
  ok: true;
  tables: GenericTable[];
}

export interface ExtractTablesFailure {
  ok: false;
  reason: "pdfjs-failed" | "no-match";
  message: string;
}

/**
 * PDF 본문에서 "헤더 키워드"가 한 줄에 일정 수 이상 등장하는 row를 찾고,
 * 그 row의 컬럼 x 좌표를 경계로 격자를 재구성한다.
 *
 * 예시:
 *   - 시간표: keywords=["일","월","화","수","목","금","토"], min=4
 *   - 강의계획서 주차표: keywords=["주차","강의주제","과제","비고"], min=2
 *   - 평가표: keywords=["평가항목","비중","방법"], min=2
 *
 * 한 PDF 안에 여러 표가 있으면 각각 별도 GenericTable로 반환.
 */
export async function extractPdfTablesByHeader(
  bytes: ParseBytes,
  opts: {
    /** 헤더 row에서 일치해야 할 후보 단어들 (예: ["일","월","화",...]) */
    headerKeywords: readonly string[];
    /** 헤더 후보로 인정할 최소 일치 개수 */
    minMatches: number;
    /** 셀 안의 줄을 합칠 구분자 (기본 " / ") */
    joiner?: string;
  },
): Promise<ExtractTablesResult | ExtractTablesFailure> {
  let pages: RawItem[][];
  try {
    pages = await loadAllItemsByPage(bytes);
  } catch (e) {
    return {
      ok: false,
      reason: "pdfjs-failed",
      message: e instanceof Error ? e.message : String(e),
    };
  }

  const tables: GenericTable[] = [];
  for (let pageIdx = 0; pageIdx < pages.length; pageIdx += 1) {
    const items = pages[pageIdx];
    const headers = findGenericHeaders(items, opts.headerKeywords, opts.minMatches);
    for (const header of headers) {
      const cols = buildGenericColumns(header);
      // 본문 = 헤더보다 아래 (y < headerY)
      const body = items.filter((it) => it.y < header.y - 2);
      if (body.length === 0) continue;
      const rows = clusterRowsByY(body, cols, opts.joiner ?? " / ");
      if (rows.length === 0) continue;
      const columns = cols.map((c) => c.label);
      tables.push({
        page: pageIdx + 1,
        columns,
        rows,
        markdown: genericTableToMarkdown(columns, rows),
      });
    }
  }

  if (tables.length === 0) {
    return { ok: false, reason: "no-match", message: "헤더 키워드를 만족하는 표를 못 찾음" };
  }
  return { ok: true, tables };
}

async function loadAllItemsByPage(bytes: ParseBytes): Promise<RawItem[][]> {
  const u8 = toUint8Array(bytes);
  const pdf = await getDocumentProxy(u8);
  const out: RawItem[][] = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const items: RawItem[] = [];
    for (const it of content.items) {
      if (!("str" in it) || typeof it.str !== "string") continue;
      const s = it.str.trim();
      if (s.length === 0) continue;
      const t = it.transform as number[];
      if (!Array.isArray(t) || t.length < 6) continue;
      items.push({
        str: s,
        x: round1(t[4]),
        y: round1(t[5]),
        w: round1((it as { width?: number }).width ?? 0),
        h: round1((it as { height?: number }).height ?? 0),
      });
    }
    out.push(items);
  }
  return out;
}

interface GenericHeader {
  y: number;
  positions: Array<{ label: string; x: number }>;
}

function findGenericHeaders(
  items: RawItem[],
  keywords: readonly string[],
  minMatches: number,
): GenericHeader[] {
  const buckets = new Map<number, RawItem[]>();
  for (const it of items) {
    const key = Math.round(it.y);
    const arr = buckets.get(key) ?? [];
    arr.push(it);
    buckets.set(key, arr);
  }
  const headers: GenericHeader[] = [];
  for (const [yKey, arr] of buckets) {
    const found: GenericHeader["positions"] = [];
    for (const kw of keywords) {
      const hit = arr.find((it) => it.str === kw || it.str.replace(/\s/g, "") === kw);
      if (hit) found.push({ label: kw, x: hit.x });
    }
    if (found.length >= minMatches) {
      headers.push({ y: yKey, positions: found.sort((a, b) => a.x - b.x) });
    }
  }
  return headers;
}

function buildGenericColumns(
  header: GenericHeader,
): Array<{ label: string; left: number; right: number }> {
  const sorted = [...header.positions].sort((a, b) => a.x - b.x);
  const cols: Array<{ label: string; left: number; right: number }> = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const cur = sorted[i];
    const prev = sorted[i - 1];
    const next = sorted[i + 1];
    const left = prev ? (prev.x + cur.x) / 2 : cur.x - 50;
    const right = next ? (cur.x + next.x) / 2 : cur.x + 80;
    cols.push({ label: cur.label, left, right });
  }
  return cols;
}

function clusterRowsByY(
  body: RawItem[],
  cols: Array<{ label: string; left: number; right: number }>,
  joiner: string,
): GenericTableRow[] {
  // y 값을 8px tolerance로 묶어 행으로
  const sortedByY = [...body].sort((a, b) => b.y - a.y);
  const rowsByY: Array<{ y: number; items: RawItem[] }> = [];
  for (const it of sortedByY) {
    const cur = rowsByY[rowsByY.length - 1];
    if (cur && Math.abs(cur.y - it.y) < 8) {
      cur.items.push(it);
    } else {
      rowsByY.push({ y: it.y, items: [it] });
    }
  }
  const out: GenericTableRow[] = [];
  for (const r of rowsByY) {
    const cells: Record<string, string[]> = {};
    for (const c of cols) cells[c.label] = [];
    let any = false;
    for (const it of r.items) {
      for (const c of cols) {
        if (it.x >= c.left && it.x < c.right) {
          cells[c.label].push(it.str);
          any = true;
          break;
        }
      }
    }
    if (any) out.push({ cells });
  }
  // joiner는 markdown 출력에서 사용
  void joiner;
  return out;
}

function genericTableToMarkdown(columns: string[], rows: GenericTableRow[]): string {
  const lines: string[] = [];
  lines.push(`| ${columns.join(" | ")} |`);
  lines.push(`| ${columns.map(() => "---").join(" | ")} |`);
  for (const r of rows) {
    const cells = columns.map((c) => {
      const v = (r.cells[c] ?? []).join(" / ").replace(/\|/g, "/");
      return v.length > 0 ? v : "-";
    });
    lines.push(`| ${cells.join(" | ")} |`);
  }
  return lines.join("\n");
}
