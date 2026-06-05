"use client";

import { useEffect, useRef, useState } from "react";
import type { EventView } from "@/lib/data/events";
import { formatEventCompact, formatEventLabel } from "@/lib/format-event";
import { eventColorThemed } from "../calendar-board";
import { useIsDark } from "../../use-mobile";
import {
  formatHourLabel,
  getNowKstMinutes,
  HOUR_HEIGHT_PX,
  isoToKstDateKey,
  layoutDayEvents,
  TIME_AXIS_WIDTH_DAY,
} from "./shared/time-grid";

/**
 * 일 뷰 — 단일 날짜 세로 타임라인. macOS Calendar 일 뷰 톤.
 *
 * 구조:
 *   - 헤더: 큰 날짜 + 요일
 *   - 종일 띠 (있을 때만)
 *   - 0~23시 세로 타임라인 (이벤트는 절대 위치, 시간축 좌측)
 *
 * 진입 시 08:00로 스크롤. 현재 시각 빨간 가로선.
 */

const WEEKDAYS_FULL = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

interface DayViewProps {
  /** ISO date key "YYYY-MM-DD" — 표시할 날짜 */
  dateKey: string;
  /** 이 날의 이벤트들 — 호출자가 prefilter 안 해도 됨 (컴포넌트에서 분류) */
  events: EventView[];
  onSelectEvent?: (event: EventView, anchorRect: DOMRect) => void;
  onSelectEmpty?: (dateKey: string, hour: number) => void;
}

export function DayView({ dateKey, events, onSelectEvent, onSelectEmpty }: DayViewProps) {
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

  const todayKey = isoToKstDateKey(new Date().toISOString());
  const isToday = dateKey === todayKey;

  const d = new Date(`${dateKey}T00:00:00+09:00`);
  const dow = d.getDay();
  const monthDay = `${d.getMonth() + 1}월 ${d.getDate()}일`;

  // 이 날짜 이벤트만 필터
  const dayEvents = events.filter((e) => isoToKstDateKey(e.startsAt) === dateKey);
  const allDay = dayEvents.filter((e) => e.allDay);
  const timed = dayEvents.filter((e) => !e.allDay);
  const positioned = layoutDayEvents(timed);

  // 일 뷰도 새벽(0~5시) 안 보여줌 — 일관성 + 학생 컨텍스트.
  // 단, 0~5시에 시작하는 이벤트가 있으면 자동으로 0시부터 표시.
  const hasEarlyEvent = timed.some((e) => {
    const d = new Date(e.startsAt);
    const kst = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    return kst.getHours() < 6;
  });
  const startHour = hasEarlyEvent ? 0 : 6;
  const visibleHours = 24 - startHour;
  const gridHeight = visibleHours * HOUR_HEIGHT_PX;

  useEffect(() => {
    if (!mounted || !scrollRef.current) return;
    // 진입 시 08시로 스크롤 — startHour 보정 후. 보통은 06시 시작이라 약간만 내림.
    const targetHour = 8;
    scrollRef.current.scrollTop = Math.max(0, (targetHour - startHour) * HOUR_HEIGHT_PX - 24);
  }, [mounted, dateKey, startHour]);

  return (
    <div className="mt-4 overflow-hidden rounded-[10px] border border-[var(--color-apple-hairline)] bg-white">
      {/* 헤더 — macOS 톤 두 줄: 큰 "5월 23일" + 다음 줄 "토요일" */}
      <div className="flex items-start justify-between gap-3 border-b border-[var(--color-apple-hairline)] px-5 py-4">
        <div className="flex flex-col">
          <span
            className={`text-[28px] leading-[1.1] wght-700 tabular-nums ${
              isToday ? "text-[var(--color-urgent)]" : "text-[var(--color-apple-ink)]"
            }`}
            style={{ letterSpacing: "-0.018em" }}
          >
            {d.getFullYear()}년 {monthDay}
          </span>
          <span
            className="mt-1 text-[14px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {WEEKDAYS_FULL[dow]}
          </span>
        </div>
        {isToday && (
          <span
            className="rounded-full bg-[var(--color-urgent)]/12 px-2 py-1 text-[11px] wght-620 text-[var(--color-urgent)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            오늘
          </span>
        )}
      </div>

      {/* 종일 띠 */}
      {allDay.length > 0 && (
        <div className="flex border-b border-[var(--color-apple-hairline)] bg-[var(--color-apple-pearl)]/30">
          <div
            style={{ width: TIME_AXIS_WIDTH_DAY }}
            className="flex shrink-0 items-start justify-end pr-3 pt-2 text-[10px] wght-450 text-[var(--color-apple-muted)]"
          >
            종일
          </div>
          <div className="flex-1 px-2 py-2">
            {allDay.map((e) => {
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
                  className="mb-[2px] block w-full max-w-[480px] truncate rounded-[4px] px-2 py-[3px] text-left text-[12px] wght-560 transition-opacity hover:brightness-105"
                  style={{
                    backgroundColor: toAlpha(color, 0.18),
                    color: "var(--color-apple-ink)",
                    letterSpacing: "-0.012em",
                  }}
                >
                  {formatEventLabel(e)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 시간 그리드 */}
      <div ref={scrollRef} className="relative max-h-[640px] overflow-y-auto">
        <div className="flex" style={{ height: gridHeight }}>
          {/* 시간축 — startHour부터, 현재 시각 슬롯엔 빨간 박스 */}
          <div
            style={{ width: TIME_AXIS_WIDTH_DAY }}
            className="relative shrink-0 border-r border-[var(--color-apple-hairline)]"
          >
            {Array.from({ length: visibleHours }, (_, i) => startHour + i).map((h) => {
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
            {/* 현재 시각 빨간 박스 (오늘 + 표시 범위 내) */}
            {isToday && nowMin >= startHour * 60 && (
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

          {/* 이벤트 영역 */}
          <div
            className="relative flex-1"
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
            {Array.from({ length: visibleHours }, (_, i) => startHour + i).map((h) => (
              <div
                key={`half-${h}`}
                className="absolute inset-x-0 border-t border-[var(--color-apple-hairline-soft)]/40 border-dashed"
                style={{ top: (h - startHour) * HOUR_HEIGHT_PX + HOUR_HEIGHT_PX / 2 }}
              />
            ))}

            {/* 빈 시간 클릭 → 새 일정 */}
            {onSelectEmpty && (
              <button
                type="button"
                aria-label="빈 시간에 일정 추가"
                onClick={(e) => {
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const offsetY = e.clientY - rect.top;
                  const hour = startHour + Math.floor(offsetY / HOUR_HEIGHT_PX);
                  onSelectEmpty(dateKey, hour);
                }}
                className="absolute inset-0 cursor-pointer"
              />
            )}

            {/* 이벤트 카드 — startHour 오프셋 + 반복 아이콘 */}
            {positioned.map(({ event, topPx, heightPx, columnIdx, totalColumns }) => {
              const widthPct = 100 / totalColumns;
              const leftPct = columnIdx * widthPct;
              const color = eventColorThemed(event, isDark);
              const adjustedTop = topPx - startHour * HOUR_HEIGHT_PX;
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
                  className="absolute overflow-hidden rounded-[6px] px-2.5 py-1.5 text-left transition-all hover:z-10 hover:brightness-95 hover:shadow-[0_2px_8px_-2px_rgba(0,0,0,0.18)]"
                  style={{
                    top: Math.max(0, adjustedTop),
                    height: heightPx + Math.min(0, adjustedTop),
                    left: `calc(${leftPct}% + 6px)`,
                    width: `calc(${widthPct}% - 12px)`,
                    maxWidth: 540,
                    backgroundColor: toAlpha(color, 0.18),
                    borderLeft: `3px solid ${color}`,
                    color: "var(--color-apple-ink)",
                    letterSpacing: "-0.012em",
                  }}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className="block truncate text-[13px] wght-620 leading-[1.3]">
                      {formatEventLabel(event)}
                    </span>
                    {isRecurring && (
                      <svg
                        aria-hidden
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        className="mt-[2px] shrink-0 opacity-70"
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
                  {heightPx >= 38 && event.endsAt && (
                    <span className="block truncate text-[11px] wght-450 tabular-nums opacity-70">
                      {formatTimeRange(event.startsAt, event.endsAt)}
                    </span>
                  )}
                </button>
              );
            })}

            {/* 현재 시각 라인 — startHour 보정 + 좌측 도트 제거 (시간축에 빨간 박스 있음) */}
            {isToday && nowMin >= startHour * 60 && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 z-20"
                style={{ top: (nowMin / 60 - startHour) * HOUR_HEIGHT_PX }}
              >
                <div className="border-t-[1.5px] border-[var(--color-urgent)]" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

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
