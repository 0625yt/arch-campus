"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ContextMenu, useContextMenu, type ContextMenuItem } from "@/components/context-menu";
import { Modal } from "@/components/modal";
import { Popover } from "@/components/popover";
import type { EventView } from "@/lib/data/events";
import { formatEventLabel, formatEventCompact } from "@/lib/format-event";
import { AiEntryCard } from "./ai-entry-card";
import { EventAIDraftPanel } from "./ai-draft-panel";
import { DayView } from "./views/day-view";
import { startOfWeekKst } from "./views/shared/time-grid";
import { WeekView } from "./views/week-view";
import { YearView } from "./views/year-view";

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

/** 일/주/월/년 단위로 캘린더 보기 스케일. URL `?scale=`로 영속. 토글 UI는 미노출. */
export type CalendarScale = "day" | "week" | "month" | "year";

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
  // scale 토글 부활 (2026-05-23) — 일/주/월 3옵션 (년은 식갑 숨김).
  // URL ?scale= 동기화로 새로고침·외부 진입 모두 유지.
  const [scale, setScaleState] = useState<CalendarScale>(initialScale);
  function setScale(next: CalendarScale) {
    setScaleState(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "month") params.delete("scale");
    else params.set("scale", next);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : "?");
  }

  // viewMode: "all" 또는 "timetable" (class 이벤트만). 시간표보기는 주 뷰 의미라
  // 토글 클릭 시 자동으로 scale도 "week"로 전환 (사용자 합의 ㄱ).
  const initialViewMode: "all" | "timetable" =
    searchParams.get("view") === "timetable" ? "timetable" : "all";
  const [viewMode, setViewModeState] = useState<"all" | "timetable">(initialViewMode);
  // 일/주 뷰의 anchor 날짜 (ISO date key "YYYY-MM-DD"). 월 뷰는 view.year/month 사용.
  const [focusDate, setFocusDate] = useState<string>(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
  function setViewMode(next: "all" | "timetable") {
    setViewModeState(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("view");
    else params.set("view", "timetable");
    // 시간표보기 ON이면 자동 주 뷰. 이미 주/일이면 그대로.
    if (next === "timetable" && scale !== "week") {
      setScaleState("week");
      params.set("scale", "week");
    }
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : "?");
  }
  const [view, setView] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selected, setSelected] = useState<EventView | null>(null);
  /** 일정 칩 클릭 시 popover가 자리 잡을 anchor rect. 데스크톱 popover 전용. */
  const [selectedAnchor, setSelectedAnchor] = useState<DOMRect | null>(null);
  /** 데스크톱(md+) 미디어쿼리 — popover vs bottom sheet 분기 */
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
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
  const monthLabel = useMemo(() => {
    if (scale === "year") return `${view.year}년`;
    if (scale === "month") return `${view.year}년 ${view.month + 1}월`;
    const d = new Date(`${focusDate}T00:00:00+09:00`);
    if (scale === "day") return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
    // 주 뷰: 주 시작일 ~ 끝일
    const dow = d.getDay();
    const start = new Date(d);
    start.setDate(d.getDate() - dow);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const sameMonth = start.getMonth() === end.getMonth();
    if (sameMonth) {
      return `${start.getFullYear()}년 ${start.getMonth() + 1}월 ${start.getDate()}–${end.getDate()}일`;
    }
    return `${start.getMonth() + 1}월 ${start.getDate()}일 – ${end.getMonth() + 1}월 ${end.getDate()}일`;
  }, [scale, view, focusDate]);

  // 날짜 → 이벤트 그룹
  const byDate = useMemo(() => {
    const map = new Map<string, EventView[]>();
    for (const e of monthState) {
      const key = e.startsAt.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [monthState]);

  function navigate(delta: number) {
    if (scale === "year") {
      setView((prev) => ({ year: prev.year + delta, month: prev.month }));
      return;
    }
    if (scale === "month") {
      setView((prev) => {
        const m = prev.month + delta;
        const year = prev.year + Math.floor(m / 12);
        const month = ((m % 12) + 12) % 12;
        return { year, month };
      });
      return;
    }
    // 일 뷰: 1일씩. 주 뷰: 7일씩.
    const step = scale === "day" ? delta : delta * 7;
    const d = new Date(`${focusDate}T00:00:00+09:00`);
    d.setDate(d.getDate() + step);
    const pad = (n: number) => String(n).padStart(2, "0");
    setFocusDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }

  function goToday() {
    const now = new Date();
    if (scale === "month" || scale === "year") {
      setView({ year: now.getFullYear(), month: now.getMonth() });
    }
    const pad = (n: number) => String(n).padStart(2, "0");
    setFocusDate(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
  }

  if (monthEvents.length === 0 && upcoming.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="mt-8 fade-up fade-up-1">
      <AiEntryCard onOpen={() => setCreating(true)} />
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
            {/* 스케일 토글 — 일/주/월. 년은 식갑 숨김 (?scale=year 외부 진입은 placeholder). */}
            <ScaleToggle scale={scale} onChange={setScale} className="ml-2" />
            {/* 뷰 모드 토글 — 시간표만 vs 내 일정. 시간표만 클릭 시 자동 주 뷰. */}
            <ViewModeToggle mode={viewMode} onChange={setViewMode} className="ml-1" />
            {/* hairline 구분자 — 자주 안 쓰는 액션과 시각적 분리 */}
            <span aria-hidden className="mx-1 h-4 w-px bg-[var(--color-apple-hairline)]" />
            <Link
              href="/dashboard/calendar/import?kind=timetable"
              className="rounded-full px-3 py-1.5 text-[14px] wght-560 text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              시간표 다시 올리기
            </Link>
            {/* 일/주/년 뷰는 별도 sprint에서 구현 예정. 토글 노출 X — 동작 안 하는 옵션
                보이면 사용자가 헷갈림. setScale은 외부 trigger용(URL ?scale=...)으로 유지. */}
          </div>
        </div>

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
                    onSelectDay={(anchorRect) => {
                      setSelectedDate(cell.iso);
                      setSelected(null);
                      setSelectedAnchor(anchorRect ?? null);
                    }}
                    onSelectEvent={(e, anchorRect) => {
                      setSelected(e);
                      setSelectedAnchor(anchorRect);
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

        {scale === "week" && (
          <WeekView
            weekStart={startOfWeekKst(focusDate)}
            events={monthState}
            viewMode={viewMode}
            onSelectEvent={(e, rect) => {
              setSelected(e);
              setSelectedAnchor(rect);
              setSelectedDate(null);
            }}
            onSelectEmpty={(dateKey, hour) => {
              setCreatePrefillDate(dateKey);
              setCreatePrefillEndDate(null);
              setCreating(true);
              void hour; // 시간 prefill은 EventCreateForm prop 확장 필요 — 별도 sprint
            }}
          />
        )}

        {scale === "day" && (
          <DayView
            dateKey={focusDate}
            events={monthState}
            onSelectEvent={(e, rect) => {
              setSelected(e);
              setSelectedAnchor(rect);
              setSelectedDate(null);
            }}
            onSelectEmpty={(dateKey, hour) => {
              setCreatePrefillDate(dateKey);
              setCreatePrefillEndDate(null);
              setCreating(true);
              void hour;
            }}
          />
        )}

        {scale === "year" && (
          <YearView
            year={view.year}
            events={monthState}
            onSelectMonth={(y, m) => {
              setView({ year: y, month: m });
              setScale("month");
            }}
            onSelectDay={(dateKey) => {
              setFocusDate(dateKey);
              setScale("day");
            }}
          />
        )}
      </section>

      {/* 데스크톱: 칩 옆 popover. 모바일: bottom sheet.
          isDesktop으로 한쪽만 렌더 — popover portal이라 CSS hidden 안 먹음. */}
      {isDesktop ? (
        <>
          <Popover
            open={!!selected && !!selectedAnchor}
            anchorRect={selectedAnchor}
            onClose={() => {
              setSelected(null);
              setSelectedAnchor(null);
            }}
            width={360}
          >
            {selected && (
              <EventDetailPanel
                event={selected}
                kindLabel={kindLabel}
                onClose={() => {
                  setSelected(null);
                  setSelectedAnchor(null);
                }}
                onDelete={(scope) => quickDelete(selected, scope)}
                onPatched={(patch) => {
                  patchInState(selected.id, patch);
                  setSelected({ ...selected, ...patch });
                  router.refresh();
                }}
              />
            )}
          </Popover>

          <Popover
            open={!!selectedDate && !selected && !!selectedAnchor}
            anchorRect={selectedAnchor}
            onClose={() => {
              setSelectedDate(null);
              setSelectedAnchor(null);
            }}
            width={360}
          >
            {selectedDate && (
              <DayDetailPanel
                dateIso={selectedDate}
                events={byDate.get(selectedDate) ?? []}
                kindLabel={kindLabel}
                onClose={() => {
                  setSelectedDate(null);
                  setSelectedAnchor(null);
                }}
                onSelectEvent={(e) => setSelected(e)}
                onAddOnDay={() => {
                  setCreatePrefillDate(selectedDate);
                  setCreating(true);
                }}
              />
            )}
          </Popover>
        </>
      ) : (
        <CalendarInspector
          open={!!selected || (!!selectedDate && !selected)}
          onClose={() => {
            setSelected(null);
            setSelectedDate(null);
          }}
        >
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
      )}

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

/**
 * 일/주/월 스케일 토글 — segmented control (DESIGN §10 풀-라운드 pill 무분별 X 룰 준수).
 * rounded-md 컨테이너 + 활성만 흰 배경 + 작은 그림자.
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
  const opts: Array<{ value: CalendarScale; label: string }> = [
    { value: "day", label: "일" },
    { value: "week", label: "주" },
    { value: "month", label: "월" },
    { value: "year", label: "년" },
  ];
  return (
    <div
      role="tablist"
      aria-label="보기 스케일"
      className={`inline-flex items-center gap-0.5 rounded-[8px] bg-[var(--color-apple-pearl)] p-0.5 ${className ?? ""}`}
    >
      {opts.map((o) => {
        const active = scale === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`inline-flex h-6 min-w-[26px] items-center justify-center rounded-[6px] px-2 text-[12px] transition-all ${
              active
                ? "wght-620 bg-white text-[var(--color-apple-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                : "wght-450 text-[var(--color-apple-muted)] hover:text-[var(--color-apple-ink)]"
            }`}
            style={{ letterSpacing: "-0.012em" }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 시간표보기 / 내 일정 다 보기 토글. 시간표보기 클릭 시 부모가 자동으로 주 뷰로 전환.
 */
function ViewModeToggle({
  mode,
  onChange,
  className,
}: {
  mode: "all" | "timetable";
  onChange: (m: "all" | "timetable") => void;
  className?: string;
}) {
  const opts: Array<{ value: "all" | "timetable"; label: string }> = [
    { value: "all", label: "내 일정" },
    { value: "timetable", label: "시간표만" },
  ];
  return (
    <div
      role="tablist"
      aria-label="보기 모드"
      className={`inline-flex items-center gap-0.5 rounded-[8px] bg-[var(--color-apple-pearl)] p-0.5 ${className ?? ""}`}
    >
      {opts.map((o) => {
        const active = mode === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`inline-flex h-6 items-center justify-center rounded-[6px] px-2.5 text-[12px] transition-all ${
              active
                ? "wght-620 bg-white text-[var(--color-apple-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                : "wght-450 text-[var(--color-apple-muted)] hover:text-[var(--color-apple-ink)]"
            }`}
            style={{ letterSpacing: "-0.012em" }}
          >
            {o.label}
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
  /** 셀 빈 영역 클릭 — 그 날 일정 모음 패널 열기. anchorRect는 데스크톱 popover 자리잡기용. */
  onSelectDay?: (anchorRect?: DOMRect) => void;
  /** 칩 클릭 — anchorRect는 popover가 옆에 자리 잡는 좌표 */
  onSelectEvent?: (e: EventView, anchorRect: DOMRect) => void;
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
    // 데스크톱 popover가 이 셀 옆에 자리 잡도록 셀 자체의 DOMRect를 전달.
    // (anchorRect 없이 호출하면 popover가 화면 밖으로 밀려 빈 셀 클릭 시 안 뜸.)
    const rect = e.currentTarget.getBoundingClientRect();
    onSelectDay?.(rect);
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
      className={`flex min-h-[88px] cursor-pointer flex-col gap-[1px] px-0.5 pt-0.5 pb-0 transition-colors duration-150 sm:min-h-[110px] sm:px-0.5 sm:pt-1 sm:pb-0.5 ${
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
      {/* 모바일: 텍스트 3개 + '외 N' — macOS/구글캘린더 표준 톤 */}
      <ul className="flex flex-col gap-px sm:hidden">
        {events.slice(0, 3).map((e) => {
          const fullLabel = formatEventLabel(e);
          const shortLabel = formatEventCompact(e);
          const color = eventColor(e);
          return (
            <li key={e.id}>
              <EventChip
                event={e}
                selected={false}
                allDay={e.allDay}
                color={color}
                label={shortLabel}
                title={fullLabel}
                onClick={() => onSelectEvent?.(e, new DOMRect(0, 0, 0, 0))}
                onContext={(pos) => onContextEvent?.(e, pos)}
              />
            </li>
          );
        })}
        {events.length > 3 && (
          <li className="px-1 text-[10px] wght-560 leading-[1.4] text-[var(--color-apple-muted)]">
            외 {events.length - 3}
          </li>
        )}
      </ul>

      {/* 데스크톱: macOS 캘린더 톤 — 시간 지정은 좌측 색 도트 + 텍스트(투명 배경),
          하루 종일은 셀 가로 가득 차는 흐릿한 색 막대. */}
      <ul className="hidden flex-col gap-px sm:flex">
        {events.slice(0, 4).map((e) => {
          const fullLabel = formatEventLabel(e);
          const shortLabel = formatEventCompact(e);
          const color = eventColor(e);
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
                  onClick={(rect) => onSelectEvent?.(e, rect)}
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
                onClick={(rect) => onSelectEvent?.(e, rect)}
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
  /** anchorRect: 칩 자체의 DOMRect — popover가 옆에 자리 잡을 좌표 */
  onClick: (anchorRect: DOMRect) => void;
  onContext?: (pos: { x: number; y: number }) => void;
}) {
  void event;

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  function handleContext(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onContext?.({ x: e.clientX, y: e.clientY });
  }
  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    const rect = btnRef.current?.getBoundingClientRect() ?? new DOMRect(e.clientX, e.clientY, 0, 0);
    onClick(rect);
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
        ref={btnRef}
        type="button"
        onClick={handleClick}
        onContextMenu={handleContext}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        title={title}
        className="block w-full truncate rounded-[4px] px-1 py-0 text-left text-[11px] wght-560 leading-[1.5] transition-all duration-150 hover:brightness-105 active:scale-[0.98]"
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
      ref={btnRef}
      type="button"
      onClick={handleClick}
      onContextMenu={handleContext}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      title={title}
      className={`group relative flex w-full items-center truncate rounded-[4px] py-0 pl-[8px] pr-0.5 text-left text-[11px] leading-[1.5] transition-all duration-150 hover:bg-[var(--color-apple-pearl)] active:scale-[0.98] ${
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
        className="absolute left-[2px] top-1/2 h-[8px] w-[2px] -translate-y-1/2 rounded-full"
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
  // Portal mount는 hydration 안전을 위해 클라이언트에서만.
  // 이유: 캘린더 board가 `fade-up` 애니메이션 끝에 transform: matrix(...) identity를 남겨
  // position: fixed의 containing block을 viewport에서 board로 바꿔버림 → 모바일 sheet가
  // 화면 아래로 밀려나는 버그가 있었음. createPortal로 body 직속 mount해 회피.
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    // 데스크톱은 사이드 패널이라 body 스크롤 잠금. 모바일은 시트가 화면 절반만
    // 차지하므로 캘린더 영역이 살아있어야 하고, 거기서 스크롤하면 시트가 닫혀야 함.
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    const prevOverflow = document.body.style.overflow;
    if (!isMobile) {
      document.body.style.overflow = "hidden";
    }
    // 모바일: 시트 밖(=캘린더 영역)에서 일어나는 touchmove를 닫힘 신호로 사용.
    // 시트 내부 스크롤은 sheetRef로 contains 검사해서 제외.
    function onOutsideTouchMove(e: TouchEvent) {
      if (!isMobile) return;
      const target = e.target as Node | null;
      if (target && sheetRef.current && sheetRef.current.contains(target)) return;
      onClose();
    }
    window.addEventListener("touchmove", onOutsideTouchMove, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("touchmove", onOutsideTouchMove);
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

  if (!open || !portalReady) return null;

  const overlay = (
    // pointer-events-none + 자식만 pointer-events-auto — 모바일에서 캘린더 영역
    // 클릭이 wrapper에 막히지 않게. backdrop·sheet 자식에는 별도 pointer-events-auto.
    <div className="pointer-events-none fixed inset-0 z-40" aria-hidden={!open}>
      {/* Backdrop — 데스크톱만. 모바일은 캘린더가 살아 있어야 하므로 backdrop X
          (캘린더 영역 터치는 그대로 통과, 시트 닫힘은 touchmove 또는 시트 외부 탭으로). */}
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="pointer-events-auto absolute inset-0 hidden bg-[var(--color-apple-ink)]/15 transition-opacity duration-200 md:block"
      />

      {/* 데스크톱: 우측 float panel — Apple Inspector 톤. 그릇 그림자 최소화. */}
      <div
        className="pointer-events-none absolute inset-y-6 right-6 hidden w-[380px] md:block lg:w-[400px]"
      >
        <div
          className="pointer-events-auto h-full overflow-y-auto rounded-[14px] border border-[var(--color-apple-hairline)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.05)]"
          style={{ animation: "calInspectorSlideInRight 220ms ease-out" }}
        >
          {children}
        </div>
      </div>

      {/* 모바일: bottom sheet — 화면 절반 정도 차지. 캘린더 위쪽이 살아있어 그대로 보임. */}
      <div
        ref={sheetRef}
        className="pointer-events-auto absolute inset-x-0 bottom-0 md:hidden"
        style={{
          transform: `translateY(${dragOffset}px)`,
          transition: dragOffset === 0 ? "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)" : "none",
          animation: dragOffset === 0 ? "calInspectorSlideInUp 240ms cubic-bezier(0.22, 1, 0.36, 1)" : undefined,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="max-h-[60vh] overflow-y-auto rounded-t-[18px] border-t border-[var(--color-apple-hairline)] bg-white shadow-[0_-4px_14px_rgba(0,0,0,0.06)]">
          {/* Grabber bar — swipe down affordance. 동그라미 점(●) 아니라 가로 bar이므로
              DESIGN.md §10 가드와 충돌 X (점 금지는 좌측 카테고리 점 패턴 한정). */}
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
        @keyframes calInspectorSlideInRight {
          from {
            opacity: 0;
            transform: translateX(8px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes calInspectorSlideInUp {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );

  // body 직속에 portal — board 그리드의 fade-up transform이 fixed containing block을
  // 캐치하는 문제를 회피. (Popover와 동일한 패턴.)
  return createPortal(overlay, document.body);
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

// ChipButton·UpcomingRow — 사이드바 제거(2026-05-23)로 함께 삭제됨.

/**
 * 일정 상세 인스펙터 — Apple Calendar Inspector 톤을 학생 컨텍스트로 재해석.
 *
 * 사용자 강요 (2026-05-23): "디자인 완전 혁신적으로 바꿔. 닷 쓰지 마. 모달 그릇 X."
 *
 * 재구성된 디자인 결정:
 *  - kindLabel 뱃지 X — kind는 헤드라인 컬러로만 표현 (정보가 곧 디자인)
 *  - 좌측 3px 컬러 바 X — 사용자가 "얇은 좌측 바도 의심스러움"이라며 제거 요청
 *  - 동그라미 점(`●`) 어디에도 X
 *  - 카드 그릇·헤더·구분선 최소화. 공백으로 그루핑
 *  - 정보 위계 (위에서 아래로):
 *      1) 한 줄 헤드라인: "D-3 · 글로컬 영어 I" (kind 색)
 *      2) display 제목 (22px)
 *      3) 큰 타이포 시간 (Apple Mail/Calendar Inspector 톤)
 *      4) 비중 한 줄
 *      5) 메모 (구분선 없이 공백으로)
 *  - 액션은 우상단 작은 아이콘 (연필·휴지통). 닫기 버튼 X — popover/sheet 자체가 외부 클릭으로 닫힘
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
  void kindLabel; // kindLabel은 더 이상 본문에 표시 안 함. 정보 위계로 충분.
  void onClose; // popover/sheet가 외부 클릭으로 닫혀서 명시 X 버튼 불필요

  const mounted = useMounted();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteScope, setDeleteScope] = useState<"this" | "all">("this");

  const isRecurringClass = event.kind === "class" && !!event.courseId;

  if (editing) {
    return (
      <EventEditForm
        event={event}
        isRecurringClass={isRecurringClass}
        accentColor={eventColor(event)}
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
  const dDayLabel = !mounted ? "" : days === 0 ? "오늘" : days < 0 ? `D+${-days}` : `D-${days}`;
  const accent = eventColor(event);

  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];

  // 시간 — Apple Inspector는 시간을 큰 타이포로 강조. 종일·구간 일정도 같은 자리.
  const timeStart = event.allDay
    ? "종일"
    : `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  const endDate = event.endsAt ? new Date(event.endsAt) : null;
  const timeEnd = endDate && !event.allDay
    ? `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`
    : null;
  const dateLine = `${date.getMonth() + 1}월 ${date.getDate()}일 ${weekday}요일`;

  // 헤드라인 1줄 — 사용자 요청 예시 "D-3 · 글로컬 영어 I". 학생에게 1급 정보.
  // course 없으면 D-day만, course 있으면 D-day · course.
  const headlineParts: string[] = [];
  if (dDayLabel) headlineParts.push(dDayLabel);
  if (event.courseName) headlineParts.push(event.courseName);
  const headline = headlineParts.join(" · ");

  async function runDelete() {
    const scope = isRecurringClass ? deleteScope : "this";
    setConfirmDelete(false);
    await onDelete(scope);
  }

  return (
    <>
      <article className="relative">
        {/* 우상단 액션 — float. 본문 padding 위에 absolute로 띄움 (Apple Mail Inspector 톤). */}
        <div className="absolute right-3 top-3 z-10 flex items-center gap-0.5">
          <InspectorIconButton
            ariaLabel="수정"
            onClick={() => setEditing(true)}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path
                d="M9.5 2.5l2 2-7 7H2.5v-2l7-7z"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </InspectorIconButton>
          <InspectorIconButton
            ariaLabel="삭제"
            destructive
            onClick={() => {
              setDeleteScope("this");
              setConfirmDelete(true);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path
                d="M3 4h8M5.5 4V2.5h3V4M4 4l.5 8h5L10 4M6 6.5v3.5M8 6.5v3.5"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </InspectorIconButton>
        </div>

        <div className="flex flex-col px-6 pb-6 pt-6">
          {/* 헤드라인 한 줄 — kind 컬러로 정체성 표현. 점·뱃지 그릇 X.
              사용자 명시: "D-3 · 글로컬 영어 I 한 줄 헤드라인". */}
          {headline && (
            <p
              className="text-[12px] wght-620 tabular-nums"
              style={{ letterSpacing: "-0.006em", color: accent }}
            >
              {headline}
            </p>
          )}

          {/* Display 제목 — 위계 가장 강함. Pretendard 가변 폰트 wght-620 + tight letter-spacing. */}
          <h3
            className="mt-2 text-[22px] leading-[1.2] wght-700 text-[var(--color-apple-ink)] pr-16"
            style={{ letterSpacing: "-0.018em" }}
          >
            {event.title || formatEventLabel(event)}
          </h3>

          {/* 시간 — Apple Inspector 톤. 큰 타이포로 본 정보임을 표현. tabular-nums로 정렬. */}
          <div className="mt-5">
            <p
              className="text-[14px] wght-450 text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              {dateLine}
            </p>
            <p
              className="mt-0.5 text-[28px] leading-[1.05] wght-560 tabular-nums text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "-0.022em" }}
            >
              {timeEnd ? (
                <>
                  {timeStart}
                  <span className="mx-1.5 text-[var(--color-apple-muted)] wght-450">–</span>
                  {timeEnd}
                </>
              ) : (
                timeStart
              )}
            </p>
          </div>

          {/* 비중·코스 링크 — 라벨 없이. 코스명은 헤드라인에 이미 나왔으니 비중만 (course 링크는 inline action). */}
          {(event.weightPercent != null || event.courseName) && (
            <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              {event.weightPercent != null && (
                <span
                  className="text-[13px] wght-560 tabular-nums text-[var(--color-apple-ink)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  비중 {event.weightPercent}%
                </span>
              )}
              {event.courseName && (
                <Link
                  href={`/dashboard/study/${encodeURIComponent(event.courseName)}`}
                  className="text-[12.5px] wght-450 text-[var(--color-apple-action)] hover:underline"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  {event.courseName} 자료 →
                </Link>
              )}
            </div>
          )}

          {/* 메타 정보 — 위치·반복·알림. 라벨 없이 한 줄씩, 작은 회색 텍스트. macOS Inspector 톤. */}
          {(event.location || event.recurrenceRule || event.reminderMinutes != null) && (
            <ul className="mt-4 flex flex-col gap-1.5">
              {event.location && (
                <li
                  className="text-[12.5px] wght-450 text-[var(--color-apple-ink)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  <span className="text-[var(--color-apple-muted)]">위치 </span>
                  {event.location}
                </li>
              )}
              {event.recurrenceRule && (
                <li
                  className="text-[12.5px] wght-450 text-[var(--color-apple-ink)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  <span className="text-[var(--color-apple-muted)]">반복 </span>
                  {formatRecurrence(event.recurrenceRule)}
                </li>
              )}
              {event.reminderMinutes != null && (
                <li
                  className="text-[12.5px] wght-450 text-[var(--color-apple-ink)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  <span className="text-[var(--color-apple-muted)]">알림 </span>
                  {formatReminder(event.reminderMinutes)}
                </li>
              )}
            </ul>
          )}

          {/* 메모 — 라벨·구분선 없이 공백으로 분리. Apple Notes 톤. */}
          {event.notes && (
            <p
              className="mt-6 whitespace-pre-wrap text-[14px] leading-[1.6] wght-450 text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              {event.notes}
            </p>
          )}

          {/* AI 추정 표시 — 학생에게 정확성 신호 주는 안전판. tint 박스는 §10 라운드 16 이내, 단색. */}
          {event.confidence != null && event.confidence < 0.8 && !event.confirmed && (
            <p
              className="mt-5 rounded-[8px] bg-[var(--color-tint-streak)] px-3 py-2 text-[12px] wght-560 text-[var(--color-tint-streak-ink)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              AI가 추정한 일정이에요. 한번 확인해 주세요
            </p>
          )}
        </div>
      </article>

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
 * macOS Mail/Calendar inspector 우상단의 작은 아이콘 버튼.
 * 작고 조용. hover에서만 살짝 옅은 회색 배경. destructive면 hover시 코랄 톤.
 */
function InspectorIconButton({
  children,
  ariaLabel,
  onClick,
  destructive = false,
}: {
  children: React.ReactNode;
  ariaLabel: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={
        destructive
          ? "inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-urgent-soft)] hover:text-[var(--color-urgent)]"
          : "inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]"
      }
    >
      {children}
    </button>
  );
}

/**
 * 특정 날짜의 모든 일정 인스펙터 — Apple Calendar 톤 재해석.
 *
 * 사용자 강요 (2026-05-23):
 *  - "닷 완전 제거" — 1.5px 동그라미 점 X
 *  - "모달 그릇 X" — elev-2 + 헤더 + X 버튼 그릇 제거
 *  - "라벨 없이 정보 위계로" — kindLabel uppercase 라벨 제거
 *
 * 재구성:
 *  - 그릇 없음 (popover/sheet가 이미 그릇 역할)
 *  - 헤드라인: D-day · 날짜 한 줄 (kind 색 없음, 날짜 자체가 위계 1)
 *  - 큰 display 날짜 ("5월 19일")
 *  - 일정 리스트: 시간 (kind 컬러 텍스트) + 제목. 닷 없음, 라벨 없음.
 *  - 액션: "+ 이 날에 추가" inline link 톤
 *  - X 버튼 X (popover/sheet 외부 클릭으로 닫힘)
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
  void kindLabel; // 더 이상 본문에 라벨 텍스트 표시 안 함 (정보 위계로 충분)
  void onClose; // popover/sheet가 외부 클릭으로 닫힘

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
    <article className="px-6 pb-6 pt-6">
      {/* 헤드라인 1줄 — D-day(작음) 그리고 큰 날짜 (display).
          사용자 강요: "라벨 컬럼 만들지 마". 오직 정보 위계로. */}
      {dDayLabel && (
        <p
          className="text-[12px] wght-620 tabular-nums text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.006em" }}
        >
          {dDayLabel}
        </p>
      )}
      <h3
        className="mt-1 text-[22px] leading-[1.15] wght-700 tabular-nums text-[var(--color-apple-ink)]"
        style={{ letterSpacing: "-0.018em" }}
      >
        {m}월 {d}일
      </h3>
      <p
        className="mt-1 text-[13px] wght-450 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {y}년 · {weekday}요일 · {sorted.length === 0 ? "일정 없음" : `${sorted.length}개 일정`}
      </p>

      {/* 일정 리스트 — 닷 없음. 시간을 kind 컬러로 표현하면 카테고리 식별과 시간 정보가 한 줄.
          공백으로 리스트 헤더와 분리 (구분선 X). */}
      {sorted.length > 0 && (
        <ul className="mt-5 flex flex-col gap-0.5">
          {sorted.map((e) => {
            const t = new Date(e.startsAt);
            const tlabel = e.allDay
              ? "종일"
              : `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
            const accent = eventColor(e);
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onSelectEvent(e)}
                  className="-mx-2 flex w-[calc(100%+1rem)] items-baseline gap-3 rounded-[7px] px-2 py-1.5 text-left transition-colors hover:bg-[var(--color-apple-pearl)]"
                >
                  {/* 시간 — kind 컬러로 본문 텍스트. 닷·라벨 자리를 색이 대신함. */}
                  <span
                    className="shrink-0 tabular-nums text-[12px] wght-620 w-[44px]"
                    style={{ letterSpacing: "-0.012em", color: accent }}
                  >
                    {tlabel}
                  </span>
                  <span
                    className="min-w-0 flex-1 truncate text-[13.5px] wght-560 text-[var(--color-apple-ink)]"
                    style={{ letterSpacing: "-0.012em" }}
                  >
                    {formatEventLabel(e)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* 추가 액션 — Apple식 inline link 톤. 큰 점선 박스 그릇 X. */}
      <button
        type="button"
        onClick={onAddOnDay}
        className="mt-6 inline-flex items-center gap-1 text-[13px] wght-560 text-[var(--color-apple-action)] transition-opacity hover:opacity-70"
        style={{ letterSpacing: "-0.012em" }}
      >
        <span aria-hidden className="text-[15px] leading-none">+</span>
        이 날에 일정 추가
      </button>
    </article>
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
 * 인라인 편집 폼 — macOS Calendar inspector 톤 그대로 유지.
 *
 * 디자인 결정:
 *  - 좌측 3px accent 컬러 바 그대로 (상세와 동일 그릇)
 *  - 큰 제목 위치에 borderless input (Fantastical 패턴 — 헤더처럼 보이게)
 *  - 날짜·시간은 한 줄에 두 input (제목 아래 같은 자리)
 *  - 메모는 라벨 없이 자동 grow textarea
 *  - 우상단 ✓ (저장) / × (취소) 아이콘 버튼 — 상세와 같은 위치라 자연스럽게 토글
 *  - "일정 수정" 같은 generic 헤더 X — 화면 자체가 폼임을 입력 필드로 표현
 */
function EventEditForm({
  event,
  isRecurringClass,
  accentColor,
  onCancel,
  onSaved,
}: {
  event: EventView;
  isRecurringClass: boolean;
  accentColor: string;
  onCancel: () => void;
  onSaved: (patch: Partial<EventView>) => void;
}) {
  const [title, setTitle] = useState(event.title);
  const [startsAt, setStartsAt] = useState(isoToKstLocalInput(event.startsAt));
  const [endsAt, setEndsAt] = useState(event.endsAt ? isoToKstLocalInput(event.endsAt) : "");
  const [notes, setNotes] = useState(event.notes ?? "");
  const [allDay, setAllDay] = useState(event.allDay);
  const [location, setLocation] = useState(event.location ?? "");
  const [recurrence, setRecurrence] = useState<"" | "weekly" | "daily" | "monthly">(() => {
    const r = (event.recurrenceRule ?? "").toUpperCase();
    if (r.includes("FREQ=DAILY")) return "daily";
    if (r.includes("FREQ=WEEKLY")) return "weekly";
    if (r.includes("FREQ=MONTHLY")) return "monthly";
    return "";
  });
  const [reminder, setReminder] = useState<"" | "0" | "10" | "60" | "1440">(() => {
    if (event.reminderMinutes == null) return "";
    const v = String(event.reminderMinutes);
    if (v === "0" || v === "10" || v === "60" || v === "1440") return v;
    return "";
  });
  const [color, setColor] = useState<string>(event.color ?? "");
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
      if (allDay !== event.allDay) body.all_day = allDay;
      if (location.trim() !== (event.location ?? "")) {
        body.location = location.trim() || null;
      }
      // recurrence: 폼은 단순화 — FREQ만 비교.
      const currentFreq = (() => {
        const r = (event.recurrenceRule ?? "").toUpperCase();
        if (r.includes("FREQ=DAILY")) return "daily";
        if (r.includes("FREQ=WEEKLY")) return "weekly";
        if (r.includes("FREQ=MONTHLY")) return "monthly";
        return "";
      })();
      if (recurrence !== currentFreq) {
        body.recurrence_rule = recurrence
          ? `FREQ=${recurrence.toUpperCase()}`
          : null;
      }
      const currentReminder = event.reminderMinutes == null ? "" : String(event.reminderMinutes);
      if (reminder !== currentReminder) {
        body.reminder_minutes = reminder === "" ? null : Number(reminder);
      }
      if ((color || null) !== (event.color || null)) {
        body.color = color || null;
      }

      // 시간 계산 — 종일 모드에선 날짜만 받고 시각 부분 정규화
      const composeStart = (raw: string, dayMode: boolean) => {
        if (!dayMode) return raw;
        return `${raw.slice(0, 10)}T00:00`;
      };
      const composeEnd = (raw: string, dayMode: boolean) => {
        if (!raw) return "";
        if (!dayMode) return raw;
        return `${raw.slice(0, 10)}T23:59`;
      };

      // KST로 명시 해석 — 환경 독립 + 서버 매칭과 일관
      const newStartIso = localInputToKstIso(composeStart(startsAt, allDay));
      if (newStartIso !== event.startsAt) {
        body.starts_at = newStartIso;
      }
      const endLocal = composeEnd(endsAt, allDay);
      if (endLocal) {
        const newEndIso = localInputToKstIso(endLocal);
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
      if (body.all_day !== undefined) patch.allDay = body.all_day as boolean;
      if (body.location !== undefined) patch.location = body.location as string | null;
      if (body.recurrence_rule !== undefined)
        patch.recurrenceRule = body.recurrence_rule as string | null;
      if (body.reminder_minutes !== undefined)
        patch.reminderMinutes = body.reminder_minutes as number | null;
      if (body.color !== undefined) patch.color = body.color as string | null;
      onSaved(patch);
    } catch (e) {
      setError(e instanceof Error ? e.message : "수정 실패");
    } finally {
      setBusy(false);
    }
  }

  // 사용자 강요: 좌측 컬러 바 X. 인스펙터 상세와 일관 — 그릇 없음.
  void accentColor;

  return (
    <form onSubmit={handleSave} className="relative">
      {/* 우상단 액션 — float. 저장(체크) + 취소(X) 아이콘. 인스펙터 상세와 같은 위치라 자연 토글. */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-0.5">
        <button
          type="submit"
          disabled={busy}
          aria-label="저장"
          title="저장"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-apple-action)] transition-colors hover:bg-[var(--color-apple-action-soft)] disabled:opacity-40"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path
              d="M2.5 7.5l3 3 6-7"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          aria-label="취소"
          title="취소"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)] disabled:opacity-40"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path
              d="M3.5 3.5l7 7M10.5 3.5l-7 7"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className="flex flex-col px-6 pb-6 pt-6">
        {/* "편집 중" 헤드라인 — 인스펙터 상세의 headline 자리. action 컬러로 위계 1. */}
        <p
          className="text-[12px] wght-620"
          style={{ letterSpacing: "-0.006em", color: "var(--color-apple-action)" }}
        >
          편집 중
        </p>

        {/* 제목 — borderless display input. 상세의 h3 자리 그대로. */}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={120}
          autoFocus
          placeholder="제목"
          className="mt-2 w-full border-0 bg-transparent p-0 pr-16 text-[22px] leading-[1.2] wght-700 text-[var(--color-apple-ink)] outline-none placeholder:wght-450 placeholder:text-[var(--color-apple-muted)]/55"
          style={{ letterSpacing: "-0.018em" }}
        />

        {/* 플로잉 폼 — 라벨 컬럼 X. underline-only 톤. */}
        <div className="mt-5 flex flex-col">
          {/* 종일 toggle */}
          <div className="flex items-center justify-between border-t border-[var(--color-apple-hairline-soft)] py-3">
            <span
              className="text-[14px] wght-450 text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              종일
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={allDay}
              onClick={() => setAllDay((v) => !v)}
              className={`relative inline-flex h-[22px] w-[36px] flex-shrink-0 items-center rounded-full transition-colors ${
                allDay ? "bg-[var(--color-apple-action)]" : "bg-[var(--color-apple-hairline)]"
              }`}
            >
              <span
                className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform ${
                  allDay ? "translate-x-[16px]" : "translate-x-[2px]"
                }`}
              />
            </button>
          </div>
          <div className="border-t border-[var(--color-apple-hairline-soft)]">
            <input
              type={allDay ? "date" : "datetime-local"}
              value={allDay ? startsAt.slice(0, 10) : startsAt}
              onChange={(e) => {
                const v = e.target.value;
                if (allDay) setStartsAt(`${v}T00:00`);
                else setStartsAt(v);
              }}
              required
              aria-label="시작 시간"
              className="w-full border-0 bg-transparent py-3 text-[14px] tabular-nums text-[var(--color-apple-ink)] outline-none"
              style={{ letterSpacing: "-0.012em" }}
            />
          </div>
          <div className="border-t border-[var(--color-apple-hairline-soft)]">
            <input
              type={allDay ? "date" : "datetime-local"}
              value={allDay ? endsAt.slice(0, 10) : endsAt}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) {
                  setEndsAt("");
                  return;
                }
                if (allDay) setEndsAt(`${v}T23:59`);
                else setEndsAt(v);
              }}
              aria-label="종료 시간"
              placeholder="종료 시간 추가"
              className="w-full border-0 bg-transparent py-3 text-[14px] tabular-nums text-[var(--color-apple-ink)] outline-none placeholder:wght-450 placeholder:text-[var(--color-apple-muted)]/55"
              style={{ letterSpacing: "-0.012em" }}
            />
          </div>
          {/* 위치 */}
          <div className="border-t border-[var(--color-apple-hairline-soft)]">
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={200}
              placeholder="위치 — 강의실, 카페, 온라인 링크 등"
              className="w-full border-0 bg-transparent py-3 text-[14px] wght-450 text-[var(--color-apple-ink)] outline-none placeholder:text-[var(--color-apple-muted)]/55"
              style={{ letterSpacing: "-0.012em" }}
            />
          </div>
          {/* 반복 */}
          <div className="flex items-center justify-between border-t border-[var(--color-apple-hairline-soft)] py-3">
            <span
              className="text-[14px] wght-450 text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              반복
            </span>
            <select
              value={recurrence}
              onChange={(e) =>
                setRecurrence(e.target.value as "" | "weekly" | "daily" | "monthly")
              }
              aria-label="반복"
              className="appearance-none border-0 bg-transparent text-right text-[14px] wght-450 text-[var(--color-apple-ink)] outline-none"
              style={{ letterSpacing: "-0.012em" }}
            >
              <option value="">안 함</option>
              <option value="daily">매일</option>
              <option value="weekly">매주</option>
              <option value="monthly">매월</option>
            </select>
          </div>
          {/* 알림 */}
          <div className="flex items-center justify-between border-t border-[var(--color-apple-hairline-soft)] py-3">
            <span
              className="text-[14px] wght-450 text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              알림
            </span>
            <select
              value={reminder}
              onChange={(e) => setReminder(e.target.value as "" | "0" | "10" | "60" | "1440")}
              aria-label="알림"
              className="appearance-none border-0 bg-transparent text-right text-[14px] wght-450 text-[var(--color-apple-ink)] outline-none"
              style={{ letterSpacing: "-0.012em" }}
            >
              <option value="">없음</option>
              <option value="0">정시에</option>
              <option value="10">10분 전</option>
              <option value="60">1시간 전</option>
              <option value="1440">하루 전</option>
            </select>
          </div>
          {/* 색상 */}
          <div className="flex items-center justify-between border-t border-[var(--color-apple-hairline-soft)] py-3">
            <span
              className="text-[14px] wght-450 text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              색상
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setColor("")}
                aria-label="자동 색상"
                className={`relative inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] wght-560 transition-colors ${
                  color === ""
                    ? "border-[var(--color-apple-ink)] bg-white text-[var(--color-apple-ink)]"
                    : "border-[var(--color-apple-hairline)] bg-white text-[var(--color-apple-muted)] hover:border-[var(--color-apple-ink)]/40"
                }`}
              >
                자동
              </button>
              {COLOR_SWATCHES.map((c) => {
                const active = color.toLowerCase() === c.toLowerCase();
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`색상 ${c}`}
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full transition-all ${
                      active ? "ring-2 ring-offset-1 ring-[var(--color-apple-ink)]" : ""
                    }`}
                    style={{ backgroundColor: c }}
                  />
                );
              })}
            </div>
          </div>
          <div className="border-t border-[var(--color-apple-hairline-soft)]">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="메모"
              className="w-full resize-y border-0 bg-transparent py-3 text-[14px] leading-[1.55] wght-450 text-[var(--color-apple-ink)] outline-none placeholder:text-[var(--color-apple-muted)]/55"
              style={{ letterSpacing: "-0.012em" }}
            />
          </div>
        </div>

        {/* 반복 수업 scope — 라벨 없이 segmented + 설명 한 줄. 인스펙터 톤 유지. */}
        {isRecurringClass && (
          <div className="mt-4 flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <ScopeBtn label="이 회차만" active={scope === "this"} onClick={() => setScope("this")} />
              <ScopeBtn label="학기 전체" active={scope === "all"} onClick={() => setScope("all")} />
            </div>
            <p className="text-[11px] wght-450 leading-[1.5] text-[var(--color-apple-muted)]">
              {scope === "all"
                ? "같은 요일·시간의 모든 회차에 적용"
                : "이 회차에만 적용, 다른 주는 그대로"}
            </p>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-[8px] bg-[var(--color-urgent-soft)] px-3 py-2 text-[12px] wght-560 text-[var(--color-urgent)]">
            {error}
          </p>
        )}

        {busy && (
          <p className="mt-3 text-[11.5px] wght-450 text-[var(--color-apple-muted)]">저장 중…</p>
        )}
      </div>
    </form>
  );
}

/**
 * CompactField (좌측 라벨 컬럼) 폐기 — 사용자 강요 (2026-05-23):
 *   "라벨 컬럼 만들지 마. Apple식 placeholder-only flowing form으로 가."
 * EventCreateForm·EventEditForm 모두 borderless underline-only flowing form으로 전환.
 */

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

/**
 * 색 fallback — courseColor가 우선, 없으면 kind 기준 채도 낮은 컬러.
 * (이전 버전의 kindTint/KIND_TINT 파스텔 배경은 인스펙터 재설계에서 닷·뱃지와 함께 제거됨.)
 */
export const KIND_FALLBACK_COLOR: Record<EventView["kind"], string> = {
  exam: "#e0445e",       // coral
  assignment: "#cca06b", // mustard
  presentation: "#7aa6d6", // cobalt
  class: "#7fb38c",      // sage
  etc: "#a08bc4",        // mauve
};

/**
 * EventCreateForm·EventEditForm의 색상 swatch row.
 * macOS Calendar 톤 — 채도 낮춘 6색. KIND_FALLBACK과 톤 일치.
 */
export const COLOR_SWATCHES = [
  "#e0445e", // coral
  "#cca06b", // mustard
  "#7fb38c", // sage
  "#7aa6d6", // cobalt
  "#a08bc4", // mauve
  "#5a6470", // graphite
] as const;

/** RRULE FREQ만 보고 한국어 라벨 — 폼이 단순화돼 있어 FREQ=DAILY|WEEKLY|MONTHLY 케이스만 본다. */
function formatRecurrence(rule: string): string {
  const up = rule.toUpperCase();
  if (up.includes("FREQ=DAILY")) return "매일";
  if (up.includes("FREQ=WEEKLY")) return "매주";
  if (up.includes("FREQ=MONTHLY")) return "매월";
  if (up.includes("FREQ=YEARLY")) return "매년";
  return rule;
}

/** reminder_minutes → 사람 읽기 좋은 라벨. */
function formatReminder(min: number): string {
  if (min === 0) return "정시에";
  if (min < 60) return `${min}분 전`;
  if (min < 1440) {
    const h = Math.round(min / 60);
    return `${h}시간 전`;
  }
  const d = Math.round(min / 1440);
  return `${d}일 전`;
}

export function kindColor(kind: EventView["kind"], courseColor: string | null): string {
  if (courseColor) return courseColor;
  return KIND_FALLBACK_COLOR[kind];
}

/**
 * 일정 색 최종 결정: event.color (사용자 직접 지정) > courseColor > kind fallback.
 */
export function eventColor(e: EventView): string {
  if (e.color) return e.color;
  return kindColor(e.kind, e.courseColor);
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

  // 기본 모드는 AI 입력. prefill (캘린더 셀 클릭 후 추가) 흐름은 수동 폼이 자연스러움.
  // 사용자가 명시한 날짜에 한 건 추가 의도가 명확하니 AI를 굳이 거치게 하지 않음.
  const [mode, setMode] = useState<"ai" | "manual">(prefillDateIso ? "manual" : "ai");
  useEffect(() => {
    setMode(prefillDateIso ? "manual" : "ai");
  }, [prefillDateIso]);

  // 기본값 강요 X — 사용자가 명시적으로 선택. 그래야 "왜 시험이지?" 같은 어색함이 없음.
  const [kind, setKind] = useState<"exam" | "assignment" | "presentation" | "etc" | "">("");
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState<string>("");
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [endsAt, setEndsAt] = useState(defaultEnd);
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState("");
  /** "" | "weekly" | "daily" | "monthly" — 폼은 단순화. 상세 RRULE은 향후 확장. */
  const [recurrence, setRecurrence] = useState<"" | "weekly" | "daily" | "monthly">("");
  /** "" (없음) | "0" | "10" | "60" | "1440" — 분 단위 string으로 select value 운용. */
  const [reminder, setReminder] = useState<"" | "0" | "10" | "60" | "1440">("");
  /** "" (자동 — courseColor 또는 kind fallback) | "#RRGGBB". */
  const [color, setColor] = useState<string>("");
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
    setAllDay(false);
    setLocation("");
    setRecurrence("");
    setReminder("");
    setColor("");
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
      // 종일이면 시각 부분을 그 날 KST 00:00 / 23:59로 정규화 — 백엔드는 timestamptz라
      // 정확한 시점이 박혀 있어야 하지만 UI는 allDay 플래그로 시각 안 보여줌.
      const startsIso = (() => {
        if (!allDay) return localInputToKstIso(startsAt);
        const dateOnly = startsAt.slice(0, 10); // YYYY-MM-DD
        return localInputToKstIso(`${dateOnly}T00:00`);
      })();
      const endsIso = (() => {
        if (!endsAt) return null;
        if (!allDay) return localInputToKstIso(endsAt);
        const dateOnly = endsAt.slice(0, 10);
        return localInputToKstIso(`${dateOnly}T23:59`);
      })();

      // 반복 → RRULE 단순 매핑 (학기 끝까지 UNTIL은 향후 강의 학기와 연동)
      const recurrenceRule = (() => {
        if (!recurrence) return null;
        if (recurrence === "daily") return "FREQ=DAILY";
        if (recurrence === "weekly") return "FREQ=WEEKLY";
        return "FREQ=MONTHLY";
      })();

      const body: Record<string, unknown> = {
        kind,
        title: trimmed,
        starts_at: startsIso,
        notes: notes.trim() || null,
        all_day: allDay,
      };
      if (courseId) body.course_id = courseId;
      if (endsIso) body.ends_at = endsIso;
      if (location.trim()) body.location = location.trim();
      if (recurrenceRule) body.recurrence_rule = recurrenceRule;
      if (reminder !== "") body.reminder_minutes = Number(reminder);
      if (color) body.color = color;

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

  // 선택된 kind의 accent 컬러 (좌측 3px 바와 카테고리 chip active 톤에 사용)
  const accentColor = kind ? KIND_FALLBACK_COLOR[kind] : "var(--color-apple-hairline)";

  // accentColor는 더 이상 컬러 바에 사용 안 함. 향후 다른 affordance에 쓰일 수 있어 변수 유지.
  void accentColor;

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) {
          reset();
          onClose();
        }
      }}
      // AI 모드: header 안 그림. 패널 자체가 popover 톤(헤더 X, 본문 padding 자기 책임).
      // manual 모드: 기존 header 유지 (이 PR 범위 밖).
      chromeless={mode === "ai"}
      title={mode === "ai" ? "일정 추가" : "새 일정"}
      description={
        mode === "ai"
          ? undefined
          : "시험·과제·발표·기타를 추가해요. 매주 반복 수업은 시간표 업로드로 들어와요"
      }
    >
      {mode === "ai" ? (
        <EventAIDraftPanel
          courses={courses}
          onClose={() => {
            if (busy) return;
            reset();
            onClose();
          }}
          onDone={() => {
            reset();
            onCreated();
          }}
          onSwitchToManual={() => setMode("manual")}
        />
      ) : (
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* 사용자 강요 (2026-05-23): "라벨 컬럼 만들지 마. Apple식 placeholder-only flowing form".
            Apple Calendar 새 이벤트 popover처럼 — 라벨 없이 placeholder만으로 의도 전달. */}

        {/* 제목 — borderless display input. 가장 큰 위계. */}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          autoFocus
          maxLength={120}
          placeholder="새 일정"
          className="w-full border-0 bg-transparent p-0 text-[20px] leading-[1.2] wght-700 text-[var(--color-apple-ink)] outline-none placeholder:wght-450 placeholder:text-[var(--color-apple-muted)]/55"
          style={{ letterSpacing: "-0.018em" }}
        />

        {/* 카테고리 — 좌측 점·동그라미 없음. 활성시 컬러 채워진 chip, 비활성은 hairline.
            Apple은 카테고리 별 색을 input 자체에 반영하지만 우리는 학생 톤으로 chip 유지. */}
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["exam", "시험"],
              ["assignment", "과제"],
              ["presentation", "발표"],
              ["etc", "기타"],
            ] as const
          ).map(([k, label]) => {
            const c = KIND_FALLBACK_COLOR[k];
            const isActive = kind === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={
                  isActive
                    ? "rounded-full px-3 py-[5px] text-[12px] wght-620 text-white transition-colors"
                    : "rounded-full border border-[var(--color-apple-hairline)] bg-white px-3 py-[5px] text-[12px] wght-560 text-[var(--color-apple-muted)] transition-colors hover:border-[var(--color-apple-ink)]/30 hover:text-[var(--color-apple-ink)]"
                }
                style={isActive ? { backgroundColor: c } : undefined}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* 플로잉 폼 — 라벨 컬럼 X. placeholder가 라벨 역할. 모든 input이 borderless underline.
            Apple Calendar의 "위치 또는 영상 통화 추가", "2026. 5. 19. ..." 식 placeholder-only. */}
        <div className="flex flex-col">
          {/* 종일 toggle — Apple Calendar의 "하루 종일" 체크 톤. 좌측 텍스트 + 우측 switch. */}
          <div className="flex items-center justify-between border-t border-[var(--color-apple-hairline-soft)] py-3">
            <span
              className="text-[14px] wght-450 text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              종일
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={allDay}
              onClick={() => setAllDay((v) => !v)}
              className={`relative inline-flex h-[22px] w-[36px] flex-shrink-0 items-center rounded-full transition-colors ${
                allDay ? "bg-[var(--color-apple-action)]" : "bg-[var(--color-apple-hairline)]"
              }`}
            >
              <span
                className={`inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform ${
                  allDay ? "translate-x-[16px]" : "translate-x-[2px]"
                }`}
              />
            </button>
          </div>
          {/* 시간 시작 */}
          <div className="border-t border-[var(--color-apple-hairline-soft)]">
            <input
              type={allDay ? "date" : "datetime-local"}
              value={allDay ? startsAt.slice(0, 10) : startsAt}
              onChange={(e) => {
                const v = e.target.value;
                if (allDay) setStartsAt(`${v}T00:00`);
                else setStartsAt(v);
              }}
              required
              aria-label="시작 시간"
              className="w-full border-0 bg-transparent py-3 text-[14px] tabular-nums text-[var(--color-apple-ink)] outline-none"
              style={{ letterSpacing: "-0.012em" }}
            />
          </div>
          {/* 시간 종료 */}
          <div className="border-t border-[var(--color-apple-hairline-soft)]">
            <input
              type={allDay ? "date" : "datetime-local"}
              value={allDay ? endsAt.slice(0, 10) : endsAt}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) {
                  setEndsAt("");
                  return;
                }
                if (allDay) setEndsAt(`${v}T23:59`);
                else setEndsAt(v);
              }}
              aria-label="종료 시간"
              placeholder="종료 시간 추가"
              className="w-full border-0 bg-transparent py-3 text-[14px] tabular-nums text-[var(--color-apple-ink)] outline-none placeholder:wght-450 placeholder:text-[var(--color-apple-muted)]/55"
              style={{ letterSpacing: "-0.012em" }}
            />
          </div>
          {/* 위치 */}
          <div className="border-t border-[var(--color-apple-hairline-soft)]">
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={200}
              placeholder="위치 — 강의실, 카페, 온라인 링크 등"
              className="w-full border-0 bg-transparent py-3 text-[14px] wght-450 text-[var(--color-apple-ink)] outline-none placeholder:text-[var(--color-apple-muted)]/55"
              style={{ letterSpacing: "-0.012em" }}
            />
          </div>
          {/* 반복 */}
          <div className="flex items-center justify-between border-t border-[var(--color-apple-hairline-soft)] py-3">
            <span
              className="text-[14px] wght-450 text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              반복
            </span>
            <select
              value={recurrence}
              onChange={(e) =>
                setRecurrence(e.target.value as "" | "weekly" | "daily" | "monthly")
              }
              aria-label="반복"
              className="appearance-none border-0 bg-transparent text-right text-[14px] wght-450 text-[var(--color-apple-ink)] outline-none"
              style={{ letterSpacing: "-0.012em" }}
            >
              <option value="">안 함</option>
              <option value="daily">매일</option>
              <option value="weekly">매주</option>
              <option value="monthly">매월</option>
            </select>
          </div>
          {/* 알림 */}
          <div className="flex items-center justify-between border-t border-[var(--color-apple-hairline-soft)] py-3">
            <span
              className="text-[14px] wght-450 text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              알림
            </span>
            <select
              value={reminder}
              onChange={(e) => setReminder(e.target.value as "" | "0" | "10" | "60" | "1440")}
              aria-label="알림"
              className="appearance-none border-0 bg-transparent text-right text-[14px] wght-450 text-[var(--color-apple-ink)] outline-none"
              style={{ letterSpacing: "-0.012em" }}
            >
              <option value="">없음</option>
              <option value="0">정시에</option>
              <option value="10">10분 전</option>
              <option value="60">1시간 전</option>
              <option value="1440">하루 전</option>
            </select>
          </div>
          {/* 색상 — 자동(코스/카테고리 색) + 6개 팔레트. 좌측 점 X — 우측 정렬 swatch row. */}
          <div className="flex items-center justify-between border-t border-[var(--color-apple-hairline-soft)] py-3">
            <span
              className="text-[14px] wght-450 text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              색상
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setColor("")}
                aria-label="자동 색상"
                className={`relative inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] wght-560 transition-colors ${
                  color === ""
                    ? "border-[var(--color-apple-ink)] bg-white text-[var(--color-apple-ink)]"
                    : "border-[var(--color-apple-hairline)] bg-white text-[var(--color-apple-muted)] hover:border-[var(--color-apple-ink)]/40"
                }`}
              >
                자동
              </button>
              {COLOR_SWATCHES.map((c) => {
                const active = color.toLowerCase() === c.toLowerCase();
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`색상 ${c}`}
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full transition-all ${
                      active ? "ring-2 ring-offset-1 ring-[var(--color-apple-ink)]" : ""
                    }`}
                    style={{ backgroundColor: c }}
                  />
                );
              })}
            </div>
          </div>
          {/* 강의 선택 */}
          {courses.length > 0 && (
            <div className="border-t border-[var(--color-apple-hairline-soft)]">
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                aria-label="강의"
                className="w-full appearance-none border-0 bg-transparent py-3 text-[14px] wght-450 text-[var(--color-apple-ink)] outline-none"
                style={{ letterSpacing: "-0.012em" }}
              >
                <option value="">강의 선택 (선택사항)</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {/* 메모 */}
          <div className="border-t border-[var(--color-apple-hairline-soft)]">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="메모 — 제출 형식·범위·페이지 수 등"
              className="w-full resize-y border-0 bg-transparent py-3 text-[14px] leading-[1.55] wght-450 text-[var(--color-apple-ink)] outline-none placeholder:text-[var(--color-apple-muted)]/55"
              style={{ letterSpacing: "-0.012em" }}
            />
          </div>
        </div>

        {error && (
          <p className="rounded-[8px] bg-[var(--color-urgent-soft)] px-3 py-2 text-[12px] wght-560 text-[var(--color-urgent)]">
            {error}
          </p>
        )}

        {/* 액션 — 우측 정렬. 구분선 없이 공백으로 분리 (Apple 톤). */}
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => {
              if (busy) return;
              reset();
              onClose();
            }}
            disabled={busy}
            className="rounded-[8px] px-3.5 py-2 text-[13px] wght-560 text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)] disabled:opacity-50"
            style={{ letterSpacing: "-0.012em" }}
          >
            취소
          </button>
          <button
            type="submit"
            disabled={busy || !kind || !title.trim()}
            className="rounded-[8px] bg-[var(--color-apple-action)] px-4 py-2 text-[13px] wght-620 text-white transition-opacity hover:bg-[var(--color-apple-action-hover)] disabled:opacity-40"
            style={{ letterSpacing: "-0.012em" }}
          >
            {busy ? "저장 중…" : "추가"}
          </button>
        </div>
      </form>
      )}
    </Modal>
  );
}
