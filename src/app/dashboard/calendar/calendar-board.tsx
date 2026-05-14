"use client";

import Link from "next/link";
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
  const [selected, setSelected] = useState<EventView | null>(null);

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
      <section className="elev-1 rounded-[18px] bg-white p-5 sm:p-7">
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
              <DayCell
                key={cell.iso}
                cell={cell}
                events={dayEvents}
                kindLabel={kindLabel}
                onSelectEvent={setSelected}
              />
            );
          })}
        </div>
      </section>

      <aside className="flex flex-col gap-4">
        {selected ? (
          <EventDetailPanel
            event={selected}
            kindLabel={kindLabel}
            onClose={() => setSelected(null)}
          />
        ) : (
          <section className="elev-1 rounded-[14px] bg-white p-5">
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
              <ul className="mt-3 flex flex-col gap-1">
                {filteredUpcoming.map((e) => (
                  <li key={e.id}>
                    <UpcomingRow event={e} onSelect={() => setSelected(e)} />
                  </li>
                ))}
              </ul>
            )}
            <p
              className="mt-4 text-[10.5px] wght-450 text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              일정을 누르면 자세한 내용이 여기에 떠요.
            </p>
          </section>
        )}
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
  onSelectEvent,
}: {
  cell: MonthCell;
  events: EventView[];
  kindLabel: Record<EventView["kind"], string>;
  onSelectEvent?: (e: EventView) => void;
}) {
  void kindLabel;
  return (
    <div
      className={`flex min-h-[88px] flex-col gap-1 p-1.5 transition-colors sm:min-h-[110px] sm:p-2 ${
        cell.inMonth ? "" : "opacity-40"
      }`}
      style={{
        // 오늘 셀은 종이 위에 살짝 따뜻한 톤. 다른 날은 흰색.
        backgroundColor: cell.isToday ? "var(--color-surface-cream)" : "#ffffff",
      }}
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
      {/* 모바일/아이패드: 색점만 (잘림 없음). 점 → 상세 패널 */}
      <ul className="flex flex-wrap gap-0.5 sm:hidden">
        {events.slice(0, 4).map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => onSelectEvent?.(e)}
              className="block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: kindColor(e.kind, e.courseColor) }}
              title={formatEventLabel(e)}
              aria-label={formatEventLabel(e)}
            />
          </li>
        ))}
        {events.length > 4 && (
          <li className="text-[9px] wght-560 leading-[1.4] text-[var(--color-apple-muted)]">
            +{events.length - 4}
          </li>
        )}
      </ul>

      {/* 데스크톱: 풀 라벨 칩 — 파스텔 배경 + 검정(ink) 텍스트.
          좌측 동그라미 점은 색칩 배경이 이미 kind를 알려주므로 제거. */}
      <ul className="hidden flex-col gap-0.5 sm:flex">
        {events.slice(0, 3).map((e) => {
          const fullLabel = formatEventLabel(e);
          const shortLabel = formatEventCompact(e);
          const tint = kindTint(e.kind);
          return (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onSelectEvent?.(e)}
                className="block w-full truncate rounded-[4px] px-1.5 py-0.5 text-left text-[10.5px] wght-560 leading-[1.4] text-[var(--color-apple-ink)] transition-colors hover:brightness-95"
                style={{
                  backgroundColor: tint.bg,
                  letterSpacing: "-0.012em",
                }}
                title={fullLabel}
              >
                {shortLabel}
              </button>
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

function UpcomingRow({ event, onSelect }: { event: EventView; onSelect?: () => void }) {
  const date = new Date(event.startsAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((date.getTime() - today.getTime()) / 86400000);
  const dDayLabel = days === 0 ? "오늘" : days < 0 ? `D+${-days}` : `D-${days}`;
  const tone = days <= 1 ? "urgent" : days <= 3 ? "warn" : "muted";
  const label = formatEventLabel(event);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-baseline gap-3 rounded-[8px] px-2 py-1.5 text-left transition-colors hover:bg-[var(--color-apple-pearl)]"
    >
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
        <p className="text-[11px] wght-450 tabular-nums text-[var(--color-apple-muted)]">
          {formatDate(date, event.allDay)}
          {event.weightPercent != null && ` · ${event.weightPercent}%`}
        </p>
      </div>
    </button>
  );
}

/**
 * 일정 상세 패널 — 캘린더 우측에 sticky로 머무르며 선택된 일정의 본문을 펼친다.
 * Apple 캘린더 inspector 톤: 큰 제목, 시간, 위치/메모/D-day, 코스 점프 링크.
 */
function EventDetailPanel({
  event,
  kindLabel,
  onClose,
}: {
  event: EventView;
  kindLabel: Record<EventView["kind"], string>;
  onClose: () => void;
}) {
  const date = new Date(event.startsAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const days = Math.round((startOfDay.getTime() - today.getTime()) / 86400000);
  const dDayLabel = days === 0 ? "오늘" : days < 0 ? `D+${-days}` : `D-${days}`;
  const tone = days <= 0 ? "urgent" : days <= 3 ? "warn" : "muted";
  const tint = kindTint(event.kind);
  const dot = kindColor(event.kind, event.courseColor);

  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  const dateLabel = `${date.getMonth() + 1}월 ${date.getDate()}일 ${weekday}요일`;
  const timeLabel = event.allDay
    ? "종일"
    : `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

  const endDate = event.endsAt ? new Date(event.endsAt) : null;
  const endLabel = endDate && !event.allDay
    ? `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`
    : null;

  return (
    <section className="elev-2 sticky top-6 overflow-hidden rounded-[14px] bg-white">
      {/* 컬러 헤더 — kind 톤. Apple Mail 인스펙터처럼 정보 밀도 + 색의 한 호흡 */}
      <div
        className="px-5 pb-4 pt-5"
        style={{ backgroundColor: tint.bg }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: dot }}
            />
            <span
              className="text-[11px] wght-620 uppercase tracking-[0.06em] text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "0.06em" }}
            >
              {kindLabel[event.kind]}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-mr-1 -mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-[14px] text-[var(--color-apple-muted)] transition-colors hover:bg-white hover:text-[var(--color-apple-ink)]"
          >
            ×
          </button>
        </div>
        <h3
          className="mt-3 text-[20px] leading-[1.2] wght-620 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {formatEventLabel(event)}
        </h3>
      </div>

      <div className="flex flex-col gap-4 px-5 py-5">
        <DetailRow label="언제">
          <span className="text-[13px] wght-560 text-[var(--color-apple-ink)] tabular-nums">
            {dateLabel}
          </span>
          <span className="mt-0.5 text-[12px] wght-450 tabular-nums text-[var(--color-apple-muted)]">
            {timeLabel}
            {endLabel && ` – ${endLabel}`}
          </span>
        </DetailRow>

        <DetailRow label="D-day">
          <span
            className={`text-[13px] wght-700 tabular-nums ${
              tone === "urgent"
                ? "text-[var(--color-urgent)]"
                : tone === "warn"
                  ? "text-[var(--color-apple-action)]"
                  : "text-[var(--color-apple-ink)]"
            }`}
          >
            {dDayLabel}
          </span>
        </DetailRow>

        {event.courseName && (
          <DetailRow label="과목">
            <Link
              href={`/dashboard/study/${encodeURIComponent(event.courseName)}`}
              className="inline-flex items-center gap-1 text-[13px] wght-560 text-[var(--color-apple-action)] hover:underline"
              style={{ letterSpacing: "-0.012em" }}
            >
              {event.courseName} <span aria-hidden>›</span>
            </Link>
          </DetailRow>
        )}

        {event.weightPercent != null && (
          <DetailRow label="비중">
            <span className="text-[13px] wght-560 tabular-nums text-[var(--color-apple-ink)]">
              {event.weightPercent}%
            </span>
          </DetailRow>
        )}

        {event.notes && (
          <DetailRow label="메모">
            <p
              className="whitespace-pre-wrap text-[13px] wght-450 leading-[1.55] text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              {event.notes}
            </p>
          </DetailRow>
        )}

        {event.confidence != null && event.confidence < 0.8 && !event.confirmed && (
          <p
            className="rounded-[8px] bg-[var(--color-tint-streak)] px-3 py-2 text-[11.5px] wght-560 text-[var(--color-tint-streak-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            AI 추정 일정이에요. 한번 확인해주세요.
          </p>
        )}
      </div>
    </section>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className="text-[10px] wght-620 uppercase text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "0.08em" }}
      >
        {label}
      </span>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="elev-1 mt-12 rounded-[18px] bg-white px-7 py-16 text-center fade-up fade-up-1 sm:py-20">
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

/**
 * 색 점·코스 컬러 fallback — courseColor가 우선, 없으면 kind 기준 채도 낮은 컬러.
 * (칩 배경은 따로 kindTint에서 파스텔로 처리)
 */
const KIND_FALLBACK_COLOR: Record<EventView["kind"], string> = {
  exam: "#e0445e",       // coral
  assignment: "#cca06b", // mustard
  presentation: "#7aa6d6", // cobalt
  class: "#7fb38c",      // sage
  etc: "#a08bc4",        // mauve
};

function kindColor(kind: EventView["kind"], courseColor: string | null): string {
  if (courseColor) return courseColor;
  return KIND_FALLBACK_COLOR[kind];
}

/**
 * 캘린더 칩·뱃지용 파스텔 배경 + 컬러 텍스트.
 * Apple Calendar 톤: 진한 면 X, 종이 위 연한 칩 + 같은 hue 텍스트.
 */
interface KindTint {
  bg: string;
  fg: string;
}

const KIND_TINT: Record<EventView["kind"], KindTint> = {
  exam: { bg: "var(--color-tint-exam)", fg: "var(--color-tint-exam-ink)" },
  assignment: { bg: "var(--color-tint-assign)", fg: "var(--color-tint-assign-ink)" },
  presentation: { bg: "var(--color-tint-prez)", fg: "var(--color-tint-prez-ink)" },
  class: { bg: "var(--color-tint-class)", fg: "var(--color-tint-class-ink)" },
  etc: { bg: "var(--color-tint-etc)", fg: "var(--color-tint-etc-ink)" },
};

function kindTint(kind: EventView["kind"]): KindTint {
  return KIND_TINT[kind];
}
