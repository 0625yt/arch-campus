"use client";

import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  Clock3,
  FileText,
  MapPin,
} from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { courseAccentRgb, courseTint, courseTintDark } from "@/lib/course-palette";
import type { CourseListItem } from "@/lib/data/materials";
import { buildTimetable, type CourseSlot, isKstToday, type Weekday } from "@/lib/timetable-grid";
import styles from "./campus.module.css";
import timetableStyles from "./timetable-hero.module.css";
import { useIsDark } from "./use-mobile";

/**
 * Dashboard 시간표 hero — 컨테이너 100% fit. 한 화면 안에 들어옴.
 *
 * 구조:
 *   - 부모(page)가 `flex-1` height 줘서 100% 채움.
 *   - 내부는 flex-col: 토글 행 + grid (flex-1).
 *   - grid는 단일 grid: header row(40px) + rowCount × 1fr.
 *   - 강의 칸·hairline·시간 라벨 모두 grid template 안에 정확히 배치.
 *
 * 시각:
 *   - 진행 중 강의 now-glow (절제된 2.4s breathe)
 *   - 현재 시각 가로 라인 (1분 단위 갱신, KST 기준)
 *   - 한 주·오늘·목록으로 전환하며 강의실까지 확인
 */

const DAY_LABELS_KO: Record<Weekday, string> = {
  MON: "월",
  TUE: "화",
  WED: "수",
  THU: "목",
  FRI: "금",
  SAT: "토",
  SUN: "일",
};

const HEADER_PX = 32;
const GUTTER_PX_MOBILE = 36;
const GUTTER_PX_DESKTOP = 44;
/** 첫(09:00)·끝 시간 라벨이 헤더/하단 경계에 안 먹히게 콘텐츠 상하 여백. */
const BODY_PAD_PX = 10;
/** 강의명·강의실이 들어가는 최소 높이. 짧은 화면에서는 읽기 가능한 크기로 스크롤. */
const FLOOR_HOUR_PX = 48;
const CORE_WEEKDAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI"];

/* ─────────────────────────── Public API ─────────────────────────── */

/** 페이지 상단에 박는 heading + now readout — heading은 grid 밖에서 작은 라인으로. */
export function TimetableHeading({
  courses,
  studentName,
}: {
  courses: CourseListItem[];
  studentName: string | null;
}) {
  const semesterCourses = courses.filter((course) => course.category === "semester");
  const materialCount = courses.reduce((count, course) => count + course.materialCount, 0);
  const greeting = studentName ? `${studentName}님의 이번 주` : "이번 주";

  return (
    <header className={styles.heading}>
      <div>
        <h1 className={styles.title}>{greeting}</h1>
        <p className={styles.subtitle}>
          {semesterCourses.length > 0
            ? "수업부터 마감까지, 이번 주의 흐름을 한눈에"
            : "이번 학기, 나만의 공부 리듬을 만드는 곳"}
        </p>
      </div>
      {courses.length > 0 && (
        <div className={styles.summary}>
          <span>
            <strong>{semesterCourses.length}</strong> 강의
          </span>
          <span>
            <strong>{materialCount}</strong> 자료
          </span>
        </div>
      )}
    </header>
  );
}

export function TimetableHero({
  courses,
  now,
  onPickCourse,
}: {
  courses: CourseListItem[];
  now: Date;
  onPickCourse: (course: CourseListItem) => void;
}) {
  const semester = useMemo(() => courses.filter((c) => c.category === "semester"), [courses]);
  const data = useTimetableData(courses);

  if (data.slots.length === 0) {
    return <EmptyTimetableHero hasCourses={courses.length > 0} />;
  }

  return (
    <TimetableGrid
      data={data}
      now={now}
      onPickCourse={(slot) => {
        const course = semester.find((c) => c.id === slot.courseId);
        if (course) onPickCourse(course);
      }}
    />
  );
}

/* ─────────────────────────── Hooks ─────────────────────────── */

function useTimetableData(courses: CourseListItem[]) {
  return useMemo(() => {
    const semester = courses.filter((c) => c.category === "semester");
    return buildTimetable(
      semester.map((c) => ({
        id: c.id,
        name: c.name,
        professor: c.professor,
        location: c.location ?? null,
        color: c.color,
        schedule: c.schedule,
      })),
    );
  }, [courses]);
}

/** 요소의 실제 높이를 ResizeObserver로 추적 — 시간당 픽셀 동적 계산용. */
function useMeasuredHeight() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setHeight(el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, height };
}

/* ─────────────────────────── Grid ─────────────────────────── */

type View = "week" | "today" | "list";

function TimetableGrid({
  data,
  now,
  onPickCourse,
}: {
  data: ReturnType<typeof buildTimetable>;
  now: Date;
  onPickCourse: (slot: CourseSlot) => void;
}) {
  // 첫 진입은 항상 "한 주" 뷰. 모바일이라고 today로 강제하지 않는다 —
  // 예전엔 리사이즈/마운트마다 setView로 today로 튕겨, 주 뷰로 바꿔도 되돌아왔음.
  // 모바일에서 오늘만 보고 싶으면 사용자가 "오늘만" pill로 직접 전환.
  const [view, setView] = useState<View>("week");
  const [isMobile, setIsMobile] = useState(false);
  const isDark = useIsDark();
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const displayWeekdays = useMemo<Weekday[]>(() => {
    const activeWeekend = data.activeWeekdays.filter(
      (weekday) => weekday === "SAT" || weekday === "SUN",
    );
    return [...CORE_WEEKDAYS, ...activeWeekend];
  }, [data.activeWeekdays]);

  const todayWeekday = useMemo<Weekday | null>(() => {
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const js = kst.getUTCDay();
    const order: Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    const w = order[js];
    return displayWeekdays.includes(w) ? w : null;
  }, [displayWeekdays, now]);

  const shownDays = useMemo<Weekday[]>(() => {
    if (view === "today") {
      return todayWeekday ? [todayWeekday] : [CORE_WEEKDAYS[0]];
    }
    return displayWeekdays;
  }, [view, todayWeekday, displayWeekdays]);

  const hourStart = data.hourStart;
  const hourEnd = data.hourEnd;
  const hourSpan = hourEnd - hourStart;
  const totalMinutes = hourSpan * 60;
  const minuteOffset = hourStart * 60;
  const gutterPx = isMobile ? GUTTER_PX_MOBILE : GUTTER_PX_DESKTOP;

  // Body 가용 높이 측정 → 시간당 픽셀(HOUR_PX)을 동적으로.
  //   기본: 강의 범위(hourSpan)를 컨테이너에 꽉 맞춰 "한 화면에 다 보임" (스크롤 0).
  //   예외: 컨테이너가 극단적으로 작아 셀이 FLOOR_HOUR_PX보다 작아질 때만 스크롤로 빠짐.
  const { ref: bodyRef, height: bodyH } = useMeasuredHeight();
  const usableH = Math.max(0, bodyH - BODY_PAD_PX * 2);
  const fitHourPx = usableH > 0 ? usableH / hourSpan : FLOOR_HOUR_PX;
  const hourPx = Math.max(FLOOR_HOUR_PX, fitHourPx);
  const bodyContentPx = hourPx * hourSpan + BODY_PAD_PX * 2;

  // 현재 시각 — KST.
  const kst = useMemo(() => new Date(now.getTime() + 9 * 60 * 60 * 1000), [now]);
  const nowMin = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  const nowLabel = `${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`;
  const nowInRange = nowMin >= minuteOffset && nowMin <= minuteOffset + totalMinutes;
  // 현재 시각을 body 콘텐츠 높이 비율(0~1)로.
  const nowFrac = nowInRange ? (nowMin - minuteOffset) / totalMinutes : null;
  const todayColumn = shownDays.findIndex((weekday) => isKstToday(weekday, now));

  // 오늘 보이는 강의들의 첫 시작 픽셀 — 자동 스크롤이 강의를 가리지 않게 하는 기준.
  const firstSlotTopPx = useMemo(() => {
    const todaySlots = data.slots.filter((s) => shownDays.includes(s.slot.weekday));
    if (todaySlots.length === 0) return null;
    const earliest = Math.min(...todaySlots.map((s) => s.slot.startMinute));
    return BODY_PAD_PX + ((earliest - minuteOffset) / 60) * hourPx;
  }, [data.slots, shownDays, minuteOffset, hourPx]);

  // 자동 스크롤 — "지금" 위치로 가되, 강의가 화면 밖으로 밀려나지 않게 clamp.
  //   문제였던 케이스: 현재 시각이 모든 강의보다 늦으면(오늘 일정 마무리) "지금"이 콘텐츠
  //   하단이라, 스크롤이 빈 곳으로 내려가 강의가 통째로 안 보였다(시간표 "날아감").
  //   해결: target을 "첫 강의가 보이는 위치" 이하로 clamp → 강의는 항상 화면에 든다.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = Math.max(0, bodyContentPx - el.clientHeight);
    // 기본 목표: 지금 위치(상단 여유 한 칸). 지금이 없으면 첫 강의.
    const desired =
      nowFrac !== null ? nowFrac * bodyContentPx - hourPx : (firstSlotTopPx ?? 0) - BODY_PAD_PX;
    // 첫 강의가 안 보이게 내려가는 건 막는다 — 첫 강의 위(여유 한 칸)까지만 허용.
    const maxByFirstSlot =
      firstSlotTopPx !== null ? Math.max(0, firstSlotTopPx - hourPx * 0.5) : maxScroll;
    const target = Math.min(Math.max(0, desired), maxByFirstSlot, maxScroll);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: target, behavior: reduce ? "auto" : "smooth" });
  }, [nowFrac, bodyContentPx, hourPx, firstSlotTopPx]);

  const hours = useMemo(() => {
    const list: number[] = [];
    for (let h = hourStart; h <= hourEnd; h++) list.push(h);
    return list;
  }, [hourStart, hourEnd]);

  return (
    <section className={timetableStyles.timetable} aria-label="내 강의 시간표">
      {/* Toggle row */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex shrink-0 items-center gap-1.5">
          <ViewPill active={view === "week"} onClick={() => setView("week")} label="한 주" />
          <ViewPill
            active={view === "today"}
            onClick={() => setView("today")}
            label="오늘만"
            disabled={!todayWeekday}
          />
          <ViewPill active={view === "list"} onClick={() => setView("list")} label="목록" />
        </div>
        <Link
          href="/dashboard/calendar"
          className="inline-flex h-9 shrink-0 items-center rounded-full px-3 text-[12px] wght-450 text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-apple-action-soft)] hover:text-[var(--color-apple-action)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          캘린더 ›
        </Link>
      </div>

      {/* Card */}
      <div className={timetableStyles.card} hidden={view === "list"}>
        {/* Header — gutter | days */}
        <div
          className="grid border-b border-[var(--color-apple-hairline-soft)] bg-[var(--color-apple-pearl)]/30"
          style={{
            gridTemplateColumns: `${gutterPx}px repeat(${shownDays.length}, minmax(0, 1fr))`,
            height: `${HEADER_PX}px`,
          }}
        >
          <div aria-hidden />
          {shownDays.map((w) => {
            const today = isKstToday(w, now);
            return (
              <div
                key={w}
                className={`flex items-center justify-center text-[10px] uppercase wght-620 ${
                  today ? "text-[var(--color-apple-action)]" : "text-[var(--color-apple-muted)]"
                }`}
                style={{ letterSpacing: "0.08em" }}
              >
                {DAY_LABELS_KO[w]}
                {today && (
                  <span
                    aria-hidden
                    className="ml-1 inline-block h-1 w-1 rounded-full bg-[var(--color-apple-action)] align-middle"
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Body — 내부 세로 스크롤. 측정+스크롤을 한 요소에서.
            공간 충분하면 콘텐츠가 딱 맞아 스크롤 없음 / 좁으면 MIN_HOUR_PX로 고정돼 스크롤. */}
        <div
          ref={(el) => {
            bodyRef.current = el;
            scrollRef.current = el;
          }}
          className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          {/* 콘텐츠 — 명시적 픽셀 높이. gutter | cells. */}
          <div className="relative flex" style={{ height: `${bodyContentPx}px` }}>
            {/* Gutter — Apple Calendar 시간 typography. 시(큰 wght-560) + 분 hint(::00 작게). */}
            <div aria-hidden className="relative shrink-0" style={{ width: `${gutterPx}px` }}>
              {hours.slice(0, -1).map((h, idx) => {
                const top = BODY_PAD_PX + idx * hourPx;
                // 현재 시각이 이 hour 구간에 있으면 진하게
                const isCurrentHour = nowFrac !== null && Math.floor(nowMin / 60) === h;
                return (
                  <div
                    key={`label-${h}`}
                    className="absolute right-1.5 flex -translate-y-1.5 items-baseline gap-px"
                    style={{ top: `${top}px` }}
                  >
                    <span
                      className={`text-[11px] tabular-nums transition-colors ${
                        isCurrentHour
                          ? "wght-700 text-[var(--color-apple-action)]"
                          : "wght-560 text-[var(--color-apple-muted)]/85"
                      }`}
                      style={{ letterSpacing: "-0.018em" }}
                    >
                      {String(h).padStart(2, "0")}
                    </span>
                    <span
                      className={`text-[8px] tabular-nums transition-colors ${
                        isCurrentHour
                          ? "wght-560 text-[var(--color-apple-action)]/70"
                          : "wght-560 text-[var(--color-apple-muted)]/70"
                      }`}
                      style={{ letterSpacing: "-0.008em" }}
                    >
                      :00
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Cells */}
            <div className="relative min-w-0 flex-1 border-l border-[var(--color-apple-hairline-soft)]/60">
              {/* 오늘 컬럼 통째 파란 wash는 제거 — "큰 면적에 액센트 색"(DESIGN §10) 위반이고
                  너무 튄다는 피드백(2026-06-09). 오늘 식별은 헤더(파란 글자+점)와
                  아래 실시간 now-line이 대신한다. */}

              {/* 오늘 컬럼 "지난 시간 dim" wash는 제거(2026-07-22). 오후·저녁 접속 시
                  nowFrac이 1에 근접해 컬럼을 거의 통째로 덮어(특히 다크 22%) "오늘=강조"가
                  "오늘=비활성"으로 뒤집혔다. "오늘 어디까지 왔나"는 아래 실시간 now-line이
                  이미 정확히 표현한다. 지난 강의 셀은 아래 opacity로만 미세하게 톤다운. */}

              {/* Hour hairline — Apple Calendar처럼 아주 옅게(타임라인 가이드).
                  세로 요일 구분선은 제거 → "엑셀 표"가 아니라 "타임라인". */}
              {hours.slice(1, -1).map((h, idx) => {
                const top = BODY_PAD_PX + (idx + 1) * hourPx;
                return (
                  <div
                    key={`hline-${h}`}
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 border-t border-[var(--color-apple-hairline-soft)]/35"
                    style={{ top: `${top}px` }}
                  />
                );
              })}

              {/* 강의 칸 — top/height는 픽셀, left/width는 컬럼 % 비율. */}
              {shownDays.flatMap((w, dayIdx) => {
                const daySlots = data.slots.filter((s) => s.slot.weekday === w);
                return daySlots.map((s) => {
                  const top = BODY_PAD_PX + ((s.slot.startMinute - minuteOffset) / 60) * hourPx;
                  const height = ((s.slot.endMinute - s.slot.startMinute) / 60) * hourPx;
                  const colWidth = 100 / shownDays.length;
                  const left = dayIdx * colWidth;
                  const isNow =
                    isKstToday(w, now) && nowMin >= s.slot.startMinute && nowMin < s.slot.endMinute;
                  // 과거 강의 (오늘 컬럼 안, 이미 끝난 슬롯) — 톤 다운
                  const isPast = isKstToday(w, now) && nowMin >= s.slot.endMinute;
                  // 셀 실제 높이(px). 패딩·정렬·표시 항목을 높이로 단계화해 짧은 셀 잘림 방지.
                  const cellH = height - 4;
                  // tiny: 시각 줄이 못 들어감 + 패딩 줄이고 세로 중앙 정렬로 강의명 1줄 확실히.
                  const tiny = cellH < 40;
                  // 강의실이 먼저 들어가게 제목을 줄인다. 전체 정보는 목록에서도 확인 가능.
                  const compact = cellH < 76;
                  const showTime = cellH >= 62;
                  // 짧을수록 상하 패딩을 줄여 텍스트 공간 확보. (좌우는 유지.)
                  const padY = tiny ? 3 : compact ? 5 : 6;
                  const horizontalInset = isMobile ? 2 : 3;
                  const accent = courseAccentRgb(s.courseName, s.color);
                  const cellStyle: CSSProperties & { "--tt-accent-rgb": string } = {
                    top: `${top + 2}px`,
                    height: `${cellH}px`,
                    paddingTop: `${padY}px`,
                    paddingBottom: `${padY}px`,
                    left: `calc(${left}% + ${horizontalInset}px)`,
                    width: `calc(${colWidth}% - ${horizontalInset * 2}px)`,
                    backgroundColor: isDark
                      ? courseTintDark(s.courseName, s.color)
                      : cellTint(s.courseName, s.color),
                    "--tt-accent-rgb": `${accent.r} ${accent.g} ${accent.b}`,
                  };
                  return (
                    <button
                      key={`${s.courseId}-${w}-${s.slot.startMinute}`}
                      type="button"
                      onClick={() => onPickCourse(s)}
                      className={`tt-cell ${timetableStyles.cell} group absolute flex flex-col items-start overflow-hidden rounded-[10px] px-1 text-left sm:px-2.5 ${
                        tiny ? "justify-center" : "justify-start"
                      } ${
                        isNow
                          ? "now-glow z-10 ring-2 ring-[var(--color-apple-action)] shadow-[0_10px_28px_-4px_rgba(0,113,227,0.5)]"
                          : ""
                      } ${isPast ? "opacity-75" : ""}`}
                      style={cellStyle}
                      aria-label={`${s.courseName} ${s.slot.startLabel} - ${s.slot.endLabel}, ${s.location?.trim() || "강의실 미등록"}${isNow ? " (진행 중)" : ""}`}
                      title={`${s.courseName} · ${DAY_LABELS_KO[w]} ${s.slot.startLabel}–${s.slot.endLabel}\n${s.location?.trim() || "강의실 미등록 · 눌러서 수정"}${s.professor ? ` · ${s.professor}` : ""}`}
                    >
                      {/* 진행 중 라벨 — 셀 우상단 micro pulse dot. tiny 셀은 공간 없어 숨김. */}
                      {isNow && !tiny && (
                        <span
                          aria-hidden
                          className="absolute right-2 top-2 inline-flex h-1.5 w-1.5"
                        >
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-apple-action)] opacity-70" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-apple-action)]" />
                        </span>
                      )}
                      <span
                        className={`${compact ? "line-clamp-1" : "line-clamp-2"} ${tiny ? "text-[9px] sm:text-[12px]" : "text-[9.5px] sm:text-[14px]"} max-w-full leading-[1.2] wght-700 text-[var(--color-apple-ink)]`}
                        style={{ letterSpacing: 0, wordBreak: "keep-all", overflowWrap: "normal" }}
                      >
                        {s.courseName}
                      </span>
                      {!tiny && (
                        <span className={timetableStyles.cellLocation}>
                          <MapPin size={11} aria-hidden />
                          <span>{s.location?.trim() || "강의실 추가"}</span>
                        </span>
                      )}
                      {showTime && (
                        <span
                          className={`mt-0.5 line-clamp-1 text-[10.5px] wght-560 tabular-nums ${
                            isDark
                              ? "text-[var(--color-apple-muted)]"
                              : "text-[var(--color-apple-ink)]/55"
                          }`}
                          style={{ letterSpacing: "-0.012em" }}
                        >
                          <span className="sm:hidden">{s.slot.startLabel}</span>
                          <span className="hidden sm:inline">
                            {s.slot.startLabel}–{s.slot.endLabel}
                          </span>
                        </span>
                      )}
                    </button>
                  );
                });
              })}

              {/* 현재 시각 라인 — 파란 컬럼 wash를 뺀 자리의 주인공.
                  도트 + 현재 시각 칩(HH:MM) + 가는 라인. "내 시간"이 한눈에. */}
              {nowFrac !== null && todayColumn !== -1 && (
                <div
                  aria-hidden
                  className="time-bar-pulse pointer-events-none absolute z-20 flex items-center"
                  style={{
                    top: `${BODY_PAD_PX + nowFrac * hourPx * hourSpan}px`,
                    left: `${(todayColumn / shownDays.length) * 100}%`,
                    width: `${100 / shownDays.length}%`,
                  }}
                >
                  <span className="relative -ml-1 inline-flex h-2 w-2 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-apple-action)] opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-apple-action)] shadow-[0_0_8px_rgba(0,113,227,0.5)]" />
                  </span>
                  <span
                    className="ml-1 shrink-0 rounded-full bg-[var(--color-apple-action)] px-1.5 py-px text-[9.5px] wght-700 tabular-nums leading-none text-white shadow-[0_1px_4px_-1px_rgba(0,113,227,0.5)]"
                    style={{ letterSpacing: "-0.01em" }}
                  >
                    {nowLabel}
                  </span>
                  <span className="ml-1.5 h-px flex-1 bg-gradient-to-r from-[var(--color-apple-action)]/85 via-[var(--color-apple-action)]/55 to-[var(--color-apple-action)]/15" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {view === "list" && (
        <TimetableList
          data={data}
          now={now}
          weekdays={displayWeekdays}
          onPickCourse={onPickCourse}
        />
      )}
      <p className={timetableStyles.hint}>
        <MapPin size={12} aria-hidden /> 강의를 누르면 강의실과 시간을 수정할 수 있어요
      </p>
    </section>
  );
}

function TimetableList({
  data,
  now,
  weekdays,
  onPickCourse,
}: {
  data: ReturnType<typeof buildTimetable>;
  now: Date;
  weekdays: Weekday[];
  onPickCourse: (slot: CourseSlot) => void;
}) {
  return (
    <section className={timetableStyles.agenda} aria-label="요일별 강의 목록">
      {weekdays.map((weekday) => {
        const slots = data.slots
          .filter((slot) => slot.slot.weekday === weekday)
          .sort((a, b) => a.slot.startMinute - b.slot.startMinute);
        const today = isKstToday(weekday, now);
        return (
          <section key={weekday} className={timetableStyles.agendaDay}>
            <h3 className={timetableStyles.agendaDayTitle} data-today={today}>
              {DAY_LABELS_KO[weekday]}요일
              {today && <span>오늘</span>}
              <span className={timetableStyles.dayCount}>{slots.length}개 수업</span>
            </h3>
            {slots.length === 0 ? (
              <p className={timetableStyles.freeDay}>등록된 수업이 없어요</p>
            ) : (
              <ul className={timetableStyles.agendaCourses}>
                {slots.map((slot) => {
                  const accent = courseAccentRgb(slot.courseName, slot.color);
                  const style = {
                    "--tt-accent-rgb": `${accent.r} ${accent.g} ${accent.b}`,
                  } as CSSProperties;
                  return (
                    <li key={`${slot.courseId}-${slot.slot.startMinute}`}>
                      <button
                        type="button"
                        className={timetableStyles.agendaCourse}
                        style={style}
                        onClick={() => onPickCourse(slot)}
                      >
                        <span className={timetableStyles.agendaTime}>
                          <Clock3 size={12} aria-hidden />
                          {slot.slot.startLabel}
                          <span>{slot.slot.endLabel}</span>
                        </span>
                        <span className={timetableStyles.agendaDetails}>
                          <strong>{slot.courseName}</strong>
                          <span className={timetableStyles.agendaLocation}>
                            <MapPin size={13} aria-hidden />
                            {slot.location?.trim() || "강의실 미등록 · 눌러서 추가"}
                          </span>
                          {slot.professor && (
                            <span className={timetableStyles.agendaProfessor}>
                              {slot.professor}
                            </span>
                          )}
                        </span>
                        <ArrowUpRight
                          className={timetableStyles.agendaArrow}
                          size={17}
                          aria-hidden
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </section>
  );
}

function ViewPill({
  active,
  onClick,
  label,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={
        active
          ? "btn-ink spring-press inline-flex h-9 items-center rounded-full bg-[var(--color-apple-ink)] px-3.5 text-[12px] wght-560 text-white"
          : "spring-press inline-flex h-9 items-center rounded-full border border-[var(--color-apple-hairline)] bg-white px-3.5 text-[12px] wght-450 text-[var(--color-apple-muted)] transition-colors hover:text-[var(--color-apple-ink)] disabled:opacity-50"
      }
      style={{ letterSpacing: "-0.012em" }}
    >
      {label}
    </button>
  );
}

/* ─────────────────────────── Empty ─────────────────────────── */

function EmptyTimetableHero({ hasCourses }: { hasCourses: boolean }) {
  return (
    <section className={styles.welcome} aria-labelledby="campus-start-title">
      <div className={styles.welcomeMain}>
        <div className={styles.welcomeCopy}>
          <span className={styles.eyebrow}>MY CAMPUS / 나의 시작점</span>
          <h2 id="campus-start-title" className={styles.welcomeTitle}>
            한 학기의 시작은
            <br />
            <span>가볍게, 한 장부터</span>
          </h2>
          <p className={styles.welcomeDescription}>
            시간표 이미지를 올리고 과목과 시간을 확인하세요.
            <br className="hidden sm:block" /> 수업을 누르면 그 과목의 자료로 바로 이어집니다.
          </p>
          <Link href="/dashboard/calendar/import?kind=timetable" className={styles.primaryAction}>
            시간표 올리기 <ArrowRight size={17} aria-hidden />
          </Link>
          <Link href="/dashboard/study" className={styles.secondaryAction}>
            {hasCourses ? "등록한 과목에서 공부 이어가기" : "시간표 없이 자료부터 시작하기"}{" "}
            <ArrowUpRight size={14} aria-hidden />
          </Link>
        </div>
        <div className={styles.scheduleArt} aria-hidden="true">
          <div className={styles.paperBack} />
          <div className={styles.paper}>
            <div className={styles.paperHeader}>
              <span>MY WEEK</span>
              <CalendarDays size={17} />
            </div>
            <div className={styles.paperDays}>
              {["MON", "TUE", "WED", "THU", "FRI"].map((day) => (
                <span key={day}>{day[0]}</span>
              ))}
            </div>
            <div className={styles.paperGrid}>
              <span className={styles.paperClass} style={{ gridColumn: "1", gridRow: "1 / 3" }}>
                <BookOpen size={16} />
              </span>
              <span className={styles.paperClass} style={{ gridColumn: "3", gridRow: "2 / 4" }}>
                <FileText size={16} />
              </span>
              <span className={styles.paperClass} style={{ gridColumn: "5", gridRow: "1 / 3" }}>
                <BookOpen size={16} />
              </span>
              <span className={styles.paperClass} style={{ gridColumn: "2", gridRow: "4 / 6" }} />
              <span className={styles.paperClass} style={{ gridColumn: "4", gridRow: "4 / 6" }} />
            </div>
            <div className={styles.paperFooter}>YOUR SEMESTER, CONNECTED.</div>
          </div>
          <span className={styles.paperNote}>
            <Check size={15} /> 내 시간표를 한눈에
          </span>
        </div>
      </div>
      <div className={styles.startSteps}>
        <StartStep
          number="01"
          icon={<CalendarDays size={18} />}
          title="시간표로 한 주 정리"
          description="이미지에서 과목·시간 가져오기"
          href="/dashboard/calendar/import?kind=timetable"
        />
        <StartStep
          number="02"
          icon={<FileText size={18} />}
          title="자료에서 공부 시작"
          description="강의자료를 요약과 문제로"
          href="/dashboard/study"
        />
        <StartStep
          number="03"
          icon={<BookOpen size={18} />}
          title="틀린 문제 다시 보기"
          description="쌓인 오답을 과목별로 복습"
          href="/dashboard/review"
        />
      </div>
    </section>
  );
}

function StartStep({
  number,
  icon,
  title,
  description,
  href,
}: {
  number: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link href={href} className={styles.startStep}>
      <span className={styles.stepNumber}>{number}</span>
      <div className={styles.stepContent}>
        <span className={styles.stepTitle}>
          {icon}
          {title}
        </span>
        <span className={styles.stepDescription}>{description}</span>
      </div>
      <ArrowUpRight className={styles.stepArrow} size={17} aria-hidden />
    </Link>
  );
}

/* ─────────────────────────── Utils ─────────────────────────── */

// Palette 함수는 lib/course-palette로 추출됨 (study CourseCard·quiz와 공유).
// 시간표 셀은 카드보다 작아 색 정체성이 더 또렷해야 함 → alpha 0.45 (카드 default 0.18보다 진함).
const cellTint = (name: string, color: string | null | undefined) => courseTint(name, color, 0.45);
