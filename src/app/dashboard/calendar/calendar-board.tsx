"use client";

import { useMemo, useState } from "react";
import type { EventView } from "@/lib/data/events";
import { formatEventLabel, formatEventCompact } from "@/lib/format-event";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

interface MonthCell {
  date: Date;
  iso: string; // YYYY-MM-DD
  inMonth: boolean;
  isToday: boolean;
}

/** 듀얼 뷰 모드 — 시간표(주간 반복 수업)만 보거나, 내 일정(시험·과제·발표·기타)만 보거나, 전체 */
type ViewMode = "all" | "timetable" | "events";

function isClass(e: EventView): boolean {
  return e.kind === "class";
}

function filterByMode(events: EventView[], mode: ViewMode): EventView[] {
  if (mode === "all") return events;
  if (mode === "timetable") return events.filter(isClass);
  return events.filter((e) => !isClass(e));
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
  const [mode, setMode] = useState<ViewMode>("all");

  const cells = useMemo(() => buildMonthCells(view.year, view.month), [view]);
  const monthLabel = `${view.year}년 ${view.month + 1}월`;

  // 카운트는 토글 라벨에 박을 거라 mode 적용 전 원본으로 계산
  const counts = useMemo(() => {
    let cls = 0;
    let ev = 0;
    for (const e of monthEvents) {
      if (isClass(e)) cls++;
      else ev++;
    }
    return { all: monthEvents.length, timetable: cls, events: ev };
  }, [monthEvents]);

  const filteredMonth = useMemo(() => filterByMode(monthEvents, mode), [monthEvents, mode]);
  const filteredUpcoming = useMemo(() => filterByMode(upcoming, mode), [upcoming, mode]);

  // 날짜 → 이벤트 그룹 (mode 적용된 것)
  const byDate = useMemo(() => {
    const map = new Map<string, EventView[]>();
    for (const e of filteredMonth) {
      const key = e.startsAt.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [filteredMonth]);

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

        <ViewModeToggle mode={mode} onChange={setMode} counts={counts} className="mt-4" />

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
            {mode === "timetable"
              ? "이번 주 수업"
              : mode === "events"
                ? "다가오는 일정"
                : "다가오는 일정"}
          </h3>
          {filteredUpcoming.length === 0 ? (
            <p className="mt-3 text-[13px] wght-450 text-[var(--color-apple-muted)]">
              {mode === "timetable"
                ? "등록된 수업이 없어요. 시간표를 올려주세요."
                : "예정된 일정이 없어요."}
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {filteredUpcoming.map((e) => (
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

function ViewModeToggle({
  mode,
  onChange,
  counts,
  className,
}: {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
  counts: { all: number; timetable: number; events: number };
  className?: string;
}) {
  const items: { id: ViewMode; label: string; count: number; hint: string }[] = [
    { id: "all", label: "전체", count: counts.all, hint: "수업 + 시험·과제 다 보기" },
    { id: "timetable", label: "시간표", count: counts.timetable, hint: "주간 반복 수업만" },
    { id: "events", label: "내 일정", count: counts.events, hint: "시험·과제·발표·기타" },
  ];
  return (
    <div
      role="tablist"
      aria-label="캘린더 보기 모드"
      className={`inline-flex items-center gap-1 rounded-full bg-[var(--color-apple-pearl)] p-1 ${className ?? ""}`}
    >
      {items.map((it) => {
        const active = mode === it.id;
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={active}
            title={it.hint}
            onClick={() => onChange(it.id)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] transition-all ${
              active
                ? "wght-620 bg-white text-[var(--color-apple-ink)] shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                : "wght-450 text-[var(--color-apple-muted)] hover:text-[var(--color-apple-ink)]"
            }`}
            style={{ letterSpacing: "-0.012em" }}
          >
            <span>{it.label}</span>
            <span
              className={`text-[10.5px] tabular-nums ${active ? "text-[var(--color-apple-muted)]" : "text-[var(--color-apple-muted)]"}`}
            >
              {it.count}
            </span>
          </button>
        );
      })}
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
      {/* 모바일/아이패드: 색점만 (잘림 없음) */}
      <ul className="flex flex-wrap gap-0.5 sm:hidden">
        {events.slice(0, 4).map((e) => (
          <li
            key={e.id}
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: kindColor(e.kind, e.courseColor) }}
            title={formatEventLabel(e)}
            aria-label={formatEventLabel(e)}
          />
        ))}
        {events.length > 4 && (
          <li className="text-[9px] wght-560 leading-[1.4] text-[var(--color-apple-muted)]">
            +{events.length - 4}
          </li>
        )}
      </ul>

      {/* 데스크톱: 풀 라벨 칩 */}
      <ul className="hidden flex-col gap-0.5 sm:flex">
        {events.slice(0, 3).map((e) => {
          const fullLabel = formatEventLabel(e);
          const shortLabel = formatEventCompact(e);
          return (
            <li
              key={e.id}
              className="truncate rounded-[3px] px-1.5 py-0.5 text-[10.5px] wght-560 leading-[1.4] text-white"
              style={{
                backgroundColor: kindColor(e.kind, e.courseColor),
                letterSpacing: "-0.012em",
              }}
              title={fullLabel}
            >
              {shortLabel}
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
