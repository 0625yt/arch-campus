"use client";

import { useEffect, useRef, useState } from "react";
import type { EventView } from "@/lib/data/events";
import { formatEventCompact, formatEventLabel } from "@/lib/format-event";
import { kindColor } from "../calendar-board";
import {
  ALL_DAY_ROW_PX,
  HOUR_HEIGHT_PX,
  TIME_AXIS_WIDTH_WEEK,
  formatHourLabel,
  getNowKstMinutes,
  isoToKstDateKey,
  layoutDayEvents,
  weekDateKeys,
} from "./shared/time-grid";

/**
 * 주 뷰 — 시간×요일 그리드 (macOS Calendar 톤).
 *
 * 레이아웃:
 *   [             종일 띠 (allDay 이벤트, 가변 높이)              ]
 *   [시간축 | 일 | 월 | 화 | 수 | 목 | 금 | 토 ]
 *   [ 00:00 |    ...                              ] ← 48px/시간 × 24
 *   ...
 *   [ 23:00 |                                     ]
 *
 * 진입 시 08:00 위치로 스크롤. 현재 시각 빨간 가로선.
 * viewMode === "timetable"이면 kind === "class" 이벤트만 필터.
 */

const WEEKDAYS_FULL = ["일", "월", "화", "수", "목", "금", "토"];

interface WeekViewProps {
  /** 주의 시작일 (일요일) ISO date key "YYYY-MM-DD" */
  weekStart: string;
  /** 이 주 범위의 이벤트들 (호출자에서 prefilter 불필요 — 컴포넌트에서 날짜로 분류) */
  events: EventView[];
  /** "all" | "timetable" — timetable이면 class kind만 표시 */
  viewMode: "all" | "timetable";
  onSelectEvent?: (event: EventView, anchorRect: DOMRect) => void;
  onSelectEmpty?: (dateKey: string, hour: number) => void;
}

export function WeekView({ weekStart, events, viewMode, onSelectEvent, onSelectEmpty }: WeekViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [nowMin, setNowMin] = useState(-1);

  useEffect(() => {
    setMounted(true);
    setNowMin(getNowKstMinutes(true));
    const t = setInterval(() => setNowMin(getNowKstMinutes(true)), 60_000);
    return () => clearInterval(t);
  }, []);

  // 진입 시 08:00 위치로 스크롤 (한 번만)
  useEffect(() => {
    if (!mounted || !scrollRef.current) return;
    scrollRef.current.scrollTop = 8 * HOUR_HEIGHT_PX - 24;
  }, [mounted, weekStart]);

  const dateKeys = weekDateKeys(weekStart);
  const todayKey = isoToKstDateKey(new Date().toISOString());

  // viewMode 필터
  const filtered = viewMode === "timetable" ? events.filter((e) => e.kind === "class") : events;

  // 날짜별 분류 (allDay / timed 분리)
  const byDate = new Map<string, { allDay: EventView[]; timed: EventView[] }>();
  for (const key of dateKeys) byDate.set(key, { allDay: [], timed: [] });
  for (const e of filtered) {
    const key = isoToKstDateKey(e.startsAt);
    const bucket = byDate.get(key);
    if (!bucket) continue;
    if (e.allDay) bucket.allDay.push(e);
    else bucket.timed.push(e);
  }

  // allDay 띠 높이 — 7컬럼 중 최대 allDay 개수만큼
  const maxAllDay = Math.max(0, ...dateKeys.map((k) => byDate.get(k)?.allDay.length ?? 0));
  const allDayBandHeight = maxAllDay === 0 ? 0 : maxAllDay * (ALL_DAY_ROW_PX + 2) + 8;

  return (
    <div className="mt-4 overflow-hidden rounded-[10px] border border-[var(--color-apple-hairline)] bg-white">
      {/* 헤더: 시간축 placeholder + 요일·날짜 */}
      <div className="flex border-b border-[var(--color-apple-hairline)] bg-white">
        <div style={{ width: TIME_AXIS_WIDTH_WEEK }} className="shrink-0" />
        {dateKeys.map((key) => {
          const d = new Date(`${key}T00:00:00+09:00`);
          const dow = d.getDay();
          const isToday = key === todayKey;
          return (
            <div key={key} className="flex flex-1 flex-col items-center gap-0.5 py-2">
              <span
                className="text-[10.5px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]"
                style={{ letterSpacing: "0.06em" }}
              >
                {WEEKDAYS_FULL[dow]}
              </span>
              <span
                className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] wght-620 tabular-nums ${
                  isToday
                    ? "bg-[var(--color-apple-action)] text-white"
                    : "text-[var(--color-apple-ink)]"
                }`}
              >
                {d.getDate()}
              </span>
            </div>
          );
        })}
      </div>

      {/* 종일 띠 (이벤트 있을 때만) */}
      {allDayBandHeight > 0 && (
        <div
          className="flex border-b border-[var(--color-apple-hairline)] bg-[var(--color-apple-pearl)]/30"
          style={{ height: allDayBandHeight }}
        >
          <div
            style={{ width: TIME_AXIS_WIDTH_WEEK }}
            className="flex shrink-0 items-center justify-end pr-2 text-[10px] wght-450 text-[var(--color-apple-muted)]"
          >
            종일
          </div>
          {dateKeys.map((key) => (
            <div key={key} className="relative flex-1 border-l border-[var(--color-apple-hairline-soft)] px-1 pt-1">
              {(byDate.get(key)?.allDay ?? []).map((e, i) => {
                const color = kindColor(e.kind, e.courseColor);
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={(ev) => {
                      const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                      onSelectEvent?.(e, rect);
                    }}
                    title={formatEventLabel(e)}
                    className="mb-[2px] block w-full truncate rounded-[3px] px-1.5 py-[1px] text-left text-[11px] wght-560 leading-[1.45] transition-opacity hover:brightness-105"
                    style={{
                      backgroundColor: toAlpha(color, 0.18),
                      color: "var(--color-apple-ink)",
                      letterSpacing: "-0.012em",
                      top: i * (ALL_DAY_ROW_PX + 2),
                    }}
                  >
                    {formatEventCompact(e)}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* 시간 그리드 — 24시간 스크롤 */}
      <div ref={scrollRef} className="relative max-h-[640px] overflow-y-auto">
        <div className="flex" style={{ height: HOUR_HEIGHT_PX * 24 }}>
          {/* 시간축 */}
          <div
            style={{ width: TIME_AXIS_WIDTH_WEEK }}
            className="relative shrink-0 border-r border-[var(--color-apple-hairline)]"
          >
            {Array.from({ length: 24 }, (_, h) => h).map((h) => (
              <div
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[10px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
                style={{ top: h * HOUR_HEIGHT_PX, letterSpacing: "-0.006em" }}
              >
                {h === 0 ? "" : formatHourLabel(h)}
              </div>
            ))}
          </div>

          {/* 7일 컬럼 */}
          {dateKeys.map((key) => {
            const bucket = byDate.get(key);
            const positioned = bucket ? layoutDayEvents(bucket.timed) : [];
            const isToday = key === todayKey;
            return (
              <div
                key={key}
                className="relative flex-1 border-l border-[var(--color-apple-hairline-soft)]"
                style={{ backgroundColor: isToday ? "var(--color-surface-cream)" : undefined }}
              >
                {/* 시간 hairline */}
                {Array.from({ length: 24 }, (_, h) => h).map((h) => (
                  <div
                    key={h}
                    className="absolute inset-x-0 border-t border-[var(--color-apple-hairline)]/40"
                    style={{ top: h * HOUR_HEIGHT_PX }}
                  />
                ))}
                {/* 30분 hairline (옅게) */}
                {Array.from({ length: 24 }, (_, h) => h).map((h) => (
                  <div
                    key={`half-${h}`}
                    className="absolute inset-x-0 border-t border-[var(--color-apple-hairline-soft)]/40 border-dashed"
                    style={{ top: h * HOUR_HEIGHT_PX + HOUR_HEIGHT_PX / 2 }}
                  />
                ))}

                {/* 빈 시간 클릭 → 새 일정 (시간 분 단위 prefill) */}
                {onSelectEmpty && (
                  <button
                    type="button"
                    aria-label={`${key} 빈 시간에 일정 추가`}
                    onClick={(e) => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const offsetY = e.clientY - rect.top;
                      const hour = Math.floor(offsetY / HOUR_HEIGHT_PX);
                      onSelectEmpty(key, hour);
                    }}
                    className="absolute inset-0 cursor-pointer"
                  />
                )}

                {/* 이벤트 카드들 */}
                {positioned.map(({ event, topPx, heightPx, columnIdx, totalColumns }) => {
                  const widthPct = 100 / totalColumns;
                  const leftPct = columnIdx * widthPct;
                  const color = kindColor(event.kind, event.courseColor);
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        onSelectEvent?.(event, rect);
                      }}
                      title={formatEventLabel(event)}
                      className="absolute overflow-hidden rounded-[4px] px-1.5 py-[2px] text-left transition-all hover:z-10 hover:brightness-95 hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.18)]"
                      style={{
                        top: topPx,
                        height: heightPx,
                        left: `calc(${leftPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                        backgroundColor: toAlpha(color, 0.18),
                        borderLeft: `2.5px solid ${color}`,
                        color: "var(--color-apple-ink)",
                        letterSpacing: "-0.012em",
                      }}
                    >
                      <span className="block truncate text-[11px] wght-620 leading-[1.3]">
                        {formatEventCompact(event)}
                      </span>
                      {heightPx >= 36 && event.endsAt && (
                        <span className="block truncate text-[10px] wght-450 tabular-nums opacity-70">
                          {formatTimeRange(event.startsAt, event.endsAt)}
                        </span>
                      )}
                    </button>
                  );
                })}

                {/* 오늘 컬럼에 현재 시각 라인 */}
                {isToday && nowMin >= 0 && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 z-20"
                    style={{ top: (nowMin / 60) * HOUR_HEIGHT_PX }}
                  >
                    <div className="relative">
                      <span className="absolute -left-[5px] -top-[5px] block h-[10px] w-[10px] rounded-full bg-[var(--color-urgent)]" />
                      <div className="border-t border-[var(--color-urgent)]" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function formatTimeRange(startsAt: string, endsAt: string): string {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  };
  return `${fmt(startsAt)} – ${fmt(endsAt)}`;
}

/** hex/rgb 색을 알파 섞은 rgba로. (calendar-board의 동명 함수와 중복이지만 의존 줄이려 인라인.) */
function toAlpha(input: string, alpha: number): string {
  const hex = input.trim();
  if (hex.startsWith("#") && (hex.length === 7 || hex.length === 4)) {
    let r: number, g: number, b: number;
    if (hex.length === 7) {
      r = parseInt(hex.slice(1, 3), 16);
      g = parseInt(hex.slice(3, 5), 16);
      b = parseInt(hex.slice(5, 7), 16);
    } else {
      r = parseInt(hex[1] + hex[1], 16);
      g = parseInt(hex[2] + hex[2], 16);
      b = parseInt(hex[3] + hex[3], 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hex;
}
