/**
 * 주 뷰·일 뷰 공용 시간 그리드 유틸.
 *
 * 책임:
 *   1) 이벤트의 그리드 내 픽셀 위치(top·height) 계산
 *   2) 같은 컬럼에서 시간이 겹치는 이벤트들을 좌→우 column으로 분할
 *   3) KST 기준 시간 추출 (ISO UTC → KST hour·minute)
 *
 * 그리드 스케일: 1시간 = HOUR_HEIGHT_PX. 컨테이너 높이 = HOUR_HEIGHT_PX × 24.
 */

import type { EventView } from "@/lib/data/events";

/** 1시간당 픽셀 높이. 주 뷰·일 뷰 동일 스케일. */
export const HOUR_HEIGHT_PX = 48;

/** 종일 띠 한 줄 높이. */
export const ALL_DAY_ROW_PX = 22;

/** 시간 컬럼 폭. 주 뷰 56px, 일 뷰 64px. */
export const TIME_AXIS_WIDTH_WEEK = 56;
export const TIME_AXIS_WIDTH_DAY = 64;

/** 이벤트 최소 높이 — 한 줄 가독 보장. */
const MIN_EVENT_HEIGHT_PX = 22;

/**
 * ISO datetime → KST 기준 분(0~1439). 자정부터 몇 분 지났는지.
 * 그리드 top 계산용.
 */
export function isoToKstMinutes(iso: string): number {
  const d = new Date(iso);
  // toLocaleString으로 KST 보장. timezone-aware.
  const kst = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return kst.getHours() * 60 + kst.getMinutes();
}

/** ISO datetime → "YYYY-MM-DD" (KST 기준 날짜). 같은 날 판정용. */
export function isoToKstDateKey(iso: string): string {
  const d = new Date(iso);
  // sv-SE 로케일은 ISO date 형식
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** "HH:MM" 라벨. 시간축 표시용. */
export function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export interface PositionedEvent {
  event: EventView;
  /** 그리드 컨테이너 기준 top px. */
  topPx: number;
  /** 그리드 컨테이너 기준 height px. */
  heightPx: number;
  /** 같은 시간 슬롯에서 좌→우 몇 번째 컬럼인가 (0-base). */
  columnIdx: number;
  /** 같은 시간 슬롯의 총 컬럼 수 — 카드 width = 1/totalColumns. */
  totalColumns: number;
}

/**
 * 하루치 시간 이벤트들을 그리드 위치로 배치.
 *
 * 알고리즘 (greedy column packing):
 *   1) startsAt 순으로 정렬
 *   2) 각 이벤트마다 "비어있는 가장 왼쪽 column"에 배치
 *      - column이 끝나는 시각이 현재 이벤트 시작 시각 이하면 재사용 가능
 *      - 모두 점유 중이면 새 column 추가
 *   3) 겹치는 이벤트 그룹마다 totalColumns를 동일하게 적용
 *
 * 같은 시간대 이벤트 5개 이상이면 5번째부터는 "+N" 칩으로 표시 (호출자 책임).
 *
 * @param events 단일 날짜의 시간 지정 이벤트 (allDay=false). 정렬 안 돼 있어도 됨.
 * @returns 그리드 좌표가 박힌 PositionedEvent 배열
 */
export function layoutDayEvents(events: EventView[]): PositionedEvent[] {
  if (events.length === 0) return [];

  // 시작 시간 순 정렬. tiebreak: 더 긴 이벤트가 먼저 와야 column 분할이 자연스러움.
  const sorted = [...events].sort((a, b) => {
    const aStart = isoToKstMinutes(a.startsAt);
    const bStart = isoToKstMinutes(b.startsAt);
    if (aStart !== bStart) return aStart - bStart;
    const aEnd = a.endsAt ? isoToKstMinutes(a.endsAt) : aStart + 60;
    const bEnd = b.endsAt ? isoToKstMinutes(b.endsAt) : bStart + 60;
    return bEnd - aEnd;
  });

  // columnEndMinutes[i] = column i가 비어지는 시각 (분)
  const columnEndMinutes: number[] = [];
  // 임시 결과 — totalColumns는 모든 이벤트 처리 후 그룹 단위로 재계산
  const tmp: Array<{ event: EventView; startMin: number; endMin: number; columnIdx: number }> = [];

  for (const event of sorted) {
    const startMin = isoToKstMinutes(event.startsAt);
    const endMinRaw = event.endsAt ? isoToKstMinutes(event.endsAt) : startMin + 60;
    // 종료 < 시작이면 다음 날까지 — 그리드 하단까지 채움.
    const endMin = endMinRaw < startMin ? 24 * 60 : Math.max(endMinRaw, startMin + 30);

    // 가장 왼쪽 비어있는 column 찾기
    let placed = false;
    for (let i = 0; i < columnEndMinutes.length; i++) {
      if (columnEndMinutes[i] <= startMin) {
        columnEndMinutes[i] = endMin;
        tmp.push({ event, startMin, endMin, columnIdx: i });
        placed = true;
        break;
      }
    }
    if (!placed) {
      columnEndMinutes.push(endMin);
      tmp.push({ event, startMin, endMin, columnIdx: columnEndMinutes.length - 1 });
    }
  }

  // 겹치는 그룹 식별 — 시간이 한 번이라도 겹치면 같은 그룹.
  // 각 이벤트의 totalColumns는 그 이벤트가 속한 그룹의 max(columnIdx) + 1.
  const result: PositionedEvent[] = [];
  for (let i = 0; i < tmp.length; i++) {
    const me = tmp[i];
    let groupMaxCol = me.columnIdx;
    for (const other of tmp) {
      if (other === me) continue;
      // 시간이 겹치는 다른 이벤트
      if (other.startMin < me.endMin && other.endMin > me.startMin) {
        groupMaxCol = Math.max(groupMaxCol, other.columnIdx);
      }
    }
    const totalColumns = groupMaxCol + 1;
    const topPx = (me.startMin / 60) * HOUR_HEIGHT_PX;
    const rawHeight = ((me.endMin - me.startMin) / 60) * HOUR_HEIGHT_PX;
    const heightPx = Math.max(rawHeight, MIN_EVENT_HEIGHT_PX);
    result.push({
      event: me.event,
      topPx,
      heightPx,
      columnIdx: me.columnIdx,
      totalColumns,
    });
  }

  return result;
}

/**
 * 현재 시각을 KST 기준 분으로 변환.
 * 현재 시각 라인(빨간 가로선) 위치 계산용.
 *
 * @returns 0~1439 (자정부터 몇 분). mounted=false면 -1.
 */
export function getNowKstMinutes(mounted: boolean): number {
  if (!mounted) return -1;
  const now = new Date();
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return kst.getHours() * 60 + kst.getMinutes();
}

/**
 * 주어진 날짜의 일요일 (주의 시작) ISO date key 반환.
 * 주 뷰의 7일 컬럼 계산용. 우리 캘린더는 일요일 시작 (월 뷰와 일치).
 */
export function startOfWeekKst(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00+09:00`);
  const dow = d.getDay(); // 0(일) ~ 6(토)
  d.setDate(d.getDate() - dow);
  return isoToKstDateKey(d.toISOString());
}

/** 7일치 ISO date key 생성. */
export function weekDateKeys(weekStart: string): string[] {
  const out: string[] = [];
  const d = new Date(`${weekStart}T00:00:00+09:00`);
  for (let i = 0; i < 7; i++) {
    out.push(isoToKstDateKey(d.toISOString()));
    d.setDate(d.getDate() + 1);
  }
  return out;
}
