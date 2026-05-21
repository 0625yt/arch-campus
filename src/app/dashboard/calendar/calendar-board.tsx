"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ContextMenu, useContextMenu, type ContextMenuItem } from "@/components/context-menu";
import { Modal } from "@/components/modal";
import type { EventView } from "@/lib/data/events";
import { formatEventLabel, formatEventCompact } from "@/lib/format-event";

/**
 * SSR과 client 첫 paint를 일치시키기 위한 mount 플래그.
 * D-N 계산처럼 `new Date()`에 의존하는 라벨은 mounted === false 동안 빈 문자열을 렌더해
 * hydration mismatch (#418) 를 막는다.
 */
function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}

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

/** 일/주/월/년 단위로 캘린더 보기 스케일. URL `?scale=`로 영속. */
export type CalendarScale = "day" | "week" | "month" | "year";
const SCALE_LABELS: Record<CalendarScale, string> = {
  day: "일",
  week: "주",
  month: "월",
  year: "년",
};
const SCALE_ORDER: CalendarScale[] = ["day", "week", "month", "year"];

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
  const searchParams = useSearchParams();
  const initialScale = ((): CalendarScale => {
    const raw = searchParams.get("scale");
    if (raw === "day" || raw === "week" || raw === "month" || raw === "year") return raw;
    return "month";
  })();
  const [scale, setScaleState] = useState<CalendarScale>(initialScale);
  function setScale(next: CalendarScale) {
    setScaleState(next);
    // URL ?scale= 갱신 — 새로고침해도 유지, 그러나 history push는 안 함
    const params = new URLSearchParams(searchParams.toString());
    if (next === "month") params.delete("scale");
    else params.set("scale", next);
    const qs = params.toString();
    const url = qs ? `?${qs}` : "?";
    window.history.replaceState(null, "", url);
  }
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
  // 드래그로 선택한 종료 날짜 (start와 다르면 end). 단일 클릭이면 null.
  const [createPrefillEndDate, setCreatePrefillEndDate] = useState<string | null>(null);

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

  // 빈 셀에서 드래그로 새 일정 범위 선택. mousedown 셀 → mousemove하며 같은 그리드 안의
  // 다른 셀들로 확장 → mouseup 시 모든 셀 iso가 dragRange에 담겨있다. 그 범위를 시작/끝
  // 날짜로 새 일정 modal 열 때 prefill로 넘긴다.
  const [dragStartIso, setDragStartIso] = useState<string | null>(null);
  const [dragEndIso, setDragEndIso] = useState<string | null>(null);
  const dragRangeIsoSet = useMemo(() => {
    if (!dragStartIso || !dragEndIso) return new Set<string>();
    const a = dragStartIso;
    const b = dragEndIso;
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    const out = new Set<string>();
    let cur = lo;
    // 단순 문자열 비교 가능 (YYYY-MM-DD ISO)
    while (cur <= hi) {
      out.add(cur);
      const d = new Date(cur);
      d.setDate(d.getDate() + 1);
      cur = isoDate(d);
    }
    return out;
  }, [dragStartIso, dragEndIso]);

  function beginDrag(iso: string) {
    setDragStartIso(iso);
    setDragEndIso(iso);
  }
  function extendDrag(iso: string) {
    if (!dragStartIso) return; // mousedown 없이 mouseenter만 들어오는 경우 무시
    setDragEndIso(iso);
  }
  function endDrag() {
    if (!dragStartIso || !dragEndIso) {
      setDragStartIso(null);
      setDragEndIso(null);
      return;
    }
    const a = dragStartIso;
    const b = dragEndIso;
    setDragStartIso(null);
    setDragEndIso(null);
    // 같은 셀에서 시작·종료한 단순 클릭이면 새 일정 모달 X (그건 셀 선택임)
    if (a === b) return;
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    setCreatePrefillDate(lo);
    setCreatePrefillEndDate(hi);
    setCreating(true);
  }

  // window mouseup으로 드래그 cancel 보장 — 사용자가 셀 밖에서 떼도 정리
  useEffect(() => {
    if (!dragStartIso) return;
    function onUp() {
      // 현재 dragEnd 그대로 endDrag 호출하면 같은 셀 == 클릭이라 무시됨 → 좋음
      endDrag();
    }
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragStartIso, dragEndIso]);

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
        <div className="flex flex-wrap items-baseline justify-between gap-3">
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
            <ScaleToggle scale={scale} onChange={setScale} className="ml-2" />
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

        {scale === "month" && (
          <>
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
                const inDrag = dragRangeIsoSet.has(cell.iso);
                return (
                  <DayCell
                    key={cell.iso}
                    cell={cell}
                    events={dayEvents}
                    kindLabel={kindLabel}
                    isSelected={isSelectedDay}
                    selectedEventId={selected?.id ?? null}
                    isInDragRange={inDrag}
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
                    onDragStart={() => beginDrag(cell.iso)}
                    onDragOver={() => extendDrag(cell.iso)}
                    onDragEnd={() => endDrag()}
                  />
                );
              })}
            </div>
          </>
        )}

        {scale !== "month" && (
          <ScalePlaceholder scale={scale} className="mt-6" />
        )}
      </section>

      <aside className="flex flex-col gap-4">
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
            일정을 누르면 모달로 자세한 내용이 떠요.
          </p>
        </section>
      </aside>

      {/* Inspector — 데스크톱은 우측 float, 모바일은 bottom sheet. arch 톤 자체 컴포넌트. */}
      <CalendarInspector open={!!selected || (!!selectedDate && !selected)} onClose={() => { setSelected(null); setSelectedDate(null); }}>
        {selected && (
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
        )}
        {!selected && selectedDate && (
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
        )}
      </CalendarInspector>

      <EventCreateForm
        open={creating}
        courses={courses}
        prefillDateIso={createPrefillDate}
        prefillEndDateIso={createPrefillEndDate}
        onClose={() => {
          setCreating(false);
          setCreatePrefillDate(null);
          setCreatePrefillEndDate(null);
        }}
        onCreated={() => {
          setCreating(false);
          setCreatePrefillDate(null);
          setCreatePrefillEndDate(null);
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

/**
 * 일/주/월/년 스케일 segmented control — macOS 캘린더 톤.
 * 작은 라운드 pill 그룹, 활성 셀은 흰 배경. 모바일은 가로 컴팩트.
 */
function ScaleToggle({
  scale,
  onChange,
  className,
}: {
  scale: CalendarScale;
  onChange: (s: CalendarScale) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="보기 스케일"
      className={`inline-flex items-center gap-px overflow-hidden rounded-full bg-[var(--color-apple-pearl)] p-0.5 ${className ?? ""}`}
    >
      {SCALE_ORDER.map((s) => {
        const active = scale === s;
        return (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(s)}
            className={`inline-flex h-7 min-w-[28px] items-center justify-center rounded-full px-2.5 text-[12px] transition-all ${
              active
                ? "wght-620 bg-white text-[var(--color-apple-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                : "wght-450 text-[var(--color-apple-muted)] hover:text-[var(--color-apple-ink)]"
            }`}
            style={{ letterSpacing: "-0.012em" }}
          >
            {SCALE_LABELS[s]}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 일/주/년 view는 Phase 2~에서 구현 예정 — 일단 스케일 토글이 동작은 하되
 * 본 화면은 안내문으로 자리를 잡아둔다. 이렇게 하면 toggle UX는 즉시 잡고,
 * 본 그리드는 별도 PR로 깔끔히 진행 가능.
 */
function ScalePlaceholder({ scale, className }: { scale: CalendarScale; className?: string }) {
  const titleByScale: Record<CalendarScale, string> = {
    day: "일 단위 보기",
    week: "주 단위 보기",
    month: "월 단위 보기",
    year: "년 단위 보기",
  };
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-[12px] border border-dashed border-[var(--color-apple-hairline)] bg-[var(--color-apple-pearl)] px-6 py-16 text-center ${className ?? ""}`}
    >
      <p
        className="text-[14px] wght-560 text-[var(--color-apple-ink)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {titleByScale[scale]} 준비 중이에요
      </p>
      <p
        className="mt-2 max-w-[360px] text-[12.5px] leading-[1.55] wght-450 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.022em" }}
      >
        곧 일·주·년 보기도 같은 톤으로 채워드릴게요. 지금은 월 보기로 전환해서 사용해 주세요.
      </p>
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
  selectedEventId,
  isInDragRange,
  onSelectDay,
  onSelectEvent,
  onContextDay,
  onContextEvent,
  onDragStart,
  onDragOver,
  onDragEnd,
}: {
  cell: MonthCell;
  events: EventView[];
  kindLabel: Record<EventView["kind"], string>;
  isSelected?: boolean;
  /** 클릭된 이벤트 id — 칩이 진해지는 selected 표시 */
  selectedEventId?: string | null;
  /** 드래그로 선택된 범위 안에 들어가있나 — 셀 배경 강조 */
  isInDragRange?: boolean;
  /** 셀 빈 영역 클릭 — 그 날 일정 모음 패널 열기 */
  onSelectDay?: () => void;
  onSelectEvent?: (e: EventView) => void;
  /** 셀 빈 영역 우클릭 — "이 날에 일정 추가" 메뉴 */
  onContextDay?: (pos: { x: number; y: number }) => void;
  /** 일정 칩 우클릭 — 이벤트별 메뉴 */
  onContextEvent?: (e: EventView, pos: { x: number; y: number }) => void;
  /** 드래그 시작 (mousedown on empty cell area) */
  onDragStart?: () => void;
  /** 드래그 진행 중 다른 셀로 진입 */
  onDragOver?: () => void;
  /** 드래그 종료 */
  onDragEnd?: () => void;
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

  function handleMouseDown(e: React.MouseEvent) {
    // 오직 빈 영역에서만 드래그 시작 (칩 위에선 X)
    if (e.button !== 0) return;
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).closest("[data-day-bg]")) {
      return;
    }
    onDragStart?.();
  }
  function handleMouseEnter() {
    onDragOver?.();
  }
  function handleMouseUp() {
    onDragEnd?.();
  }

  return (
    <div
      data-day-bg
      onClick={handleDayClick}
      onContextMenu={handleDayContext}
      onMouseDown={handleMouseDown}
      onMouseEnter={handleMouseEnter}
      onMouseUp={handleMouseUp}
      className={`flex min-h-[88px] cursor-pointer flex-col gap-1 p-1.5 transition-colors duration-150 sm:min-h-[110px] sm:p-2 ${
        cell.inMonth ? "" : "opacity-40"
      } ${isSelected ? "ring-1 ring-inset ring-[var(--color-apple-action)]" : ""} ${
        isInDragRange ? "ring-2 ring-inset ring-[var(--color-apple-action)]" : ""
      }`}
      style={{
        // 오늘 셀은 종이 위에 살짝 따뜻한 톤. 다른 날은 흰색. 드래그 진행 중인 셀은 강조 톤.
        backgroundColor: isInDragRange
          ? "var(--color-apple-action-soft, #e6f0ff)"
          : cell.isToday
            ? "var(--color-surface-cream)"
            : "#ffffff",
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

      {/* 데스크톱: macOS 캘린더 톤 — 시간 지정은 좌측 색 도트 + 텍스트(투명 배경),
          하루 종일은 셀 가로 가득 차는 흐릿한 색 막대. */}
      <ul className="hidden flex-col gap-px sm:flex">
        {events.slice(0, 4).map((e) => {
          const fullLabel = formatEventLabel(e);
          const shortLabel = formatEventCompact(e);
          const color = kindColor(e.kind, e.courseColor);
          const isSelectedEvent = selectedEventId === e.id;
          if (e.allDay) {
            // 하루 종일 — 배경 흐릿 + 흰 텍스트 톤
            return (
              <li key={e.id}>
                <EventChip
                  event={e}
                  selected={isSelectedEvent}
                  allDay
                  color={color}
                  label={shortLabel}
                  title={fullLabel}
                  onClick={() => onSelectEvent?.(e)}
                  onContext={(pos) => onContextEvent?.(e, pos)}
                />
              </li>
            );
          }
          return (
            <li key={e.id}>
              <EventChip
                event={e}
                selected={isSelectedEvent}
                allDay={false}
                color={color}
                label={shortLabel}
                title={fullLabel}
                onClick={() => onSelectEvent?.(e)}
                onContext={(pos) => onContextEvent?.(e, pos)}
              />
            </li>
          );
        })}
        {events.length > 4 && (
          <li
            className="truncate pl-1 pt-0.5 text-[10px] wght-560 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            + {events.length - 4}개 더
          </li>
        )}
      </ul>
    </div>
  );
}

/**
 * 이벤트 chip — macOS 캘린더 톤.
 *
 * 시간 지정 일정: 투명 배경 + 좌측 색 도트 + 검은 텍스트. 클릭 시 색 배경 진해짐.
 * 하루 종일 일정: 색 배경 막대 (셀 가로 가득) + 흰 텍스트 톤. selected 시 진한 색.
 *
 * selected 상태:
 *   - 시간 지정: 배경에 옅은 색 + bold
 *   - 하루 종일: 배경 진해짐 + bold
 */
function EventChip({
  event,
  selected,
  allDay,
  color,
  label,
  title,
  onClick,
  onContext,
}: {
  event: EventView;
  selected?: boolean;
  allDay: boolean;
  color: string;
  label: string;
  title?: string;
  onClick: () => void;
  onContext?: (pos: { x: number; y: number }) => void;
}) {
  void event;

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleContext(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onContext?.({ x: e.clientX, y: e.clientY });
  }
  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    onClick();
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

  if (allDay) {
    return (
      <button
        type="button"
        onClick={handleClick}
        onContextMenu={handleContext}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        title={title}
        className="block w-full truncate rounded-[6px] px-2 py-[3px] text-left text-[11px] wght-560 leading-[1.35] transition-all duration-150 hover:brightness-105 active:scale-[0.98]"
        style={{
          backgroundColor: selected ? toAlpha(color, 0.9) : toAlpha(color, 0.18),
          color: selected ? "white" : "var(--color-apple-ink)",
          letterSpacing: "-0.012em",
        }}
      >
        {label}
      </button>
    );
  }
  // 시간 지정 — 좌측 얇은 색 bar + 텍스트. (동그라미 점은 DESIGN §10 금지.)
  return (
    <button
      type="button"
      onClick={handleClick}
      onContextMenu={handleContext}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      title={title}
      className={`group relative flex w-full items-center truncate rounded-[4px] py-[3px] pl-2 pr-1.5 text-left text-[11px] leading-[1.35] transition-all duration-150 hover:bg-[var(--color-apple-pearl)] active:scale-[0.98] ${
        selected ? "wght-700" : "wght-450"
      }`}
      style={{
        backgroundColor: selected ? toAlpha(color, 0.12) : "transparent",
        color: "var(--color-apple-ink)",
        letterSpacing: "-0.012em",
      }}
    >
      <span
        aria-hidden
        className="absolute left-0 top-1/2 h-3 w-[2.5px] -translate-y-1/2 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="truncate">{label}</span>
    </button>
  );
}

/**
 * Calendar inspector overlay — 데스크톱·모바일 분기.
 *
 * 데스크톱(md+): 우측에서 슬라이드 인하는 sticky 패널. 백드롭은 살짝만 dim (Apple 캘린더 톤).
 * 모바일(<md): 화면 하단에서 올라오는 bottom sheet. 헤더 grabber bar로 swipe down 가능.
 *
 * DESIGN.md §10 가드:
 *  - generic shadcn 모달(흰 카드 + 헤더 + X) 형식 사용 X — 내용 자체가 EventDetailPanel
 *  - 백드롭 blur 없음 (살짝 ink 30% dim만)
 *  - 데스크톱은 가운데 모달 X — Apple 캘린더처럼 우측 inspector
 */
function CalendarInspector({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  function handleTouchStart(e: React.TouchEvent) {
    dragStartY.current = e.touches[0]?.clientY ?? null;
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (dragStartY.current == null) return;
    const y = e.touches[0]?.clientY ?? dragStartY.current;
    const delta = Math.max(0, y - dragStartY.current); // 위로는 안 끌림
    setDragOffset(delta);
  }
  function handleTouchEnd() {
    if (dragOffset > 120) {
      // 충분히 내려갔으면 닫음
      setDragOffset(0);
      dragStartY.current = null;
      onClose();
      return;
    }
    // 다시 원위치
    setDragOffset(0);
    dragStartY.current = null;
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40" aria-hidden={!open}>
      {/* Backdrop — 살짝만 dim, blur 없음 */}
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--color-apple-ink)]/15 transition-opacity duration-200"
      />

      {/* 데스크톱: 우측 float panel */}
      <div
        className="pointer-events-none absolute inset-y-6 right-6 hidden w-[360px] md:block lg:w-[400px]"
      >
        <div className="pointer-events-auto h-full overflow-y-auto" style={{ animation: "slideInRight 220ms ease-out" }}>
          {children}
        </div>
      </div>

      {/* 모바일: bottom sheet */}
      <div
        ref={sheetRef}
        className="absolute inset-x-0 bottom-0 md:hidden"
        style={{
          transform: `translateY(${dragOffset}px)`,
          transition: dragOffset === 0 ? "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)" : "none",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="max-h-[85vh] overflow-y-auto rounded-t-[20px] bg-white shadow-[0_-8px_28px_rgba(0,0,0,0.08)]">
          {/* Grabber bar — swipe down 힌트 */}
          <div className="flex justify-center pt-2.5 pb-1">
            <span
              aria-hidden
              className="block h-1 w-9 rounded-full bg-[var(--color-apple-hairline)]"
            />
          </div>
          {children}
        </div>
      </div>

      <style jsx>{`
        @keyframes slideInRight {
          from {
            opacity: 0;
            transform: translateX(8px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}

/**
 * hex/rgb 색을 알파 섞은 rgba로 변환. 간단 hex 가정.
 * 실패 시 원본 그대로 반환 (CSS는 brightness 등으로 보정).
 */
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
  const mounted = useMounted();
  const date = new Date(event.startsAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((date.getTime() - today.getTime()) / 86400000);
  const dDayLabel = !mounted ? "" : days === 0 ? "오늘" : days < 0 ? `D+${-days}` : `D-${days}`;
  const tone = !mounted ? "muted" : days <= 1 ? "urgent" : days <= 3 ? "warn" : "muted";
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

  const mounted = useMounted();
  const date = new Date(event.startsAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const days = Math.round((startOfDay.getTime() - today.getTime()) / 86400000);
  const dDayLabel = !mounted ? "" : days === 0 ? "오늘" : days < 0 ? `D+${-days}` : `D-${days}`;
  const tone = !mounted ? "muted" : days <= 0 ? "urgent" : days <= 3 ? "warn" : "muted";
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
      <section className="elev-2 overflow-hidden rounded-[14px] bg-white">
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
  const mounted = useMounted();
  const [y, m, d] = dateIso.split("-").map(Number);
  const localDate = new Date(y, m - 1, d);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][localDate.getDay()];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((localDate.getTime() - today.getTime()) / 86400000);
  const dDayLabel = !mounted ? "" : days === 0 ? "오늘" : days < 0 ? `D+${-days}` : `D-${days}`;

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
    <section className="elev-2 overflow-hidden rounded-[14px] bg-white">
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

/** "YYYY-MM-DD" → "5월 18일 월요일" 같은 라벨 */
function formatDateIsoLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][dt.getDay()];
  return `${m}월 ${d}일 ${weekday}요일`;
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
  prefillEndDateIso,
  onClose,
  onCreated,
}: {
  open: boolean;
  courses: CourseOption[];
  /** "YYYY-MM-DD" — 캘린더에서 특정 날짜 선택 후 추가 흐름. null이면 오늘. */
  prefillDateIso?: string | null;
  /** 드래그로 잡은 종료 날짜 — start와 다르면 사용자가 범위 잡은 것 */
  prefillEndDateIso?: string | null;
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

  const defaultEnd = useMemo(() => {
    if (prefillEndDateIso && /^\d{4}-\d{2}-\d{2}$/.test(prefillEndDateIso)) {
      // 드래그로 범위 잡은 경우 — 끝 날짜 22:00 (1시간)
      return `${prefillEndDateIso}T22:00`;
    }
    return "";
  }, [prefillEndDateIso]);

  // 기본값 강요 X — 사용자가 명시적으로 선택. 그래야 "왜 시험이지?" 같은 어색함이 없음.
  const [kind, setKind] = useState<"exam" | "assignment" | "presentation" | "etc" | "">("");
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState<string>("");
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [endsAt, setEndsAt] = useState(defaultEnd);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // prefillDateIso 또는 defaultStart 바뀌면(=다른 날짜로 다시 열림) startsAt 동기화
  useEffect(() => {
    setStartsAt(defaultStart);
  }, [defaultStart]);
  useEffect(() => {
    setEndsAt(defaultEnd);
  }, [defaultEnd]);

  function reset() {
    setKind("");
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
    if (!kind) {
      setError("어떤 일정인지 골라주세요");
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
        <FieldLabel label="제목">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
            maxLength={120}
            placeholder="새 이벤트"
            className="w-full rounded-[8px] border border-[var(--color-apple-hairline)] bg-white px-3 py-2 text-[14px] wght-560 text-[var(--color-apple-ink)] focus:border-[var(--color-apple-action)] focus:outline-none"
          />
        </FieldLabel>

        <FieldLabel label="어떤 일정이에요?">
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
