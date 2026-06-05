"use client";

import { useEffect, useRef, useState } from "react";
import type { EventView } from "@/lib/data/events";
import { formatEventCompact, formatEventLabel } from "@/lib/format-event";
import { useIsDark } from "../../use-mobile";
import { eventColorThemed } from "../calendar-board";
import {
  ALL_DAY_ROW_PX,
  formatHourLabel,
  getNowKstMinutes,
  HOUR_HEIGHT_PX,
  isoToKstDateKey,
  layoutDayEvents,
  TIME_AXIS_WIDTH_WEEK,
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

export function WeekView({
  weekStart,
  events,
  viewMode,
  onSelectEvent,
  onSelectEmpty,
}: WeekViewProps) {
  const isDark = useIsDark();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [nowMin, setNowMin] = useState(-1);

  useEffect(() => {
    setMounted(true);
    setNowMin(getNowKstMinutes(true));
    const t = setInterval(() => setNowMin(getNowKstMinutes(true)), 60_000);
    return () => clearInterval(t);
  }, []);

  // 진입 시 스크롤 — 시간표 모드(06시 시작)는 그리드 top, 일반 모드는 08시.
  const startHourForScroll = viewMode === "timetable" ? 6 : 0;
  useEffect(() => {
    if (!mounted || !scrollRef.current) return;
    const target =
      viewMode === "timetable" ? 0 : Math.max(0, (8 - startHourForScroll) * HOUR_HEIGHT_PX - 24);
    scrollRef.current.scrollTop = target;
  }, [mounted, weekStart, viewMode, startHourForScroll]);

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

  // 시간표만 모드는 06시부터 (새벽은 학생 컨텍스트 X). 일반 모드는 0시부터.
  const startHour = viewMode === "timetable" ? 6 : 0;
  const visibleHours = 24 - startHour;
  const gridHeight = visibleHours * HOUR_HEIGHT_PX;

  return (
    // 모바일(<sm): 외부 wrapper에서만 가로 스크롤이 일어나게 격리.
    //   - 외부 mt-4 + overflow-x-auto: 페이지 폭 넘어가지 않고 내부에서만 가로 스크롤.
    //   - 내부 min-w-[560px]: 시간축 56 + day 72×7 ≈ 560px 보장 → 짜부시키지 않음.
    // sm+: min-w 해제(자동 flex-1) + overflow-hidden.
    <div className="mt-4 -mx-1 overflow-x-auto overflow-y-hidden sm:mx-0 sm:overflow-x-hidden">
      <div className="min-w-[560px] overflow-hidden rounded-[10px] border border-[var(--color-apple-hairline)] bg-white sm:min-w-0">
        {/* 헤더: 시간축 placeholder + 요일·날짜 (macOS 톤 "17일 (일)" 한 줄) */}
        <div className="flex border-b border-[var(--color-apple-hairline)] bg-white">
          <div style={{ width: TIME_AXIS_WIDTH_WEEK }} className="shrink-0" />
          {dateKeys.map((key) => {
            const d = new Date(`${key}T00:00:00+09:00`);
            const dow = d.getDay();
            const isToday = key === todayKey;
            return (
              <div key={key} className="flex flex-1 items-baseline justify-center gap-1.5 py-2.5">
                <span
                  className={`tabular-nums text-[15px] wght-620 ${
                    isToday
                      ? "inline-flex h-7 min-w-[28px] items-center justify-center rounded-full bg-[var(--color-urgent)] px-1 text-white"
                      : "text-[var(--color-apple-ink)]"
                  }`}
                  style={{ letterSpacing: "-0.012em" }}
                >
                  {d.getDate()}일
                </span>
                <span
                  className={`text-[12px] wght-450 ${
                    isToday
                      ? "text-[var(--color-urgent)] wght-560"
                      : "text-[var(--color-apple-muted)]"
                  }`}
                  style={{ letterSpacing: "-0.012em" }}
                >
                  ({WEEKDAYS_FULL[dow]})
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
              <div
                key={key}
                className="relative flex-1 border-l border-[var(--color-apple-hairline-soft)] px-1 pt-1"
              >
                {(byDate.get(key)?.allDay ?? []).map((e, i) => {
                  const color = eventColorThemed(e, isDark);
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
          <div className="flex" style={{ height: gridHeight }}>
            {/* 시간축 — startHour부터 표시. 현재 시각은 빨간 박스로 라벨 대체 */}
            <div
              style={{ width: TIME_AXIS_WIDTH_WEEK }}
              className="relative shrink-0 border-r border-[var(--color-apple-hairline)]"
            >
              {Array.from({ length: visibleHours }, (_, i) => startHour + i).map((h) => {
                // 현재 시각이 이 1시간 슬롯 안에 있으면 라벨 숨김 (빨간 박스가 자리 가져감)
                const nowInSlot = nowMin >= h * 60 && nowMin < (h + 1) * 60;
                if (nowInSlot) return null;
                return (
                  <div
                    key={h}
                    className="absolute right-2 -translate-y-1/2 text-[10px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
                    style={{ top: (h - startHour) * HOUR_HEIGHT_PX, letterSpacing: "-0.006em" }}
                  >
                    {h === startHour && startHour === 0 ? "" : formatHourLabel(h)}
                  </div>
                );
              })}
              {/* 현재 시각 빨간 박스 — macOS Calendar 톤 */}
              {nowMin >= startHour * 60 && (
                <div
                  aria-hidden
                  className="absolute right-1 -translate-y-1/2 rounded-[4px] bg-[var(--color-urgent)] px-1.5 py-[1px] text-[10px] wght-700 tabular-nums text-white"
                  style={{
                    top: (nowMin / 60 - startHour) * HOUR_HEIGHT_PX,
                    letterSpacing: "-0.006em",
                  }}
                >
                  {formatNowTime(nowMin)}
                </div>
              )}
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
                  {Array.from({ length: visibleHours }, (_, i) => startHour + i).map((h) => (
                    <div
                      key={h}
                      className="absolute inset-x-0 border-t border-[var(--color-apple-hairline)]/40"
                      style={{ top: (h - startHour) * HOUR_HEIGHT_PX }}
                    />
                  ))}
                  {/* 30분 hairline (옅게) */}
                  {Array.from({ length: visibleHours }, (_, i) => startHour + i).map((h) => (
                    <div
                      key={`half-${h}`}
                      className="absolute inset-x-0 border-t border-[var(--color-apple-hairline-soft)]/40 border-dashed"
                      style={{ top: (h - startHour) * HOUR_HEIGHT_PX + HOUR_HEIGHT_PX / 2 }}
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
                        const hour = startHour + Math.floor(offsetY / HOUR_HEIGHT_PX);
                        onSelectEmpty(key, hour);
                      }}
                      className="absolute inset-0 cursor-pointer"
                    />
                  )}

                  {/* 이벤트 카드들 — startHour 오프셋 보정 */}
                  {positioned.map(({ event, topPx, heightPx, columnIdx, totalColumns }) => {
                    const widthPct = 100 / totalColumns;
                    const leftPct = columnIdx * widthPct;
                    const color = eventColorThemed(event, isDark);
                    const adjustedTop = topPx - startHour * HOUR_HEIGHT_PX;
                    // 시작 시간이 startHour 이전이면 그리드에서 숨김 (시간표 모드 06시 이전 X)
                    if (adjustedTop + heightPx < 0) return null;
                    const isRecurring = event.kind === "class";
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
                          top: Math.max(0, adjustedTop),
                          height: heightPx + Math.min(0, adjustedTop),
                          left: `calc(${leftPct}% + 2px)`,
                          width: `calc(${widthPct}% - 4px)`,
                          backgroundColor: toAlpha(color, 0.18),
                          borderLeft: `2.5px solid ${color}`,
                          color: "var(--color-apple-ink)",
                          letterSpacing: "-0.012em",
                        }}
                      >
                        <div className="flex items-start justify-between gap-1">
                          {/* 블록이 넉넉하면(>=44px) 제목 2줄까지 — 모바일 좁은 컬럼에서
                              "글로컬 영어 I"가 "글로…"로 짤리던 문제 완화. 짧은 블록은 1줄. */}
                          <span
                            className={`block min-w-0 wrap-break-word text-[11px] wght-620 leading-[1.3] ${
                              heightPx >= 44 ? "line-clamp-2" : "truncate"
                            }`}
                          >
                            {formatEventCompact(event)}
                          </span>
                          {isRecurring && (
                            <svg
                              aria-hidden
                              width="10"
                              height="10"
                              viewBox="0 0 24 24"
                              fill="none"
                              className="mt-[3px] shrink-0 opacity-70"
                            >
                              <path
                                d="M17 2l4 4-4 4M3 11v-1a4 4 0 014-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 01-4 4H3"
                                stroke="currentColor"
                                strokeWidth={2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </div>
                        {heightPx >= 36 && event.endsAt && (
                          <span className="block truncate text-[10px] wght-450 tabular-nums opacity-70">
                            {formatTimeRange(event.startsAt, event.endsAt)}
                          </span>
                        )}
                      </button>
                    );
                  })}

                  {/* 오늘 컬럼에 현재 시각 라인 — 시간 빨간 박스 + 가로선 */}
                  {isToday && nowMin >= 0 && nowMin >= startHour * 60 && (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 z-20"
                      style={{ top: (nowMin / 60 - startHour) * HOUR_HEIGHT_PX }}
                    >
                      <div className="relative">
                        <div className="border-t-[1.5px] border-[var(--color-urgent)]" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 현재 시각을 "H:MM" 한국어 톤으로. */
function formatNowTime(minOfDay: number): string {
  const h = Math.floor(minOfDay / 60);
  const m = minOfDay % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
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
