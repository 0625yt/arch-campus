"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ContextMenu, useContextMenu, type ContextMenuItem } from "@/components/context-menu";
import { Modal } from "@/components/modal";
import type { EventView } from "@/lib/data/events";
import { formatEventLabel, formatEventCompact } from "@/lib/format-event";

/**
 * datetime-local input 값("2026-05-15T14:30")을 항상 KST(UTC+9)로 해석해서 ISO 반환.
 *
 * 이유: `new Date("2026-05-15T14:30")` 동작이 환경마다 다를 수 있고(historically UTC, modern은 로컬),
 * 또 사용자가 UTC 클라이언트(VPN·외국 거주)로 접속해도 시간표 입력은 한국 시간 기준이어야 자연스럽다.
 * 명시적으로 KST 해석하면 환경 독립적이고 서버 비교 로직(KST 기준)과도 일관.
 */
function localInputToKstIso(local: string): string {
  // local = "2026-05-15T14:30" 또는 "2026-05-15T14:30:00"
  const [datePart, timePart] = local.split("T");
  if (!datePart || !timePart) return new Date(local).toISOString(); // fallback
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi] = timePart.split(":").map(Number);
  // KST 시각 = UTC+9 → UTC ms = Date.UTC(...) - 9h
  const utcMs = Date.UTC(y, mo - 1, d, h, mi, 0) - 9 * 60 * 60 * 1000;
  return new Date(utcMs).toISOString();
}

/**
 * ISO datetime을 datetime-local input 값으로 (KST 시각으로 표시).
 */
function isoToKstLocalInput(iso: string): string {
  const ms = new Date(iso).getTime() + 9 * 60 * 60 * 1000;
  const kst = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}T${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`;
}

export interface CourseOption {
  id: string;
  name: string;
  color: string | null;
}

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
  courses,
}: {
  monthEvents: EventView[];
  upcoming: EventView[];
  kindLabel: Record<EventView["kind"], string>;
  courses: CourseOption[];
}) {
  const router = useRouter();
  const [view, setView] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [mode, setMode] = useState<ViewMode>("all");
  const [selected, setSelected] = useState<EventView | null>(null);
  const [creating, setCreating] = useState(false);
  // 날짜 셀 클릭 시 그 날의 일정을 우측에 모아 봄. 일정 클릭이 우선이면 selected가 덮어씀.
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // 새 일정 추가 시 prefill할 날짜 (YYYY-MM-DD). null이면 기본 오늘.
  const [createPrefillDate, setCreatePrefillDate] = useState<string | null>(null);

  // 서버 props를 내부 state로 미러링 — optimistic 제거/수정 즉시 반영하기 위함.
  // 서버에서 새 props 도착 시(router.refresh 등) sync.
  const [monthState, setMonthState] = useState(monthEvents);
  const [upcomingState, setUpcomingState] = useState(upcoming);
  useEffect(() => setMonthState(monthEvents), [monthEvents]);
  useEffect(() => setUpcomingState(upcoming), [upcoming]);

  // 우클릭/long-press 컨텍스트 메뉴 — 칩이든 inspector든 어디서든 열 수 있게
  // board 레벨에 한 개의 state로 모음. 메뉴 항목은 ctxEvent로 동적 생성.
  const ctx = useContextMenu();
  const [ctxEvent, setCtxEvent] = useState<EventView | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  function openMenuFor(e: EventView) {
    setCtxEvent(e);
  }

  /** 클라 state에서 즉시 제거 — 서버 응답 도착 전 화면 갱신용. */
  function removeFromState(predicate: (e: EventView) => boolean) {
    setMonthState((prev) => prev.filter((e) => !predicate(e)));
    setUpcomingState((prev) => prev.filter((e) => !predicate(e)));
  }

  /** 클라 state에서 부분 수정 즉시 반영. */
  function patchInState(id: string, patch: Partial<EventView>) {
    setMonthState((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    setUpcomingState((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  async function quickDelete(ev: EventView, scope: "this" | "all") {
    // 옵티미스틱: 같은 강의·요일·시·분의 모든 회차를 미리 제거 (UTC 아닌 KST 기준)
    const targetIds = new Set<string>([ev.id]);
    if (scope === "all" && ev.kind === "class" && ev.courseId) {
      const evDate = new Date(ev.startsAt);
      const evKst = new Date(evDate.getTime() + 9 * 60 * 60 * 1000);
      for (const other of monthState) {
        if (other.id === ev.id) continue;
        if (other.kind !== "class" || other.courseId !== ev.courseId) continue;
        const otherKst = new Date(new Date(other.startsAt).getTime() + 9 * 60 * 60 * 1000);
        if (
          otherKst.getUTCDay() === evKst.getUTCDay() &&
          otherKst.getUTCHours() === evKst.getUTCHours() &&
          otherKst.getUTCMinutes() === evKst.getUTCMinutes()
        ) {
          targetIds.add(other.id);
        }
      }
    }
    const snapshotMonth = monthState;
    const snapshotUpcoming = upcomingState;
    removeFromState((e) => targetIds.has(e.id));
    if (selected && targetIds.has(selected.id)) setSelected(null);

    const res = await fetch(`/api/events/${ev.id}?scope=${scope}`, { method: "DELETE" });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      // 롤백
      setMonthState(snapshotMonth);
      setUpcomingState(snapshotUpcoming);
      alert(json?.error ?? "삭제 실패");
      return;
    }
    router.refresh();
  }

  // 우클릭 대상이 일정인지(ctxEvent), 빈 셀인지(ctxDateIso)에 따라 메뉴 항목 달라짐
  const [ctxDateIso, setCtxDateIso] = useState<string | null>(null);

  const ctxItems: ContextMenuItem[] = ctxEvent
    ? (() => {
        const recurring = ctxEvent.kind === "class" && !!ctxEvent.courseId;
        const items: ContextMenuItem[] = [
          { label: "수정", onClick: () => setSelected(ctxEvent) },
          { label: "삭제", destructive: true, onClick: () => quickDelete(ctxEvent, "this") },
        ];
        if (recurring) {
          items.push({
            label: "학기 전체 회차 삭제",
            destructive: true,
            onClick: () => setConfirmDeleteAll(true),
          });
        }
        return items;
      })()
    : ctxDateIso
      ? [
          {
            label: "이 날에 일정 추가",
            onClick: () => {
              setCreatePrefillDate(ctxDateIso);
              setCreating(true);
            },
          },
          {
            label: "이 날 일정 보기",
            onClick: () => {
              setSelectedDate(ctxDateIso);
              setSelected(null);
            },
          },
        ]
      : [];

  const cells = useMemo(() => buildMonthCells(view.year, view.month), [view]);
  const monthLabel = `${view.year}년 ${view.month + 1}월`;

  // 카운트는 토글 라벨에 박을 거라 mode 적용 전 원본으로 계산
  const counts = useMemo(() => {
    let cls = 0;
    let ev = 0;
    for (const e of monthState) {
      if (isClass(e)) cls++;
      else ev++;
    }
    return { all: monthState.length, timetable: cls, events: ev };
  }, [monthState]);

  const filteredMonth = useMemo(() => filterByMode(monthState, mode), [monthState, mode]);
  const filteredUpcoming = useMemo(() => filterByMode(upcomingState, mode), [upcomingState, mode]);

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
    <div className="mt-8 grid gap-6 md:grid-cols-[1fr_280px] lg:grid-cols-[1fr_320px] fade-up fade-up-1">
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
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="ml-1 inline-flex h-8 items-center gap-1 rounded-full bg-[var(--color-apple-ink)] px-3 text-[12px] wght-560 text-white transition-opacity hover:opacity-90"
              style={{ letterSpacing: "-0.012em" }}
            >
              <span aria-hidden>+</span>
              <span className="hidden sm:inline">새 일정</span>
            </button>
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
            const isSelectedDay = selectedDate === cell.iso;
            return (
              <DayCell
                key={cell.iso}
                cell={cell}
                events={dayEvents}
                kindLabel={kindLabel}
                isSelected={isSelectedDay}
                onSelectDay={() => {
                  setSelectedDate(cell.iso);
                  setSelected(null);
                }}
                onSelectEvent={(e) => {
                  setSelected(e);
                  setSelectedDate(null);
                }}
                onContextDay={(pos) => {
                  setCtxEvent(null);
                  setCtxDateIso(cell.iso);
                  ctx.bind.onContextMenu({
                    preventDefault: () => {},
                    stopPropagation: () => {},
                    clientX: pos.x,
                    clientY: pos.y,
                  } as unknown as React.MouseEvent);
                }}
                onContextEvent={(e, pos) => {
                  setCtxDateIso(null);
                  openMenuFor(e);
                  ctx.bind.onContextMenu({
                    preventDefault: () => {},
                    stopPropagation: () => {},
                    clientX: pos.x,
                    clientY: pos.y,
                  } as unknown as React.MouseEvent);
                }}
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
            onDelete={(scope) => quickDelete(selected, scope)}
            onPatched={(patch) => {
              patchInState(selected.id, patch);
              setSelected({ ...selected, ...patch });
              router.refresh();
            }}
          />
        ) : selectedDate ? (
          <DayDetailPanel
            dateIso={selectedDate}
            events={byDate.get(selectedDate) ?? []}
            kindLabel={kindLabel}
            onClose={() => setSelectedDate(null)}
            onSelectEvent={(e) => setSelected(e)}
            onAddOnDay={() => {
              setCreatePrefillDate(selectedDate);
              setCreating(true);
            }}
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
                    <UpcomingRow
                      event={e}
                      onSelect={() => setSelected(e)}
                      onContextEvent={(ev, pos) => {
                        openMenuFor(ev);
                        ctx.bind.onContextMenu({
                          preventDefault: () => {},
                          stopPropagation: () => {},
                          clientX: pos.x,
                          clientY: pos.y,
                        } as unknown as React.MouseEvent);
                      }}
                    />
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

      <EventCreateForm
        open={creating}
        courses={courses}
        prefillDateIso={createPrefillDate}
        onClose={() => {
          setCreating(false);
          setCreatePrefillDate(null);
        }}
        onCreated={() => {
          setCreating(false);
          setCreatePrefillDate(null);
          router.refresh();
        }}
      />

      <ContextMenu
        state={ctx.state}
        onClose={() => {
          ctx.close();
          setCtxEvent(null);
        }}
        items={ctxItems}
      />

      <ConfirmDialog
        open={confirmDeleteAll}
        title="학기 전체 회차 삭제"
        description={
          ctxEvent
            ? `"${formatEventLabel(ctxEvent)}"\n\n같은 요일·시간의 모든 회차가 삭제돼요. 되돌릴 수 없어요.`
            : ""
        }
        confirmLabel="학기 전체 삭제"
        destructive
        onConfirm={async () => {
          if (!ctxEvent) return;
          await quickDelete(ctxEvent, "all");
          setConfirmDeleteAll(false);
        }}
        onClose={() => setConfirmDeleteAll(false)}
      />
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
  isSelected,
  onSelectDay,
  onSelectEvent,
  onContextDay,
  onContextEvent,
}: {
  cell: MonthCell;
  events: EventView[];
  kindLabel: Record<EventView["kind"], string>;
  isSelected?: boolean;
  /** 셀 빈 영역 클릭 — 그 날 일정 모음 패널 열기 */
  onSelectDay?: () => void;
  onSelectEvent?: (e: EventView) => void;
  /** 셀 빈 영역 우클릭 — "이 날에 일정 추가" 메뉴 */
  onContextDay?: (pos: { x: number; y: number }) => void;
  /** 일정 칩 우클릭 — 이벤트별 메뉴 */
  onContextEvent?: (e: EventView, pos: { x: number; y: number }) => void;
}) {
  void kindLabel;

  function handleDayClick(e: React.MouseEvent) {
    // 칩 클릭은 이벤트 자체에서 stopPropagation으로 막아둠. 빈 영역만 도달.
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).closest("[data-day-bg]")) {
      return;
    }
    onSelectDay?.();
  }

  function handleDayContext(e: React.MouseEvent) {
    // 칩에서 발생한 우클릭은 ChipButton이 stopPropagation으로 막음. 빈 영역만 통과.
    e.preventDefault();
    e.stopPropagation();
    onContextDay?.({ x: e.clientX, y: e.clientY });
  }

  return (
    <div
      data-day-bg
      onClick={handleDayClick}
      onContextMenu={handleDayContext}
      className={`flex min-h-[88px] cursor-pointer flex-col gap-1 p-1.5 transition-colors sm:min-h-[110px] sm:p-2 ${
        cell.inMonth ? "" : "opacity-40"
      } ${isSelected ? "ring-1 ring-inset ring-[var(--color-apple-action)]" : ""}`}
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
            <ChipButton
              event={e}
              onClick={() => onSelectEvent?.(e)}
              onContext={(pos) => onContextEvent?.(e, pos)}
              className="block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: kindColor(e.kind, e.courseColor) }}
              title={formatEventLabel(e)}
              ariaLabel={formatEventLabel(e)}
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
              <ChipButton
                event={e}
                onClick={() => onSelectEvent?.(e)}
                onContext={(pos) => onContextEvent?.(e, pos)}
                className="block w-full truncate rounded-[4px] px-1.5 py-0.5 text-left text-[10.5px] wght-560 leading-[1.4] text-[var(--color-apple-ink)] transition-colors hover:brightness-95"
                style={{
                  backgroundColor: tint.bg,
                  letterSpacing: "-0.012em",
                }}
                title={fullLabel}
              >
                {shortLabel}
              </ChipButton>
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

/**
 * 캘린더 칩 공통 — onClick(좌클릭)·onContext(우클릭/long-press) 둘 다.
 * 부모(board)가 받은 좌표로 ContextMenu 위치 잡음.
 */
function ChipButton({
  event,
  onClick,
  onContext,
  className,
  style,
  title,
  ariaLabel,
  children,
}: {
  event: EventView;
  onClick: () => void;
  onContext?: (pos: { x: number; y: number }) => void;
  className: string;
  style?: React.CSSProperties;
  title?: string;
  ariaLabel?: string;
  children?: React.ReactNode;
}) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  void event;

  function handleContext(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onContext?.({ x: e.clientX, y: e.clientY });
  }

  function handleTouchStart(e: React.TouchEvent) {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    const t = e.touches[0];
    if (!t) return;
    const x = t.clientX;
    const y = t.clientY;
    longPressTimer.current = setTimeout(() => {
      try {
        navigator.vibrate?.(8);
      } catch {
        /* noop */
      }
      onContext?.({ x, y });
      longPressTimer.current = null;
    }, 500);
  }
  function handleTouchEnd() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={handleContext}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
      className={className}
      style={style}
      title={title}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}

function UpcomingRow({
  event,
  onSelect,
  onContextEvent,
}: {
  event: EventView;
  onSelect?: () => void;
  onContextEvent?: (e: EventView, pos: { x: number; y: number }) => void;
}) {
  const date = new Date(event.startsAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((date.getTime() - today.getTime()) / 86400000);
  const dDayLabel = days === 0 ? "오늘" : days < 0 ? `D+${-days}` : `D-${days}`;
  const tone = days <= 1 ? "urgent" : days <= 3 ? "warn" : "muted";
  const label = formatEventLabel(event);

  function handleContext(e: React.MouseEvent) {
    if (!onContextEvent) return;
    e.preventDefault();
    e.stopPropagation();
    onContextEvent(event, { x: e.clientX, y: e.clientY });
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      onContextMenu={handleContext}
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
  onDelete,
  onPatched,
}: {
  event: EventView;
  kindLabel: Record<EventView["kind"], string>;
  onClose: () => void;
  onDelete: (scope: "this" | "all") => Promise<void> | void;
  onPatched: (patch: Partial<EventView>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteScope, setDeleteScope] = useState<"this" | "all">("this");
  // class kind는 같은 강의·같은 요일·시간 = 매주 반복 수업. scope 묻기.
  const isRecurringClass = event.kind === "class" && !!event.courseId;

  if (editing) {
    return (
      <EventEditForm
        event={event}
        isRecurringClass={isRecurringClass}
        onCancel={() => setEditing(false)}
        onSaved={(patch) => {
          setEditing(false);
          onPatched(patch);
        }}
      />
    );
  }

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

  async function runDelete() {
    const scope = isRecurringClass ? deleteScope : "this";
    setConfirmDelete(false);
    await onDelete(scope);
  }

  return (
    <>
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

          <div className="mt-1 flex justify-end gap-1.5 border-t border-[var(--color-apple-hairline)] pt-4">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-[8px] px-3 py-1.5 text-[12.5px] wght-560 text-[var(--color-apple-ink)] transition-colors hover:bg-[var(--color-apple-pearl)]"
            >
              수정
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteScope("this");
                setConfirmDelete(true);
              }}
              className="rounded-[8px] px-3 py-1.5 text-[12.5px] wght-560 text-[var(--color-urgent)] transition-colors hover:bg-[var(--color-urgent)]/10"
            >
              삭제
            </button>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title={isRecurringClass ? "수업 일정 삭제" : "일정 삭제"}
        description={
          isRecurringClass
            ? `"${formatEventLabel(event)}"\n\n매주 반복되는 수업이에요. 어디까지 지울까요?`
            : `"${formatEventLabel(event)}"\n\n이 일정을 지울까요? 되돌릴 수 없어요.`
        }
        confirmLabel={
          isRecurringClass
            ? deleteScope === "all"
              ? "학기 전체 회차 삭제"
              : "이 회차만 삭제"
            : "삭제"
        }
        destructive
        onConfirm={runDelete}
        onClose={() => setConfirmDelete(false)}
      >
        {isRecurringClass && (
          <div className="flex flex-col gap-1.5">
            <span
              className="text-[10px] wght-620 uppercase text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "0.08em" }}
            >
              적용 범위
            </span>
            <div className="flex gap-1.5">
              <ScopeBtn label="이 회차만" active={deleteScope === "this"} onClick={() => setDeleteScope("this")} />
              <ScopeBtn label="학기 전체" active={deleteScope === "all"} onClick={() => setDeleteScope("all")} />
            </div>
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}

/**
 * 특정 날짜의 모든 일정을 한 번에 보는 패널.
 * - 날짜 셀 좌클릭 시 열림
 * - 일정 클릭 → EventDetailPanel로 전환 (부모 onSelectEvent)
 * - "이 날에 일정 추가" CTA → EventCreateForm prefill
 */
function DayDetailPanel({
  dateIso,
  events,
  kindLabel,
  onClose,
  onSelectEvent,
  onAddOnDay,
}: {
  dateIso: string;
  events: EventView[];
  kindLabel: Record<EventView["kind"], string>;
  onClose: () => void;
  onSelectEvent: (e: EventView) => void;
  onAddOnDay: () => void;
}) {
  // dateIso는 "YYYY-MM-DD". 헤더에 한국어 라벨 표시 — KST 기준 그대로 파싱.
  const [y, m, d] = dateIso.split("-").map(Number);
  const localDate = new Date(y, m - 1, d);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][localDate.getDay()];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((localDate.getTime() - today.getTime()) / 86400000);
  const dDayLabel = days === 0 ? "오늘" : days < 0 ? `D+${-days}` : `D-${days}`;

  // 시간순 정렬
  const sorted = [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return (
    <section className="elev-2 sticky top-6 overflow-hidden rounded-[14px] bg-white">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--color-apple-hairline)] px-5 py-4">
        <div>
          <p
            className="text-[10.5px] wght-620 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "0.06em" }}
          >
            {dDayLabel}
          </p>
          <h3
            className="mt-1 text-[18px] leading-[1.2] wght-620 text-[var(--color-apple-ink)] tabular-nums"
            style={{ letterSpacing: "-0.012em" }}
          >
            {y}년 {m}월 {d}일 {weekday}요일
          </h3>
          <p className="mt-0.5 text-[12px] wght-450 text-[var(--color-apple-muted)]">
            {sorted.length === 0 ? "일정 없음" : `${sorted.length}개 일정`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="-mr-1 -mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[14px] text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]"
        >
          ×
        </button>
      </div>

      <div className="flex flex-col gap-2 px-5 py-4">
        {sorted.length === 0 ? (
          <p className="py-4 text-center text-[12.5px] wght-450 text-[var(--color-apple-muted)]">
            이 날엔 등록된 일정이 없어요.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {sorted.map((e) => {
              const t = new Date(e.startsAt);
              const tlabel = e.allDay
                ? "종일"
                : `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
              const tint = kindTint(e.kind);
              const dot = kindColor(e.kind, e.courseColor);
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => onSelectEvent(e)}
                    className="flex w-full items-baseline gap-3 rounded-[8px] px-2 py-1.5 text-left transition-colors hover:bg-[var(--color-apple-pearl)]"
                  >
                    <span
                      className="shrink-0 tabular-nums text-[11px] wght-560 text-[var(--color-apple-muted)]"
                    >
                      {tlabel}
                    </span>
                    <span
                      aria-hidden
                      className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: dot }}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className="block truncate text-[13px] wght-560 text-[var(--color-apple-ink)]"
                        style={{ letterSpacing: "-0.012em" }}
                      >
                        {formatEventLabel(e)}
                      </span>
                      <span
                        className="text-[10.5px] wght-450 uppercase tracking-[0.04em]"
                        style={{ color: tint.fg }}
                      >
                        {kindLabel[e.kind]}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <button
          type="button"
          onClick={onAddOnDay}
          className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-[8px] border border-dashed border-[var(--color-apple-hairline)] px-3 py-2 text-[12.5px] wght-560 text-[var(--color-apple-action)] transition-colors hover:border-[var(--color-apple-action)] hover:bg-[var(--color-apple-pearl)]"
        >
          <span aria-hidden>+</span>
          이 날에 일정 추가
        </button>
      </div>
    </section>
  );
}

function ScopeBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-[7px] bg-[var(--color-apple-ink)] px-2.5 py-1 text-[11.5px] wght-560 text-white"
          : "rounded-[7px] px-2.5 py-1 text-[11.5px] wght-560 text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]"
      }
    >
      {label}
    </button>
  );
}

/**
 * 인라인 편집 폼 — 패널 자리 그대로 차지. 시·분·제목·메모·(class면) scope.
 * 시간만 수정해도 starts/ends 같이 보냄 (서버는 받은 것만 적용).
 */
function EventEditForm({
  event,
  isRecurringClass,
  onCancel,
  onSaved,
}: {
  event: EventView;
  isRecurringClass: boolean;
  onCancel: () => void;
  onSaved: (patch: Partial<EventView>) => void;
}) {
  const [title, setTitle] = useState(event.title);
  const [startsAt, setStartsAt] = useState(isoToKstLocalInput(event.startsAt));
  const [endsAt, setEndsAt] = useState(event.endsAt ? isoToKstLocalInput(event.endsAt) : "");
  const [notes, setNotes] = useState(event.notes ?? "");
  const [scope, setScope] = useState<"this" | "all">("this");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);

    try {
      const body: Record<string, unknown> = { scope };
      if (title.trim() !== event.title) body.title = title.trim();
      if (notes.trim() !== (event.notes ?? "")) {
        body.notes = notes.trim() || null;
      }
      // KST로 명시 해석 — 환경 독립 + 서버 매칭과 일관
      const newStartIso = localInputToKstIso(startsAt);
      if (newStartIso !== event.startsAt) {
        body.starts_at = newStartIso;
      }
      if (endsAt) {
        const newEndIso = localInputToKstIso(endsAt);
        if (newEndIso !== event.endsAt) {
          body.ends_at = newEndIso;
        }
      } else if (event.endsAt) {
        body.ends_at = null;
      }

      // 변경된 게 scope밖에 없으면 의미 없음
      if (Object.keys(body).length <= 1) {
        onCancel();
        return;
      }

      const res = await fetch(`/api/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "수정 실패");
        return;
      }
      // 옵티미스틱 patch — 부모가 즉시 UI 반영
      const patch: Partial<EventView> = {};
      if (typeof body.title === "string") patch.title = body.title;
      if (body.notes !== undefined) patch.notes = body.notes as string | null;
      if (typeof body.starts_at === "string") patch.startsAt = body.starts_at;
      if (body.ends_at !== undefined) patch.endsAt = body.ends_at as string | null;
      onSaved(patch);
    } catch (e) {
      setError(e instanceof Error ? e.message : "수정 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="elev-2 sticky top-6 overflow-hidden rounded-[14px] bg-white">
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--color-apple-hairline)] px-5 py-4">
        <h3
          className="text-[15px] wght-700 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          일정 수정
        </h3>
        <button
          type="button"
          onClick={onCancel}
          aria-label="닫기"
          className="-mr-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-[13px] text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]"
        >
          ×
        </button>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-4 px-5 py-5">
        <FieldLabel label="제목">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={120}
            className="w-full rounded-[8px] border border-[var(--color-apple-hairline)] bg-white px-3 py-2 text-[13px] wght-560 text-[var(--color-apple-ink)] focus:border-[var(--color-apple-action)] focus:outline-none"
          />
        </FieldLabel>

        <FieldLabel label="시작">
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            required
            className="w-full rounded-[8px] border border-[var(--color-apple-hairline)] bg-white px-3 py-2 text-[13px] tabular-nums text-[var(--color-apple-ink)] focus:border-[var(--color-apple-action)] focus:outline-none"
          />
        </FieldLabel>

        <FieldLabel label="종료">
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="w-full rounded-[8px] border border-[var(--color-apple-hairline)] bg-white px-3 py-2 text-[13px] tabular-nums text-[var(--color-apple-ink)] focus:border-[var(--color-apple-action)] focus:outline-none"
          />
        </FieldLabel>

        <FieldLabel label="메모">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={2000}
            className="w-full resize-y rounded-[8px] border border-[var(--color-apple-hairline)] bg-white px-3 py-2 text-[13px] wght-450 text-[var(--color-apple-ink)] focus:border-[var(--color-apple-action)] focus:outline-none"
          />
        </FieldLabel>

        {isRecurringClass && (
          <FieldLabel label="적용 범위">
            <div className="flex gap-1.5">
              <ScopeBtn label="이 회차만" active={scope === "this"} onClick={() => setScope("this")} />
              <ScopeBtn label="학기 전체" active={scope === "all"} onClick={() => setScope("all")} />
            </div>
            <p className="mt-1.5 text-[11px] wght-450 text-[var(--color-apple-muted)]">
              {scope === "all"
                ? "같은 요일·시간의 모든 회차에 동일 변경 적용. 시간 변경 시 시·분만 옮기고 날짜는 회차별로 유지."
                : "이 회차에만 적용. 다른 주는 그대로."}
            </p>
          </FieldLabel>
        )}

        {error && (
          <p className="rounded-[8px] bg-[var(--color-urgent)]/10 px-3 py-2 text-[12px] wght-560 text-[var(--color-urgent)]">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-[var(--color-apple-hairline)] pt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-[8px] px-3 py-1.5 text-[12.5px] wght-560 text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)] disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-[8px] bg-[var(--color-apple-ink)] px-3 py-1.5 text-[12.5px] wght-620 text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>
      </form>
    </section>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span
        className="text-[10px] wght-620 uppercase text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "0.08em" }}
      >
        {label}
      </span>
      {children}
    </label>
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

/**
 * 새 일정 직접 추가 폼 — class kind는 받지 않음 (시간표 import 흐름이 따로).
 *
 * 시작 시간 default = 오늘 오후 9시 (학생이 가장 자주 쓰는 마감 시간대).
 * 종료는 기본 비워둠 — 시험·과제·발표는 보통 마감 시점만 의미 있음.
 */
function EventCreateForm({
  open,
  courses,
  prefillDateIso,
  onClose,
  onCreated,
}: {
  open: boolean;
  courses: CourseOption[];
  /** "YYYY-MM-DD" — 캘린더에서 특정 날짜 선택 후 추가 흐름. null이면 오늘. */
  prefillDateIso?: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const defaultStart = useMemo(() => {
    // prefill 있으면 그 날짜의 KST 21:00, 없으면 오늘 KST 21:00
    if (prefillDateIso && /^\d{4}-\d{2}-\d{2}$/.test(prefillDateIso)) {
      return `${prefillDateIso}T21:00`;
    }
    const todayKstMs = Date.now() + 9 * 60 * 60 * 1000;
    const todayKst = new Date(todayKstMs);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${todayKst.getUTCFullYear()}-${pad(todayKst.getUTCMonth() + 1)}-${pad(todayKst.getUTCDate())}T21:00`;
  }, [prefillDateIso]);

  const [kind, setKind] = useState<"exam" | "assignment" | "presentation" | "etc">("exam");
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState<string>("");
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [endsAt, setEndsAt] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // prefillDateIso 또는 defaultStart 바뀌면(=다른 날짜로 다시 열림) startsAt 동기화
  useEffect(() => {
    setStartsAt(defaultStart);
  }, [defaultStart]);

  function reset() {
    setKind("exam");
    setTitle("");
    setCourseId("");
    setStartsAt(defaultStart);
    setEndsAt("");
    setNotes("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const trimmed = title.trim();
    if (!trimmed) {
      setError("제목을 적어주세요");
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        kind,
        title: trimmed,
        starts_at: localInputToKstIso(startsAt),
        notes: notes.trim() || null,
      };
      if (courseId) body.course_id = courseId;
      if (endsAt) body.ends_at = localInputToKstIso(endsAt);

      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "생성 실패");
        return;
      }
      reset();
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) {
          reset();
          onClose();
        }
      }}
      title="새 일정"
      description="강의계획서 없이 직접 추가. 매주 반복 수업은 시간표 업로드를 써주세요."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FieldLabel label="종류">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["exam", "시험"],
                ["assignment", "과제"],
                ["presentation", "발표"],
                ["etc", "기타"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={
                  kind === k
                    ? "rounded-full bg-[var(--color-apple-ink)] px-3 py-1 text-[12px] wght-560 text-white"
                    : "rounded-full border border-[var(--color-apple-hairline)] bg-white px-3 py-1 text-[12px] wght-560 text-[var(--color-apple-muted)] hover:text-[var(--color-apple-ink)]"
                }
              >
                {label}
              </button>
            ))}
          </div>
        </FieldLabel>

        <FieldLabel label="제목">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
            maxLength={120}
            placeholder="예: 운영체제 중간고사"
            className="w-full rounded-[8px] border border-[var(--color-apple-hairline)] bg-white px-3 py-2 text-[14px] wght-560 text-[var(--color-apple-ink)] focus:border-[var(--color-apple-action)] focus:outline-none"
          />
        </FieldLabel>

        {courses.length > 0 && (
          <FieldLabel label="강의 (선택)">
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="w-full rounded-[8px] border border-[var(--color-apple-hairline)] bg-white px-3 py-2 text-[13.5px] wght-450 text-[var(--color-apple-ink)] focus:border-[var(--color-apple-action)] focus:outline-none"
            >
              <option value="">강의 없음 (미분류)</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </FieldLabel>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FieldLabel label="시작">
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              required
              className="w-full rounded-[8px] border border-[var(--color-apple-hairline)] bg-white px-3 py-2 text-[13px] tabular-nums text-[var(--color-apple-ink)] focus:border-[var(--color-apple-action)] focus:outline-none"
            />
          </FieldLabel>
          <FieldLabel label="종료 (선택)">
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="w-full rounded-[8px] border border-[var(--color-apple-hairline)] bg-white px-3 py-2 text-[13px] tabular-nums text-[var(--color-apple-ink)] focus:border-[var(--color-apple-action)] focus:outline-none"
            />
          </FieldLabel>
        </div>

        <FieldLabel label="메모 (선택)">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="제출 형식·범위·페이지 수 등"
            className="w-full resize-y rounded-[8px] border border-[var(--color-apple-hairline)] bg-white px-3 py-2 text-[13px] wght-450 text-[var(--color-apple-ink)] focus:border-[var(--color-apple-action)] focus:outline-none"
          />
        </FieldLabel>

        {error && (
          <p className="rounded-[8px] bg-[var(--color-urgent)]/10 px-3 py-2 text-[12px] wght-560 text-[var(--color-urgent)]">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              if (busy) return;
              reset();
              onClose();
            }}
            disabled={busy}
            className="rounded-[8px] px-3.5 py-2 text-[13px] wght-560 text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)] disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-[8px] bg-[var(--color-apple-ink)] px-3.5 py-2 text-[13px] wght-620 text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "저장 중…" : "추가"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
