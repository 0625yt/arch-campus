"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ContextMenu, type ContextMenuItem, useContextMenu } from "@/components/context-menu";
import { Modal } from "@/components/modal";
import { Popover } from "@/components/popover";
import { validateEventRange } from "@/lib/calendar-event-time";
import { hexTintDark } from "@/lib/course-palette";
import type { EventView } from "@/lib/data/events";
import { formatEventCompact, formatEventLabel } from "@/lib/format-event";
import {
  addDaysToDateKey,
  dateKeyToDayNumber,
  kstDateKey,
  kstDateKeyToIso,
  kstParts,
  kstTimeLabel,
  startOfWeekDateKey,
  weekdayOfDateKey,
} from "@/lib/kst";
import { useIsDark } from "../use-mobile";
import { EventAIDraftPanel } from "./ai-draft-panel";
import { AiEntryCard } from "./ai-entry-card";
import { DayView } from "./views/day-view";
import { eventDisplayDateKeys, startOfWeekKst } from "./views/shared/time-grid";
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

/** 일/주/월/년 단위 캘린더 보기. URL `?scale=`로 선택을 유지한다. */
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
  // URL에 scale이 명시됐는지 — 명시 안 됐을 때만 모바일 자동 week 전환을 적용한다.
  const scaleInUrl = searchParams.get("scale");
  const scaleExplicit =
    scaleInUrl === "day" ||
    scaleInUrl === "week" ||
    scaleInUrl === "month" ||
    scaleInUrl === "year";
  const initialScale: CalendarScale = scaleExplicit ? (scaleInUrl as CalendarScale) : "month";
  // scale 토글 부활 (2026-05-23) — 일/주/월 3옵션 (년은 식갑 숨김).
  // URL ?scale= 동기화로 새로고침·외부 진입 모두 유지.
  const [scale, setScaleState] = useState<CalendarScale>(initialScale);
  function setScale(next: CalendarScale, explicitFocusDate?: string) {
    if ((next === "day" || next === "week") && (scale === "month" || scale === "year")) {
      const today = kstDateKey(new Date());
      const todayParts = kstParts(new Date());
      const fallback =
        scale === "month"
          ? todayParts.year === view.year && todayParts.month - 1 === view.month
            ? today
            : monthStartDateKey(view.year, view.month)
          : todayParts.year === view.year
            ? today
            : `${view.year}-01-01`;
      setFocusDate(explicitFocusDate ?? fallback);
    }
    if ((next === "month" || next === "year") && (scale === "day" || scale === "week")) {
      const [year, month] = focusDate.split("-").map(Number);
      setView({ year, month: month - 1 });
    }
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
    return kstDateKey(new Date());
  });
  function setViewMode(next: "all" | "timetable") {
    setViewModeState(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("view");
    else params.set("view", "timetable");
    // 시간표보기 ON이면 자동 주 뷰. 이미 주/일이면 그대로.
    if (next === "timetable" && scale !== "week") {
      if (scale === "month" || scale === "year") {
        const today = kstDateKey(new Date());
        const now = kstParts(new Date());
        const anchor =
          scale === "month"
            ? now.year === view.year && now.month - 1 === view.month
              ? today
              : monthStartDateKey(view.year, view.month)
            : now.year === view.year
              ? today
              : `${view.year}-01-01`;
        setFocusDate(anchor);
      }
      setScaleState("week");
      params.set("scale", "week");
    }
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : "?");
  }
  const [view, setView] = useState(() => {
    const now = kstParts(new Date());
    return { year: now.year, month: now.month - 1 };
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

  // 모바일 기본 뷰 = 주(week). 데스크톱은 월(month) 유지.
  // 이유: 모바일에서 월 뷰는 6열 셀이 ~50px라 일정 제목이 다 짤려 "외 1"로 무너진다.
  //   주 뷰는 일정이 컬러 블록으로 시간·제목까지 보인다. (사용자 결정 2026-06-05)
  // SSR은 month로 렌더하고 마운트 후 모바일이면 week로 전환 → hydration mismatch 없음.
  // URL에 scale이 명시됐으면(사용자가 직접 고름) 존중하고 자동 전환 안 함.
  const autoWeekAppliedRef = useRef(false);
  useEffect(() => {
    if (scaleExplicit || autoWeekAppliedRef.current) return;
    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    if (isMobile) {
      autoWeekAppliedRef.current = true;
      setScaleState("week");
    }
  }, [scaleExplicit]);
  const [creating, setCreating] = useState(false);
  // 날짜 셀 클릭 시 그 날의 일정을 우측에 모아 봄. 일정 클릭이 우선이면 selected가 덮어씀.
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // 새 일정 추가 시 prefill할 날짜 (YYYY-MM-DD). null이면 기본 오늘.
  const [createPrefillDate, setCreatePrefillDate] = useState<string | null>(null);
  // 드래그로 선택한 종료 날짜 (start와 다르면 end). 단일 클릭이면 null.
  const [createPrefillEndDate, setCreatePrefillEndDate] = useState<string | null>(null);
  // 주/일 뷰의 빈 시간 클릭 시 그 시간으로 바로 새 일정 시작.
  const [createPrefillHour, setCreatePrefillHour] = useState<number | null>(null);

  // 서버 props를 내부 state로 미러링 — optimistic 제거/수정 즉시 반영하기 위함.
  // 서버에서 새 props 도착 시(router.refresh 등) sync.
  const [monthState, setMonthState] = useState(monthEvents);
  const [upcomingState, setUpcomingState] = useState(upcoming);
  useEffect(() => {
    setMonthState((previous) => mergeEventsById(previous, monthEvents));
  }, [monthEvents]);
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
      cur = addDaysToDateKey(cur, 1);
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
  const endDrag = useCallback(() => {
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
    setCreatePrefillHour(null);
    setCreating(true);
  }, [dragEndIso, dragStartIso]);

  // window mouseup으로 드래그 cancel 보장 — 사용자가 셀 밖에서 떼도 정리
  useEffect(() => {
    if (!dragStartIso) return;
    function onUp() {
      // 현재 dragEnd 그대로 endDrag 호출하면 같은 셀 == 클릭이라 무시됨 → 좋음
      endDrag();
    }
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [dragStartIso, endDrag]);

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
              setCreatePrefillEndDate(null);
              setCreatePrefillHour(null);
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
  const visibleRange = useMemo(() => {
    if (scale === "year") {
      return {
        from: `${view.year}-01-01`,
        to: `${view.year + 1}-01-01`,
      };
    }
    if (scale === "month") {
      return {
        from: cells[0]?.iso ?? monthStartDateKey(view.year, view.month),
        to: cells[41]
          ? addDaysToDateKey(cells[41].iso, 1)
          : monthStartDateKey(view.year, view.month + 1),
      };
    }
    if (scale === "week") {
      const from = startOfWeekDateKey(focusDate);
      return { from, to: addDaysToDateKey(from, 7) };
    }
    return { from: focusDate, to: addDaysToDateKey(focusDate, 1) };
  }, [cells, focusDate, scale, view.month, view.year]);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(null);

  const loadVisibleRange = useCallback(
    async (signal?: AbortSignal) => {
      setRangeLoading(true);
      setRangeError(null);
      try {
        const params = new URLSearchParams({
          from: kstDateKeyToIso(visibleRange.from),
          to: kstDateKeyToIso(visibleRange.to),
        });
        const response = await fetch(`/api/events?${params.toString()}`, { signal });
        const json = (await response.json().catch(() => null)) as
          | { ok: true; events: EventView[] }
          | { ok: false; error: string }
          | null;
        if (!response.ok || !json?.ok) {
          setRangeError(json && !json.ok ? json.error : "일정을 불러오지 못했어요.");
          return;
        }
        setMonthState((previous) =>
          replaceEventsInRange(previous, json.events, visibleRange.from, visibleRange.to),
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setRangeError("일정을 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
      } finally {
        if (!signal?.aborted) setRangeLoading(false);
      }
    },
    [visibleRange.from, visibleRange.to],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadVisibleRange(controller.signal);
    return () => controller.abort();
  }, [loadVisibleRange]);
  const monthLabel = useMemo(() => {
    if (scale === "year") return `${view.year}년`;
    if (scale === "month") return `${view.year}년 ${view.month + 1}월`;
    const [year, month, day] = focusDate.split("-").map(Number);
    if (scale === "day") return `${year}년 ${month}월 ${day}일`;
    // 주 뷰: 주 시작일 ~ 끝일
    const startKey = startOfWeekDateKey(focusDate);
    const endKey = addDaysToDateKey(startKey, 6);
    const [startYear, startMonth, startDay] = startKey.split("-").map(Number);
    const [, endMonth, endDay] = endKey.split("-").map(Number);
    const sameMonth = startMonth === endMonth;
    if (sameMonth) {
      return `${startYear}년 ${startMonth}월 ${startDay}–${endDay}일`;
    }
    return `${startMonth}월 ${startDay}일 – ${endMonth}월 ${endDay}일`;
  }, [scale, view, focusDate]);

  // 날짜 → 이벤트 그룹
  const byDate = useMemo(() => {
    const map = new Map<string, EventView[]>();
    for (const e of monthState) {
      for (const key of eventDisplayDateKeys(e)) {
        const list = map.get(key) ?? [];
        list.push(e);
        map.set(key, list);
      }
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
    setFocusDate(addDaysToDateKey(focusDate, step));
  }

  function goToday() {
    const now = kstParts(new Date());
    if (scale === "month" || scale === "year") {
      setView({ year: now.year, month: now.month - 1 });
    }
    setFocusDate(kstDateKey(new Date()));
  }

  return (
    <div className="fade-up fade-up-1 sm:mt-8">
      {/* AiEntryCard는 데스크톱에서만. 모바일은 캘린더 자체에 집중 + 우하단 FAB로 추가 */}
      <div className="hidden sm:block">
        <AiEntryCard
          onOpen={() => {
            setCreatePrefillDate(null);
            setCreatePrefillEndDate(null);
            setCreatePrefillHour(null);
            setCreating(true);
          }}
        />
      </div>
      <section aria-busy={rangeLoading} className="bg-white p-3 sm:elev-1 sm:rounded-[18px] sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2
            className="text-[20px] wght-620 text-[var(--color-apple-ink)] sm:text-[22px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {monthLabel}
          </h2>
          {/* 컨트롤 묶음 — 좁은 폭(아이패드 세로·모바일 가로 등)에서 한 줄을 넘치면
              우측이 잘려 토글·버튼이 사라지던 버그를 막는다. 넘치면 가로 스크롤로 전환해
              모든 컨트롤에 접근 가능. 내부 항목은 shrink-0이라 찌그러지지 않는다.
              스크롤바는 숨기되(scrollbar-width:none) 터치/트랙패드로 밀 수 있다. */}
          <div className="-mx-1 flex max-w-full items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0">
            {/* 모바일 전용 — 자연어 일정 추가. 아이콘만으로 폭 절약. 데스크톱은 본문 상단 카드가 1급. */}
            <button
              type="button"
              onClick={() => {
                setCreatePrefillDate(null);
                setCreatePrefillEndDate(null);
                setCreatePrefillHour(null);
                setCreating(true);
              }}
              aria-label="빠른 일정 추가"
              title="빠른 일정 추가"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-apple-action)] text-white shadow-[0_2px_8px_-2px_rgba(0,113,227,0.35)] transition-transform active:scale-95 sm:hidden"
            >
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none" aria-hidden>
                <title>빠른 일정 추가</title>
                <path
                  d="M6 1.5l1 2.3 2.5.5-1.8 1.7.4 2.5L6 7.3l-2.2 1.2.4-2.5L2.5 4.3l2.5-.5L6 1.5z"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                  fill="currentColor"
                />
              </svg>
            </button>
            <NavButton onClick={() => navigate(-1)} aria-label={`이전 ${scaleLabel(scale)}`}>
              ‹
            </NavButton>
            <button
              type="button"
              onClick={goToday}
              className="inline-flex h-11 items-center rounded-full px-3 text-[13px] wght-560 text-[var(--color-apple-action)] hover:bg-[var(--color-apple-pearl)] sm:h-9 sm:text-[12px]"
            >
              오늘
            </button>
            <NavButton onClick={() => navigate(1)} aria-label={`다음 ${scaleLabel(scale)}`}>
              ›
            </NavButton>
            {/* 스케일 토글 — 일/주/월. 모바일은 폭이 좁아 숨기고 월뷰 고정 (사용자 요구가 모이면 햄버거 메뉴로 이전). */}
            <div className="ml-2 hidden sm:block">
              <ScaleToggle scale={scale} onChange={setScale} />
            </div>
            {/* 뷰 모드 토글 — 시간표만 vs 내 일정. 시간표만 클릭 시 자동 주 뷰.
                모바일에선 공간 부족으로 숨김 — Phase 2 mobile 전용 UI에서 재배치 예정. */}
            <div className="ml-1 hidden sm:block">
              <ViewModeToggle mode={viewMode} onChange={setViewMode} />
            </div>
            {/* 시간표 다시 올리기 — 데스크톱은 텍스트 링크, 모바일은 아이콘 버튼 */}
            <span
              aria-hidden
              className="mx-1 hidden h-4 w-px bg-[var(--color-apple-hairline)] lg:inline-block"
            />
            <Link
              href="/dashboard/calendar/import?kind=syllabus"
              className="hidden h-9 items-center rounded-full bg-[var(--color-apple-ink)] px-3.5 text-[13px] wght-620 text-white shadow-[0_8px_20px_-14px_rgba(20,30,50,0.45)] transition-all hover:-translate-y-px hover:shadow-[0_10px_26px_-14px_rgba(20,30,50,0.5)] lg:inline-flex"
              style={{ letterSpacing: "-0.012em" }}
            >
              강의계획서 일정 가져오기
            </Link>
            <Link
              href="/dashboard/calendar/import?kind=syllabus"
              aria-label="강의계획서 일정 가져오기"
              title="강의계획서 일정 가져오기"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-apple-ink)] text-white shadow-[0_2px_8px_-2px_rgba(20,30,50,0.35)] transition-transform active:scale-95 sm:h-9 sm:w-9 lg:hidden"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
                <title>강의계획서 일정 가져오기</title>
                <path
                  d="M4.25 2.5h5.4L12 4.85v8.65H4.25A1.25 1.25 0 0 1 3 12.25v-8.5A1.25 1.25 0 0 1 4.25 2.5z"
                  stroke="currentColor"
                  strokeWidth="1.35"
                  strokeLinejoin="round"
                />
                <path
                  d="M9.55 2.65V5h2.35M5.25 8h5.5M5.25 10.25h3.3"
                  stroke="currentColor"
                  strokeWidth="1.35"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            <Link
              href="/dashboard/calendar/import?kind=timetable"
              aria-label="시간표 다시 올리기"
              title="시간표 다시 올리기"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)] sm:h-9 sm:w-9 lg:hidden"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <title>시간표 다시 올리기</title>
                <path
                  d="M8 11V3.5M8 3.5l-2.5 2.5M8 3.5l2.5 2.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M3 11.5v.5c0 .8.7 1.5 1.5 1.5h7c.8 0 1.5-.7 1.5-1.5v-.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
            </Link>
            <Link
              href="/dashboard/calendar/import?kind=timetable"
              className="hidden h-9 items-center rounded-full px-3.5 text-[15px] wght-560 text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)] lg:inline-flex"
              style={{ letterSpacing: "-0.012em" }}
            >
              시간표 다시 올리기
            </Link>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 sm:hidden">
          <ScaleToggle scale={scale} onChange={setScale} />
          <ViewModeToggle mode={viewMode} onChange={setViewMode} />
        </div>

        {rangeError && (
          <button
            type="button"
            onClick={() => void loadVisibleRange()}
            className="mt-3 text-left text-[12px] wght-560 text-[var(--color-urgent)]"
          >
            {rangeError} 다시 불러오기
          </button>
        )}

        {scale === "month" && (
          <>
            <ul className="mt-4 grid grid-cols-7 gap-px text-center text-[11.5px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
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
                    interactiveEvents={isDesktop}
                    selectedEventId={selected?.id ?? null}
                    isInDragRange={inDrag}
                    onSelectDay={(anchorRect) => {
                      // 상세(이벤트)나 날짜 패널이 열려 있으면 — 다른 곳을 누른 건 "닫고 싶다"는
                      // 뜻이지 "추가"가 아니다. 먼저 닫기만 하고 끝낸다. 아무것도 안 열린
                      // 상태에서 빈 셀을 눌렀을 때만 일정 추가를 띄운다.
                      if (selected || selectedDate) {
                        setSelected(null);
                        setSelectedDate(null);
                        setSelectedAnchor(null);
                        return;
                      }
                      if (dayEvents.length === 0) {
                        setCreatePrefillDate(cell.iso);
                        setCreatePrefillEndDate(null);
                        setCreatePrefillHour(null);
                        setCreating(true);
                        return;
                      }
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
              // 상세가 열려 있으면 빈 시간 클릭은 "닫기"로 해석 — 추가 모달 안 띄움.
              if (selected || selectedDate) {
                setSelected(null);
                setSelectedDate(null);
                setSelectedAnchor(null);
                return;
              }
              setCreatePrefillDate(dateKey);
              setCreatePrefillEndDate(null);
              setCreatePrefillHour(hour);
              setCreating(true);
            }}
          />
        )}

        {scale === "day" && (
          <DayView
            dateKey={focusDate}
            events={monthState}
            viewMode={viewMode}
            onSelectEvent={(e, rect) => {
              setSelected(e);
              setSelectedAnchor(rect);
              setSelectedDate(null);
            }}
            onSelectEmpty={(dateKey, hour) => {
              // 상세가 열려 있으면 빈 시간 클릭은 "닫기"로 해석 — 추가 모달 안 띄움.
              if (selected || selectedDate) {
                setSelected(null);
                setSelectedDate(null);
                setSelectedAnchor(null);
                return;
              }
              setCreatePrefillDate(dateKey);
              setCreatePrefillEndDate(null);
              setCreatePrefillHour(hour);
              setCreating(true);
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
              setScale("day", dateKey);
            }}
          />
        )}
      </section>

      {/* 모바일 전용 FAB — 일정 추가. AiEntryCard 자리를 대체.
          MobileTabBar(h-14) 위에 떠서 겹치지 않게 bottom 계산. */}
      <button
        type="button"
        onClick={() => {
          setCreatePrefillDate(null);
          setCreatePrefillEndDate(null);
          setCreatePrefillHour(null);
          setCreating(true);
        }}
        aria-label="일정 추가"
        className="fixed right-4 z-30 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-apple-action)] text-white shadow-[0_6px_20px_-4px_rgba(0,113,227,0.5)] transition-transform active:scale-95 sm:hidden"
        style={{ bottom: "calc(72px + env(safe-area-inset-bottom))" }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
          <title>일정 추가</title>
          <path
            d="M10 4v12M4 10h12"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>

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
                  setCreatePrefillEndDate(null);
                  setCreatePrefillHour(null);
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
                setCreatePrefillEndDate(null);
                setCreatePrefillHour(null);
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
        prefillHour={createPrefillHour}
        onClose={() => {
          setCreating(false);
          setCreatePrefillDate(null);
          setCreatePrefillEndDate(null);
          setCreatePrefillHour(null);
        }}
        onCreated={() => {
          setCreating(false);
          setCreatePrefillDate(null);
          setCreatePrefillEndDate(null);
          setCreatePrefillHour(null);
          void loadVisibleRange();
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
}: {
  scale: CalendarScale;
  onChange: (s: CalendarScale) => void;
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
      className="inline-flex items-center gap-0.5 rounded-[8px] bg-[var(--color-apple-pearl)] p-0.5"
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
            className={`inline-flex h-11 min-w-11 items-center justify-center rounded-[6px] px-2 text-[12px] transition-all sm:h-9 sm:min-w-9 ${
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
}: {
  mode: "all" | "timetable";
  onChange: (m: "all" | "timetable") => void;
}) {
  const opts: Array<{ value: "all" | "timetable"; label: string }> = [
    { value: "all", label: "내 일정" },
    { value: "timetable", label: "시간표만" },
  ];
  return (
    <div
      role="tablist"
      aria-label="보기 모드"
      className="inline-flex items-center gap-0.5 rounded-[8px] bg-[var(--color-apple-pearl)] p-0.5"
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
            className={`inline-flex h-11 items-center justify-center rounded-[6px] px-2.5 text-[12px] transition-all sm:h-9 ${
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
      className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[16px] text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)] sm:h-9 sm:w-9 sm:text-[15px]"
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
  interactiveEvents,
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
  /** 모바일은 날짜 전체를 눌러 큰 목록에서 선택하고, 데스크톱만 작은 칩을 직접 누른다. */
  interactiveEvents: boolean;
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

  // 셀에 직접 글씨로 보여줄 일정 최대 개수. 나머지는 "+N개 더"로 접고 날짜 탭 시 전체.
  const maxChips = interactiveEvents ? 4 : 3;

  function handleDayClick(e: React.MouseEvent<HTMLButtonElement>) {
    // 데스크톱 popover가 이 셀 옆에 자리 잡도록 셀 자체의 DOMRect를 전달.
    // (anchorRect 없이 호출하면 popover가 화면 밖으로 밀려 빈 셀 클릭 시 안 뜸.)
    const rect =
      e.currentTarget.parentElement?.getBoundingClientRect() ??
      e.currentTarget.getBoundingClientRect();
    onSelectDay?.(rect);
  }

  function handleDayContext(e: React.MouseEvent) {
    // 칩에서 발생한 우클릭은 ChipButton이 stopPropagation으로 막음. 빈 영역만 통과.
    e.preventDefault();
    e.stopPropagation();
    onContextDay?.({ x: e.clientX, y: e.clientY });
  }

  function handleMouseDown(e: React.MouseEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
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
      // 모바일은 64px — iPhone 14 (844 - topbar 48 - tabbar 56 - 헤더 60 ≈ 680) ÷ 6주 = 약 113px 여유, 64×6 = 384px라 한 달이 풀스크린에 들어옴.
      // 데스크톱은 118px 그대로.
      className={`relative flex min-h-[64px] flex-col gap-[1px] px-0.5 pt-0.5 pb-0 transition-all duration-200 sm:min-h-[118px] sm:px-0.5 sm:pt-1 sm:pb-0.5 ${
        cell.inMonth ? "" : "opacity-40"
      } ${isSelected ? "ring-1 ring-inset ring-[var(--color-apple-action)]" : ""} ${
        isInDragRange ? "ring-2 ring-inset ring-[var(--color-apple-action)]" : ""
      }`}
    >
      <button
        type="button"
        data-day-bg
        aria-label={`${cell.date.getUTCMonth() + 1}월 ${cell.date.getUTCDate()}일, 일정 ${events.length}개${events.length > 0 ? `: ${events.slice(0, 3).map(formatEventCompact).join(", ")}` : ""}`}
        onClick={handleDayClick}
        onContextMenu={handleDayContext}
        onMouseDown={handleMouseDown}
        onMouseEnter={handleMouseEnter}
        onMouseUp={handleMouseUp}
        className="absolute inset-0 z-0 cursor-pointer outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-apple-action)]"
        style={{
          backgroundColor: isInDragRange
            ? "var(--color-apple-action-soft, #e6f0ff)"
            : cell.isToday
              ? "var(--color-surface-cream)"
              : "var(--color-day-cell)",
        }}
      />
      <span
        className={`pointer-events-none relative z-[1] self-end text-[12px] wght-450 tabular-nums ${
          cell.isToday
            ? "rounded-full bg-[var(--color-apple-action)] px-1.5 py-0.5 text-white"
            : "text-[var(--color-apple-muted)]"
        }`}
      >
        {cell.date.getUTCDate()}
      </span>
      {/* 일정 — 모바일·데스크톱 모두 글씨 칩으로. 좁은 셀에선 이름이 …로 잘리되
          "무슨 일정인지" 글자로 보이게(사용자 요청: 점 말고 글씨로 최대한 다).
          모바일은 셀이 낮아 최대 3개, 데스크톱은 4개까지 + 나머지는 "+N개 더". */}
      <ul className="pointer-events-none relative z-[1] flex min-w-0 flex-col gap-px">
        {events.slice(0, maxChips).map((e) => {
          const fullLabel = formatEventLabel(e);
          const shortLabel = formatEventCompact(e);
          const color = eventColor(e);
          const isSelectedEvent = selectedEventId === e.id;
          if (e.allDay) {
            // 하루 종일 — 배경 흐릿 + 흰 텍스트 톤
            return (
              <li key={e.id} className={interactiveEvents ? "pointer-events-auto" : undefined}>
                <EventChip
                  event={e}
                  selected={isSelectedEvent}
                  allDay
                  color={color}
                  label={shortLabel}
                  title={fullLabel}
                  interactive={interactiveEvents}
                  onClick={(rect) => onSelectEvent?.(e, rect)}
                  onContext={(pos) => onContextEvent?.(e, pos)}
                />
              </li>
            );
          }
          return (
            <li key={e.id} className={interactiveEvents ? "pointer-events-auto" : undefined}>
              <EventChip
                event={e}
                selected={isSelectedEvent}
                allDay={false}
                color={color}
                label={shortLabel}
                title={fullLabel}
                interactive={interactiveEvents}
                onClick={(rect) => onSelectEvent?.(e, rect)}
                onContext={(pos) => onContextEvent?.(e, pos)}
              />
            </li>
          );
        })}
        {events.length > maxChips && (
          <li
            className="truncate pl-1 text-[10px] wght-560 text-[var(--color-apple-muted)] sm:pt-0.5 sm:text-[11px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            + {events.length - maxChips}개 더
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
  interactive,
  onClick,
  onContext,
}: {
  event: EventView;
  selected?: boolean;
  allDay: boolean;
  color: string;
  label: string;
  title?: string;
  interactive: boolean;
  /** anchorRect: 칩 자체의 DOMRect — popover가 옆에 자리 잡을 좌표 */
  onClick: (anchorRect: DOMRect) => void;
  onContext?: (pos: { x: number; y: number }) => void;
}) {
  void event;

  const isDark = useIsDark();
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

  if (!interactive) {
    if (allDay) {
      return (
        <span
          aria-hidden
          title={title}
          className="block w-full overflow-hidden whitespace-nowrap text-clip rounded-[3px] px-[3px] py-0 text-left text-[11px] wght-560 leading-[1.4]"
          style={{
            backgroundColor: selected
              ? isDark
                ? hexTintDark(color, true)
                : toAlpha(color, 0.9)
              : isDark
                ? toAlpha(hexTintDark(color, false), 0.28)
                : toAlpha(color, 0.18),
            color: selected ? "white" : isDark ? "white" : "var(--color-apple-ink)",
            letterSpacing: "-0.03em",
          }}
        >
          {label}
        </span>
      );
    }
    return (
      <span
        aria-hidden
        title={title}
        className={`relative flex w-full items-center rounded-[3px] px-1 py-0 text-left text-[11px] leading-[1.4] ${selected ? "wght-700" : "wght-450"}`}
        style={{
          backgroundColor: selected
            ? isDark
              ? toAlpha(hexTintDark(color, false), 0.2)
              : toAlpha(color, 0.12)
            : "transparent",
          color: "var(--color-apple-ink)",
          letterSpacing: "-0.03em",
        }}
      >
        <span className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-clip">{label}</span>
      </span>
    );
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
        className="block w-full overflow-hidden whitespace-nowrap text-clip rounded-[3px] px-[3px] py-0 text-left text-[11px] wght-560 leading-[1.4] transition-all duration-150 hover:brightness-105 active:scale-[0.98] sm:rounded-[4px] sm:px-1 sm:text-[12px] sm:leading-[1.55]"
        style={{
          // 다크: 라이트 파스텔을 alpha로 깔면 진흙 → hue 기반 진한 색으로 재구성(셀과 동일).
          backgroundColor: selected
            ? isDark
              ? hexTintDark(color, true)
              : toAlpha(color, 0.9)
            : isDark
              ? toAlpha(hexTintDark(color, false), 0.28)
              : toAlpha(color, 0.18),
          color: selected ? "white" : isDark ? "white" : "var(--color-apple-ink)",
          letterSpacing: "-0.03em",
        }}
      >
        {label}
      </button>
    );
  }
  // 시간 지정 — 글자만(좌측 색 세로 bar 제거. 사용자 요청: 세로선 빼고 글자 최대한).
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
      className={`group relative flex w-full items-center rounded-[3px] px-1 py-0 text-left text-[11px] leading-[1.4] transition-all duration-150 hover:bg-[var(--color-apple-pearl)] active:scale-[0.98] sm:rounded-[4px] sm:text-[12px] sm:leading-[1.55] ${
        selected ? "wght-700" : "wght-450"
      }`}
      style={{
        backgroundColor: selected
          ? isDark
            ? toAlpha(hexTintDark(color, false), 0.2)
            : toAlpha(color, 0.12)
          : "transparent",
        color: "var(--color-apple-ink)",
        letterSpacing: "-0.03em",
      }}
    >
      {/* 한 줄 유지 + "…" 없이 글자 최대한 — 넘치면 끝에서 그냥 잘림(ellipsis 안 붙임).
          whitespace-nowrap + overflow-hidden만, text-ellipsis는 빼서 점 세 개 제거. */}
      <span className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-clip">{label}</span>
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
      if (target && sheetRef.current?.contains(target)) return;
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
      <div className="pointer-events-none absolute inset-y-6 right-6 hidden w-[380px] md:block lg:w-[400px]">
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
          animation:
            dragOffset === 0
              ? "calInspectorSlideInUp 240ms cubic-bezier(0.22, 1, 0.36, 1)"
              : undefined,
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

  const date = kstParts(event.startsAt);
  const days =
    dateKeyToDayNumber(kstDateKey(event.startsAt)) - dateKeyToDayNumber(kstDateKey(new Date()));
  const dDayLabel = !mounted ? "" : days === 0 ? "오늘" : days < 0 ? `D+${-days}` : `D-${days}`;
  const accent = eventColor(event);

  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.weekday];

  // 시간 — Apple Inspector는 시간을 큰 타이포로 강조. 종일·구간 일정도 같은 자리.
  const timeStart = event.allDay ? "종일" : kstTimeLabel(event.startsAt);
  const endDate = event.endsAt ? event.endsAt : null;
  const timeEnd = endDate && !event.allDay ? kstTimeLabel(endDate) : null;
  const dateLine = `${date.month}월 ${date.day}일 ${weekday}요일`;

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
          <InspectorIconButton ariaLabel="수정" onClick={() => setEditing(true)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <title>수정</title>
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
              <title>삭제</title>
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

          {/* 위치 — 실제 저장·조회가 끝까지 연결된 정보만 노출한다. */}
          {event.location && (
            <ul className="mt-4 flex flex-col gap-1.5">
              <li
                className="text-[12.5px] wght-450 text-[var(--color-apple-ink)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                <span className="text-[var(--color-apple-muted)]">위치 </span>
                {event.location}
              </li>
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

          {(event.sourceMaterialId || event.sourceMaterialTitle || event.confidence != null) && (
            <div className="mt-6 rounded-[12px] bg-[var(--color-apple-pearl)] px-4 py-4">
              <p
                className="text-[11.5px] wght-700 text-[var(--color-apple-muted)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                자료 근거
              </p>
              <dl className="mt-3 grid gap-2">
                <EvidenceLine
                  label="출처"
                  value={
                    event.sourceMaterialTitle ??
                    (event.sourceMaterialId
                      ? "자료에서 찾은 일정"
                      : event.confirmed
                        ? "직접 확인한 일정"
                        : "직접 입력한 일정")
                  }
                />
                {event.notes && <EvidenceLine label="메모" value={event.notes} />}
                <EvidenceLine
                  label="상태"
                  value={
                    event.confirmed
                      ? "확인됨"
                      : event.confidence != null && event.confidence < 0.85
                        ? "확인 필요"
                        : "검토 전"
                  }
                  tone={
                    !event.confirmed
                      ? "var(--color-tint-assign-ink)"
                      : "var(--color-tint-class-ink)"
                  }
                />
                {event.confidence != null && (
                  <EvidenceLine label="확신도" value={`${Math.round(event.confidence * 100)}%`} />
                )}
              </dl>
            </div>
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
              <ScopeBtn
                label="이 회차만"
                active={deleteScope === "this"}
                onClick={() => setDeleteScope("this")}
              />
              <ScopeBtn
                label="학기 전체"
                active={deleteScope === "all"}
                onClick={() => setDeleteScope("all")}
              />
            </div>
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}

function EvidenceLine({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="grid grid-cols-[48px_1fr] gap-3">
      <dt
        className="text-[11.5px] wght-560 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {label}
      </dt>
      <dd
        className="min-w-0 text-[12.5px] leading-[1.45] wght-560 text-[var(--color-apple-ink)]"
        style={{ letterSpacing: "-0.012em", color: tone }}
      >
        {value}
      </dd>
    </div>
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
          ? "inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-urgent-soft)] hover:text-[var(--color-urgent)]"
          : "inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]"
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
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][weekdayOfDateKey(dateIso)];
  const days = dateKeyToDayNumber(dateIso) - dateKeyToDayNumber(kstDateKey(new Date()));
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
            const tlabel = e.allDay ? "종일" : kstTimeLabel(e.startsAt);
            const accent = eventColor(e);
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onSelectEvent(e)}
                  className="-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-3 rounded-[7px] px-2 py-2 text-left transition-colors hover:bg-[var(--color-apple-pearl)]"
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
        className="mt-4 inline-flex min-h-11 items-center gap-1 pr-3 text-[13px] wght-560 text-[var(--color-apple-action)] transition-opacity hover:opacity-70"
        style={{ letterSpacing: "-0.012em" }}
      >
        <span aria-hidden className="text-[15px] leading-none">
          +
        </span>
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

      const rangeError = validateEventRange(
        (body.starts_at as string | undefined) ?? event.startsAt,
        body.ends_at !== undefined ? (body.ends_at as string | null) : event.endsAt,
      );
      if (rangeError) {
        setError(rangeError);
        return;
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
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-apple-action)] transition-colors hover:bg-[var(--color-apple-action-soft)] disabled:opacity-40"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <title>저장</title>
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
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)] disabled:opacity-40"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <title>취소</title>
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
              <ScopeBtn
                label="이 회차만"
                active={scope === "this"}
                onClick={() => setScope("this")}
              />
              <ScopeBtn
                label="학기 전체"
                active={scope === "all"}
                onClick={() => setScope("all")}
              />
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

function buildMonthCells(year: number, month: number): MonthCell[] {
  const firstDay = new Date(Date.UTC(year, month, 1));
  const startWeekday = firstDay.getUTCDay();
  const start = new Date(Date.UTC(year, month, 1 - startWeekday));
  const todayKey = kstDateKey(new Date());

  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const iso = isoDate(d);
    cells.push({
      date: d,
      iso,
      inMonth: d.getUTCMonth() === month,
      isToday: iso === todayKey,
    });
  }
  return cells;
}

function monthStartDateKey(year: number, zeroBasedMonth: number): string {
  const date = new Date(Date.UTC(year, zeroBasedMonth, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function mergeEventsById(previous: EventView[], incoming: EventView[]): EventView[] {
  const byId = new Map(previous.map((event) => [event.id, event]));
  for (const event of incoming) byId.set(event.id, event);
  return [...byId.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

function replaceEventsInRange(
  previous: EventView[],
  incoming: EventView[],
  fromDateKey: string,
  toDateKey: string,
): EventView[] {
  const outsideRange = previous.filter((event) => {
    const start = kstDateKey(event.startsAt);
    const end = event.endsAt ? kstDateKey(event.endsAt) : start;
    return !(start < toDateKey && end >= fromDateKey);
  });
  return mergeEventsById(outsideRange, incoming);
}

/** 종일 다일 일정은 시작일 한 칸에만 숨지 않고 걸쳐 있는 모든 날짜에 표시한다. */
function scaleLabel(scale: CalendarScale): string {
  if (scale === "day") return "날짜";
  if (scale === "week") return "주";
  if (scale === "year") return "연도";
  return "달";
}

function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 색 fallback — courseColor가 우선, 없으면 kind 기준 채도 낮은 컬러.
 * (이전 버전의 kindTint/KIND_TINT 파스텔 배경은 인스펙터 재설계에서 닷·뱃지와 함께 제거됨.)
 */
export const KIND_FALLBACK_COLOR: Record<EventView["kind"], string> = {
  exam: "#e0445e", // coral
  assignment: "#cca06b", // mustard
  presentation: "#7aa6d6", // cobalt
  class: "#7fb38c", // sage
  etc: "#a08bc4", // mauve
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
 * 테마 인지 이벤트 색 — 라이트는 원색(파스텔) 그대로, 다크는 hue 기반 밝은 액센트로.
 *
 * 캘린더 month/week/day 뷰가 `toAlpha(color, 0.18)` 배경 + `borderLeft: solid color`로
 * 칠하는데, 라이트 파스텔(명도 95+)은 다크 배경에서 옅고 둥둥 떠 보인다. 다크에선
 * 같은 hue를 S55 L58로 끌어올려(hexTintDark bg=false) 또렷한 액센트로 만든다.
 */
export function eventColorThemed(e: EventView, isDark: boolean): string {
  const base = eventColor(e);
  return isDark ? hexTintDark(base, false) : base;
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
  prefillHour,
  onClose,
  onCreated,
}: {
  open: boolean;
  courses: CourseOption[];
  /** "YYYY-MM-DD" — 캘린더에서 특정 날짜 선택 후 추가 흐름. null이면 오늘. */
  prefillDateIso?: string | null;
  /** 드래그로 잡은 종료 날짜 — start와 다르면 사용자가 범위 잡은 것 */
  prefillEndDateIso?: string | null;
  /** 주/일 시간 그리드에서 빈 칸을 눌렀을 때의 KST 시각. */
  prefillHour?: number | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const defaultStart = useMemo(() => {
    // 월 뷰는 기본 21:00, 주/일 시간 칸은 클릭한 KST 시각으로 시작.
    const hour = Math.min(23, Math.max(0, prefillHour ?? 21));
    const pad = (n: number) => String(n).padStart(2, "0");
    if (prefillDateIso && /^\d{4}-\d{2}-\d{2}$/.test(prefillDateIso)) {
      return `${prefillDateIso}T${pad(hour)}:00`;
    }
    const todayKstMs = Date.now() + 9 * 60 * 60 * 1000;
    const todayKst = new Date(todayKstMs);
    return `${todayKst.getUTCFullYear()}-${pad(todayKst.getUTCMonth() + 1)}-${pad(todayKst.getUTCDate())}T${pad(hour)}:00`;
  }, [prefillDateIso, prefillHour]);

  const defaultEnd = useMemo(() => {
    const pad = (n: number) => String(n).padStart(2, "0");
    if (prefillEndDateIso && /^\d{4}-\d{2}-\d{2}$/.test(prefillEndDateIso)) {
      // 드래그로 범위 잡은 경우 — 끝 날짜 22:00 (1시간)
      return `${prefillEndDateIso}T22:00`;
    }
    if (prefillDateIso && prefillHour != null) {
      const endHour = prefillHour >= 23 ? "23:59" : `${pad(Math.max(0, prefillHour + 1))}:00`;
      return `${prefillDateIso}T${endHour}`;
    }
    return "";
  }, [prefillDateIso, prefillEndDateIso, prefillHour]);

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
      const rangeError = validateEventRange(startsIso, endsIso);
      if (rangeError) {
        setError(rangeError);
        return;
      }

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
      if (color) body.color = color;

      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "일정을 추가하지 못했어요.");
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
      // manual 모드: chromeless로 통일 — macOS Calendar 새 이벤트 popover처럼 그릇 없이 콘텐츠가 헤더.
      // 사용자 요청 (2026-05-23): "폼 좀 더 타이트하게" — 440px sm 사이즈로 압축.
      chromeless
      size="sm"
      title="새 일정"
    >
      {mode === "ai" ? (
        <EventAIDraftPanel
          courses={courses}
          onClose={() => {
            if (busy) return;
            reset();
            onClose();
          }}
          onDone={(info) => {
            // 부분 실패: 모달 유지(reset X)·캘린더만 새로고침. 사용자는 실패한 항목 보고 다시 시도 가능.
            // 전부 성공: 종전 동작 — reset + 닫기 + 새로고침.
            if (info?.partial) {
              onCreated();
              return;
            }
            reset();
            onCreated();
          }}
          onSwitchToManual={() => setMode("manual")}
        />
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 px-5 py-5">
          {/* 사용자 강요 (2026-05-23): "라벨 컬럼 만들지 마. Apple식 placeholder-only flowing form".
            Apple Calendar 새 이벤트 popover처럼 — 라벨 없이 placeholder만으로 의도 전달. */}

          {/* 제목 — borderless display input. 가장 큰 위계. */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={120}
            placeholder="새 일정"
            className="w-full border-0 bg-transparent p-0 text-[18px] leading-[1.2] wght-700 text-[var(--color-apple-ink)] outline-none placeholder:wght-450 placeholder:text-[var(--color-apple-muted)]/55"
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
            <div className="flex items-center justify-between border-t border-[var(--color-apple-hairline-soft)] py-2.5">
              <span
                className="text-[13.5px] wght-450 text-[var(--color-apple-ink)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                종일
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={allDay}
                onClick={() => setAllDay((v) => !v)}
                className={`relative inline-flex h-[20px] w-[32px] flex-shrink-0 items-center rounded-full transition-colors ${
                  allDay ? "bg-[var(--color-apple-action)]" : "bg-[var(--color-apple-hairline)]"
                }`}
              >
                <span
                  className={`inline-block h-[16px] w-[16px] transform rounded-full bg-white shadow transition-transform ${
                    allDay ? "translate-x-[14px]" : "translate-x-[2px]"
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
                className="w-full border-0 bg-transparent py-2.5 text-[13.5px] tabular-nums text-[var(--color-apple-ink)] outline-none"
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
                className="w-full border-0 bg-transparent py-2.5 text-[13.5px] tabular-nums text-[var(--color-apple-ink)] outline-none placeholder:wght-450 placeholder:text-[var(--color-apple-muted)]/55"
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
                className="w-full border-0 bg-transparent py-2.5 text-[13.5px] wght-450 text-[var(--color-apple-ink)] outline-none placeholder:text-[var(--color-apple-muted)]/55"
                style={{ letterSpacing: "-0.012em" }}
              />
            </div>
            {/* 색상 — 자동(코스/카테고리 색) + 6개 팔레트. 좌측 점 X — 우측 정렬 swatch row. */}
            <div className="flex items-center justify-between border-t border-[var(--color-apple-hairline-soft)] py-2.5">
              <span
                className="text-[13.5px] wght-450 text-[var(--color-apple-ink)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                색상
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setColor("")}
                  aria-label="자동 색상"
                  className={`relative inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border text-[9px] wght-560 transition-colors ${
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
                      className={`inline-flex h-[18px] w-[18px] items-center justify-center rounded-full transition-all ${
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
                  className="w-full appearance-none border-0 bg-transparent py-2.5 text-[13.5px] wght-450 text-[var(--color-apple-ink)] outline-none"
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
                rows={2}
                maxLength={2000}
                placeholder="메모 — 제출 형식·범위·페이지 수 등"
                className="w-full resize-none border-0 bg-transparent py-2.5 text-[13.5px] leading-[1.5] wght-450 text-[var(--color-apple-ink)] outline-none placeholder:text-[var(--color-apple-muted)]/55"
                style={{ letterSpacing: "-0.012em" }}
              />
            </div>
          </div>

          {error && (
            <p className="rounded-[8px] bg-[var(--color-urgent-soft)] px-3 py-2 text-[12px] wght-560 text-[var(--color-urgent)]">
              {error}
            </p>
          )}

          {/* 액션 — macOS Calendar 새 이벤트 popover 톤. 좌측 취소(텍스트 링크), 우측 "추가" pill 액션.
            사용자 피드백 (2026-05-23): 양쪽 모두 회색 박스라 어색 → 취소는 borderless 텍스트로, 추가는 그대로. */}
          <div className="-mx-1 mt-1 flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                if (busy) return;
                reset();
                onClose();
              }}
              disabled={busy}
              className="rounded-[6px] px-2 py-1 text-[13px] wght-450 text-[var(--color-apple-muted)] transition-colors hover:text-[var(--color-apple-ink)] disabled:opacity-50"
              style={{ letterSpacing: "-0.012em" }}
            >
              취소
            </button>
            <button
              type="submit"
              disabled={busy || !kind || !title.trim()}
              className="rounded-full bg-[var(--color-apple-action)] px-4 py-1.5 text-[13px] wght-620 text-white transition-opacity hover:bg-[var(--color-apple-action-hover)] disabled:opacity-40"
              style={{ letterSpacing: "-0.012em" }}
            >
              {busy ? "추가 중…" : "추가"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
