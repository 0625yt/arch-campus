"use client";

import { useMemo, useState } from "react";
import type { EventView } from "@/lib/data/events";
import { formatEventLabel } from "@/lib/format-event";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

interface MonthCell {
  date: Date;
  iso: string; // YYYY-MM-DD
  inMonth: boolean;
  isToday: boolean;
}

export function CalendarBoard({
  monthEvents,
  upcoming,
  kindLabel,
}: {
  monthEvents: EventView[];
  upcoming: EventView[];
  kindLabel: Record<EventView["kind"], string>;
}) {
  const [view, setView] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const cells = useMemo(() => buildMonthCells(view.year, view.month), [view]);
  const monthLabel = `${view.year}년 ${view.month + 1}월`;

  // 날짜 → 이벤트 그룹
  const byDate = useMemo(() => {
    const map = new Map<string, EventView[]>();
    for (const e of monthEvents) {
      const key = e.startsAt.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [monthEvents]);

  function navigate(delta: number) {
    setView((prev) => {
      const m = prev.month + delta;
      const year = prev.year + Math.floor(m / 12);
      const month = ((m % 12) + 12) % 12;
      return { year, month };
    });
  }

  function goToday() {
    const now = new Date();
    setView({ year: now.getFullYear(), month: now.getMonth() });
  }

  if (monthEvents.length === 0 && upcoming.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px] fade-up fade-up-1">
      <section className="rounded-[18px] bg-white p-5 sm:p-7">
        <div className="flex items-baseline justify-between gap-3">
          <h2
            className="text-[20px] wght-620 text-[var(--color-apple-ink)] sm:text-[22px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {monthLabel}
          </h2>
          <div className="flex items-center gap-1">
            <NavButton onClick={() => navigate(-1)} aria-label="이전 달">
              ‹
            </NavButton>
            <button
              type="button"
              onClick={goToday}
              className="rounded-full px-3 py-1 text-[12px] wght-560 text-[var(--color-apple-action)] hover:bg-[var(--color-apple-pearl)]"
            >
              오늘
            </button>
            <NavButton onClick={() => navigate(1)} aria-label="다음 달">
              ›
            </NavButton>
          </div>
        </div>

        <ul className="mt-4 grid grid-cols-7 gap-px text-center text-[10.5px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
          {WEEKDAYS.map((d) => (
            <li key={d} className="py-1.5">
              {d}
            </li>
          ))}
        </ul>

        <div className="mt-1 grid grid-cols-7 gap-px overflow-hidden rounded-[10px] bg-[var(--color-apple-hairline)]">
          {cells.map((cell) => {
            const dayEvents = byDate.get(cell.iso) ?? [];
            return (
              <DayCell key={cell.iso} cell={cell} events={dayEvents} kindLabel={kindLabel} />
            );
          })}
        </div>
      </section>

      <aside className="flex flex-col gap-4">
        <section className="rounded-[14px] bg-white p-5">
          <h3 className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
            다가오는 일정
          </h3>
          {upcoming.length === 0 ? (
            <p className="mt-3 text-[13px] wght-450 text-[var(--color-apple-muted)]">
              예정된 일정이 없어요.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {upcoming.map((e) => (
                <li key={e.id}>
                  <UpcomingRow event={e} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}

function NavButton({
  children,
  onClick,
  ...rest
}: {
  children: React.ReactNode;
  onClick: () => void;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      {...rest}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[15px] text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]"
    >
      {children}
    </button>
  );
}

function DayCell({
  cell,
  events,
  kindLabel,
}: {
  cell: MonthCell;
  events: EventView[];
  kindLabel: Record<EventView["kind"], string>;
}) {
  return (
    <div
      className={`flex min-h-[88px] flex-col gap-1 bg-white p-1.5 sm:min-h-[110px] sm:p-2 ${
        cell.inMonth ? "" : "opacity-40"
      }`}
    >
      <span
        className={`self-end text-[11px] wght-450 tabular-nums ${
          cell.isToday
            ? "rounded-full bg-[var(--color-apple-action)] px-1.5 py-0.5 text-white"
            : "text-[var(--color-apple-muted)]"
        }`}
      >
        {cell.date.getDate()}
      </span>
      <ul className="flex flex-col gap-0.5">
        {events.slice(0, 3).map((e) => {
          const label = formatEventLabel(e);
          return (
            <li
              key={e.id}
              className="truncate rounded-[3px] px-1.5 py-0.5 text-[10.5px] wght-560 leading-[1.4] text-white"
              style={{
                backgroundColor: kindColor(e.kind, e.courseColor),
                letterSpacing: "-0.012em",
              }}
              title={label}
            >
              {label}
            </li>
          );
        })}
        {events.length > 3 && (
          <li className="truncate text-[10px] wght-560 text-[var(--color-apple-muted)]">
            + {events.length - 3}개
          </li>
        )}
      </ul>
    </div>
  );
}

function UpcomingRow({ event }: { event: EventView }) {
  const date = new Date(event.startsAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((date.getTime() - today.getTime()) / 86400000);
  const dDayLabel = days === 0 ? "오늘" : days < 0 ? `D+${-days}` : `D-${days}`;
  const tone = days <= 1 ? "urgent" : days <= 3 ? "warn" : "muted";
  const label = formatEventLabel(event);

  return (
    <div className="flex items-baseline gap-3">
      <span
        className={`shrink-0 tabular-nums text-[11px] wght-700 ${
          tone === "urgent"
            ? "text-[var(--color-urgent)]"
            : tone === "warn"
              ? "text-[var(--color-apple-action)]"
              : "text-[var(--color-apple-muted)]"
        }`}
      >
        {dDayLabel}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <p
          className="truncate text-[13px] wght-560 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {label}
        </p>
        <p className="flex items-center gap-1.5 text-[11px] wght-450 tabular-nums text-[var(--color-apple-muted)]">
          {event.courseColor && (
            <span
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: kindColor(event.kind, event.courseColor) }}
            />
          )}
          {formatDate(date, event.allDay)}
          {event.weightPercent != null && ` · ${event.weightPercent}%`}
        </p>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-12 rounded-[18px] bg-white px-7 py-16 text-center fade-up fade-up-1 sm:py-20">
      <p
        className="text-[20px] wght-620 text-[var(--color-apple-ink)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        아직 일정이 없어요
      </p>
      <p className="mx-auto mt-3 max-w-[420px] text-[14px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]">
        시간표·강의계획서를 올리면 강의·시험·과제·발표 일정이 자동으로 캘린더에 박혀요.
      </p>
      <a
        href="/dashboard/calendar/import"
        className="mt-7 inline-flex h-[44px] items-center rounded-full bg-[var(--color-apple-action)] px-6 text-[14px] wght-560 text-white transition-all hover:bg-[var(--color-apple-action-hover)]"
      >
        학교 자료 등록 →
      </a>
    </div>
  );
}

function buildMonthCells(year: number, month: number): MonthCell[] {
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const start = new Date(year, month, 1 - startWeekday);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = isoDate(d);
    cells.push({
      date: d,
      iso,
      inMonth: d.getMonth() === month,
      isToday: d.getTime() === today.getTime(),
    });
  }
  return cells;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDate(d: Date, allDay: boolean): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  if (allDay) return `${m}/${day}`;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${m}/${day} ${hh}:${mm}`;
}

const KIND_FALLBACK_COLOR: Record<EventView["kind"], string> = {
  exam: "#ff6b7d",
  assignment: "#3b82ff",
  presentation: "#a08bc4",
  class: "#7aa6d6",
  etc: "#7fb38c",
};

function kindColor(kind: EventView["kind"], courseColor: string | null): string {
  if (courseColor) return courseColor;
  return KIND_FALLBACK_COLOR[kind];
}
