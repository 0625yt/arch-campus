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

  // 4) "1교시"·"2교시" 같은 period anchor를 첫 컬럼(왼쪽 끝)에서 찾고
  //    같은 y 근처의 시간 라벨([HH:MM~HH:MM])을 짝지운다.
  const periods = extractPeriods(body, columns[0].left);
  if (periods.length === 0) {
    return { ok: false, reason: "no-rows", message: "교시 anchor를 못 찾음" };
  }

  // 5) 각 period의 y 범위 안에 있는 데이터 셀을 컬럼별로 모은다
  const rows = periods
    .map((p, idx) => {
      const yTop = p.y + 4; // period 라벨보다 약간 위까지
      const yBottom = idx + 1 < periods.length ? periods[idx + 1].y + 4 : -Infinity;
      const cells: Record<string, string[]> = {};
      for (const col of columns) {
        cells[col.weekday] = [];
      }
      for (const it of body) {
        if (it.y > yTop || it.y <= yBottom) continue;
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
    // 모든 셀이 비어있는 행은 제외
    .filter((r) => Object.values(r.cells).some((lines) => lines.length > 0));

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
  y: number;
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
    // 같은 period의 시간 라벨 — 비슷한 y에 위치, "[HH:MM~HH:MM]" 형태
    const time = body.find(
      (t2) => Math.abs(t2.y - it.y) < 18 && t2.x < firstColLeft - 5 && TIME_RE.test(t2.str),
    );
    periods.push({
      period: it.str,
      time: time ? time.str : "",
      y: it.y,
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
