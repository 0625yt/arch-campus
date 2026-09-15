"use client";

/**
 * 년 뷰 — macOS Calendar 톤. 12개월을 3행 × 4열 미니 그리드로 한 화면에 표시.
 *
 * 각 미니 월:
 *  - 월 라벨 (좌상단, 큰 글씨)
 *  - 7열 요일 표 + 6행 날짜
 *  - 일정이 있는 날짜는 옅은 배경 (점 아님 — §10 가드)
 *  - 오늘은 빨간 동그라미
 *
 * 클릭 동작:
 *  - 월 라벨 클릭 → 그 월의 월 뷰로 이동
 *  - 날짜 셀 클릭 → 그 날의 일 뷰로 이동
 */

import { useMemo } from "react";
import type { EventView } from "@/lib/data/events";
import { kstDateKey } from "@/lib/kst";
import { eventDisplayDateKeys } from "./shared/time-grid";

interface MiniMonthCell {
  key: string;
  iso: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  hasEvent: boolean;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const MONTH_LABELS = [
  "1월",
  "2월",
  "3월",
  "4월",
  "5월",
  "6월",
  "7월",
  "8월",
  "9월",
  "10월",
  "11월",
  "12월",
];

export function YearView({
  year,
  events,
  onSelectMonth,
  onSelectDay,
}: {
  year: number;
  events: EventView[];
  /** 월 라벨 클릭 → 그 월의 월 뷰로 이동 (0-base month) */
  onSelectMonth: (year: number, month: number) => void;
  /** 날짜 클릭 → 일 뷰로 이동 */
  onSelectDay: (dateKey: string) => void;
}) {
  // 일정이 있는 날짜 집합 (KST 기준)
  const eventDates = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) {
      for (const dateKey of eventDisplayDateKeys(e)) set.add(dateKey);
    }
    return set;
  }, [events]);

  const todayIso = useMemo(() => {
    return kstDateKey(new Date());
  }, []);

  return (
    // 모바일(<sm): 1열 — 각 월이 화면 폭 가득 사용해 날짜/요일 글씨 충분히 크게.
    // sm: 3열 (iPad), lg: 4열 (desktop). 종전 2열 모바일은 셀 폭 170px이라 9.5px 날짜라 못 읽음.
    <div className="mt-4 grid grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-3 lg:grid-cols-4">
      {MONTH_LABELS.map((label, monthIdx) => {
        const cells = buildMiniMonth(year, monthIdx, eventDates, todayIso);
        return (
          <div key={label} className="flex flex-col">
            <button
              type="button"
              onClick={() => onSelectMonth(year, monthIdx)}
              className="inline-flex min-h-10 items-center self-start rounded-[4px] px-1 text-left text-[15px] wght-700 text-[var(--color-apple-ink)] transition-colors hover:text-[var(--color-apple-action)]"
              style={{ letterSpacing: 0 }}
            >
              {label}
            </button>
            <div className="mt-1.5 grid grid-cols-7 gap-y-[2px] text-center text-[9.5px] wght-560 uppercase tracking-[0.04em] text-[var(--color-apple-muted)]">
              {WEEKDAYS.map((d) => (
                <span key={d} className="py-0.5">
                  {d}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-[1px]">
              {cells.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => c.inMonth && onSelectDay(c.iso)}
                  disabled={!c.inMonth}
                  aria-label={
                    c.inMonth ? `${label} ${c.day}일${c.hasEvent ? ", 일정 있음" : ""}` : undefined
                  }
                  className={`inline-flex h-10 w-full items-center justify-center text-[10.5px] tabular-nums transition-colors lg:h-8 ${
                    !c.inMonth
                      ? "text-transparent"
                      : c.isToday
                        ? "wght-620 text-white"
                        : c.hasEvent
                          ? "wght-620 text-[var(--color-apple-ink)] hover:bg-[var(--color-apple-pearl)]"
                          : "wght-450 text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]"
                  }`}
                  style={{
                    backgroundColor:
                      c.inMonth && !c.isToday && c.hasEvent
                        ? "var(--color-surface-cream)"
                        : undefined,
                    borderRadius: c.hasEvent && !c.isToday ? "4px" : undefined,
                  }}
                >
                  <span
                    className={
                      c.isToday
                        ? "inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-[var(--color-apple-action)] px-1"
                        : undefined
                    }
                  >
                    {c.day}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function buildMiniMonth(
  year: number,
  month: number,
  eventDates: Set<string>,
  todayIso: string,
): MiniMonthCell[] {
  // 월의 1일이 무슨 요일인지 (KST 기준 — 단순 Date로 충분, 새벽 시간 이벤트 없음)
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: MiniMonthCell[] = [];

  // 앞 패딩 (이전 월 말일들 — 빈 자리로 채움)
  for (let i = 0; i < firstDow; i++) {
    cells.push({
      key: `leading-${i}`,
      iso: "",
      day: 0,
      inMonth: false,
      isToday: false,
      hasEvent: false,
    });
  }

  // 이번 월 날짜
  const pad = (n: number) => String(n).padStart(2, "0");
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${pad(month + 1)}-${pad(d)}`;
    cells.push({
      key: iso,
      iso,
      day: d,
      inMonth: true,
      isToday: iso === todayIso,
      hasEvent: eventDates.has(iso),
    });
  }

  // 뒷 패딩 — 6행(42칸) 채우기
  while (cells.length < 42) {
    cells.push({
      key: `trailing-${cells.length}`,
      iso: "",
      day: 0,
      inMonth: false,
      isToday: false,
      hasEvent: false,
    });
  }

  return cells;
}
