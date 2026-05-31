"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { courseTint } from "@/lib/course-palette";
import type { CourseListItem } from "@/lib/data/materials";
import {
  buildTimetable,
  type CourseSlot,
  findNowAndNext,
  isKstToday,
  type Weekday,
} from "@/lib/timetable-grid";

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
 *   - 모바일은 today 토글 기본
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

const ROW_MIN = 5;
const HEADER_PX = 32;
const GUTTER_PX_MOBILE = 36;
const GUTTER_PX_DESKTOP = 44;

/* ─────────────────────────── Public API ─────────────────────────── */

/** 페이지 상단에 박는 heading + now readout — heading은 grid 밖에서 작은 라인으로. */
export function TimetableHeading({
  courses,
  studentName,
}: {
  courses: CourseListItem[];
  studentName: string | null;
}) {
  const data = useTimetableData(courses);
  const tick = useTick();
  const { current, next } = useMemo(
    () => findNowAndNext(data, new Date(tick)),
    [data, tick],
  );
  const greeting = studentName ? `${studentName}님의 이번 주` : "이번 주";

  return (
    <header className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <p
          className="text-[10px] uppercase wght-620 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "0.08em" }}
        >
          시간표
        </p>
        <h1
          className="mt-1 text-[22px] leading-[1.06] wght-700 text-[var(--color-apple-ink)] sm:text-[26px] md:text-[30px]"
          style={{ letterSpacing: "-0.022em" }}
        >
          {greeting}
        </h1>
      </div>
      <NowReadout current={current} next={next} />
    </header>
  );
}

export function TimetableHero({
  courses,
  onPickCourse,
}: {
  courses: CourseListItem[];
  onPickCourse: (course: CourseListItem) => void;
}) {
  const semester = useMemo(() => courses.filter((c) => c.category === "semester"), [courses]);
  const data = useTimetableData(courses);
  const tick = useTick();

  if (data.slots.length === 0) {
    return <EmptyTimetableHero />;
  }

  return (
    <TimetableGrid
      data={data}
      now={new Date(tick)}
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

function useTick(): number {
  const [tick, setTick] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return tick;
}

/* ─────────────────────────── Now Readout ─────────────────────────── */

function NowReadout({
  current,
  next,
}: {
  current: CourseSlot | null;
  next: CourseSlot | null;
}) {
  if (current) {
    return (
      <div className="shrink-0 rounded-[10px] border border-[var(--color-apple-action)]/20 bg-[var(--color-apple-action)]/[0.06] px-3 py-1.5 backdrop-blur-sm">
        <p
          className="text-[9.5px] wght-620 uppercase text-[var(--color-apple-action)]"
          style={{ letterSpacing: "0.08em" }}
        >
          진행 중
        </p>
        <p
          className="mt-0.5 line-clamp-1 text-[12.5px] wght-620 tabular-nums text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {current.courseName}
          <span className="wght-450 text-[var(--color-apple-muted)]">
            {" · "}
            {current.slot.endLabel}까지
          </span>
        </p>
      </div>
    );
  }
  if (next) {
    return (
      <div className="shrink-0 rounded-[10px] border border-[var(--color-apple-hairline-soft)] bg-white/80 px-3 py-1.5 backdrop-blur-sm">
        <p
          className="text-[9.5px] wght-620 uppercase text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "0.08em" }}
        >
          다음
        </p>
        <p
          className="mt-0.5 line-clamp-1 text-[12.5px] wght-620 tabular-nums text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {next.courseName}
          <span className="wght-450 text-[var(--color-apple-muted)]">
            {" · "}
            {next.slot.startLabel}
          </span>
        </p>
      </div>
    );
  }
  return (
    <p
      className="hidden text-[11.5px] wght-450 text-[var(--color-apple-muted)] sm:block"
      style={{ letterSpacing: "-0.012em" }}
    >
      오늘 남은 강의 없음
    </p>
  );
}

/* ─────────────────────────── Grid ─────────────────────────── */

type View = "week" | "today";

function TimetableGrid({
  data,
  now,
  onPickCourse,
}: {
  data: ReturnType<typeof buildTimetable>;
  now: Date;
  onPickCourse: (slot: CourseSlot) => void;
}) {
  const [view, setView] = useState<View>("week");
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () => {
      setIsMobile(mq.matches);
      setView(mq.matches ? "today" : "week");
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const todayWeekday = useMemo<Weekday | null>(() => {
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const js = kst.getUTCDay();
    const order: Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    const w = order[js];
    return data.activeWeekdays.includes(w) ? w : null;
  }, [data.activeWeekdays, now]);

  const shownDays = useMemo<Weekday[]>(() => {
    if (view === "today") {
      return todayWeekday ? [todayWeekday] : data.activeWeekdays.slice(0, 1);
    }
    return data.activeWeekdays;
  }, [view, todayWeekday, data.activeWeekdays]);

  const hourStart = data.hourStart;
  const hourEnd = data.hourEnd;
  const totalMinutes = (hourEnd - hourStart) * 60;
  const minuteOffset = hourStart * 60;
  const rowCount = Math.ceil(totalMinutes / ROW_MIN);
  const gutterPx = isMobile ? GUTTER_PX_MOBILE : GUTTER_PX_DESKTOP;

  // 현재 시각 — KST.
  const kst = useMemo(() => new Date(now.getTime() + 9 * 60 * 60 * 1000), [now]);
  const nowMin = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  const nowInRange = nowMin >= minuteOffset && nowMin <= minuteOffset + totalMinutes;
  // 현재 시각을 row 비율(0~1)로 — flex-1 grid에서도 정확.
  const nowFrac = nowInRange ? (nowMin - minuteOffset) / totalMinutes : null;

  const hours = useMemo(() => {
    const list: number[] = [];
    for (let h = hourStart; h <= hourEnd; h++) list.push(h);
    return list;
  }, [hourStart, hourEnd]);

  return (
    <section className="flex h-full min-h-0 flex-col">
      {/* Toggle row */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <ViewPill active={view === "week"} onClick={() => setView("week")} label="한 주" />
          <ViewPill
            active={view === "today"}
            onClick={() => setView("today")}
            label="오늘만"
            disabled={!todayWeekday}
          />
        </div>
        <Link
          href="/dashboard/calendar"
          className="text-[11px] wght-450 text-[var(--color-apple-muted)] transition-colors hover:text-[var(--color-apple-action)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          캘린더 ›
        </Link>
      </div>

      {/* Card */}
      <div className="fade-up fade-up-1 relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-[var(--color-apple-hairline-soft)] bg-white elev-1">
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

        {/* Body — flex로 gutter | cells, 둘 다 minHeight 0 + flex-1 height 공유 */}
        <div className="relative flex min-h-0 flex-1">
          {/* Gutter — Apple Calendar 시간 typography. 시(큰 wght-560) + 분 hint(::00 작게). */}
          <div
            aria-hidden
            className="relative shrink-0"
            style={{ width: `${gutterPx}px` }}
          >
            {hours.slice(0, -1).map((h, idx) => {
              const top = (idx / (hourEnd - hourStart)) * 100;
              // 현재 시각이 이 hour 구간에 있으면 진하게
              const isCurrentHour =
                nowFrac !== null && Math.floor(nowMin / 60) === h;
              return (
                <div
                  key={`label-${h}`}
                  className="absolute right-1.5 flex -translate-y-1.5 items-baseline gap-px"
                  style={{ top: `${top}%` }}
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
                        : "wght-450 text-[var(--color-apple-muted)]/55"
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
            {/* 오늘 컬럼 통째 wash — 사용자가 한눈에 볼 수 있는 수준(8%) */}
            {shownDays.map((w, dayIdx) => {
              if (!isKstToday(w, now)) return null;
              const colWidth = 100 / shownDays.length;
              return (
                <div
                  key={`today-wash-${w}`}
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 bg-[var(--color-apple-action)]/[0.08]"
                  style={{
                    left: `${dayIdx * colWidth}%`,
                    width: `${colWidth}%`,
                  }}
                />
              );
            })}

            {/* 과거 시간대 dim — 라이트 8% · 다크 30% (확실히 보이게) */}
            {nowFrac !== null &&
              shownDays.map((w, dayIdx) => {
                if (!isKstToday(w, now)) return null;
                const colWidth = 100 / shownDays.length;
                return (
                  <div
                    key={`past-wash-${w}`}
                    aria-hidden
                    className="pointer-events-none absolute top-0 bg-black/[0.08] dark:bg-black/[0.30]"
                    style={{
                      left: `${dayIdx * colWidth}%`,
                      width: `${colWidth}%`,
                      height: `${nowFrac * 100}%`,
                    }}
                  />
                );
              })}

            {/* Hour hairline (시작 hour 제외) */}
            {hours.slice(1, -1).map((h, idx) => {
              const top = ((idx + 1) / (hourEnd - hourStart)) * 100;
              return (
                <div
                  key={`hline-${h}`}
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 border-t border-[var(--color-apple-hairline-soft)]/40"
                  style={{ top: `${top}%` }}
                />
              );
            })}

            {/* Day vertical divider */}
            {shownDays.slice(1).map((w, i) => (
              <div
                key={`vline-${w}`}
                aria-hidden
                className="pointer-events-none absolute inset-y-0 border-l border-[var(--color-apple-hairline-soft)]/40"
                style={{ left: `${((i + 1) / shownDays.length) * 100}%` }}
              />
            ))}

            {/* 강의 칸 — 모두 % 비율 (top/height 둘 다 %).
                ribbon 제거, 셀 자체에 파스텔 tint 배경 + 진한 ink 글자. */}
            {shownDays.flatMap((w, dayIdx) => {
              const daySlots = data.slots.filter((s) => s.slot.weekday === w);
              return daySlots.map((s) => {
                const top = ((s.slot.startMinute - minuteOffset) / totalMinutes) * 100;
                const height =
                  ((s.slot.endMinute - s.slot.startMinute) / totalMinutes) * 100;
                const colWidth = 100 / shownDays.length;
                const left = dayIdx * colWidth;
                const isNow =
                  isKstToday(w, now) &&
                  nowMin >= s.slot.startMinute &&
                  nowMin < s.slot.endMinute;
                // 과거 강의 (오늘 컬럼 안, 이미 끝난 슬롯) — 톤 다운
                const isPast =
                  isKstToday(w, now) && nowMin >= s.slot.endMinute;
                return (
                  <button
                    key={`${s.courseId}-${w}-${s.slot.startMinute}`}
                    type="button"
                    onClick={() => onPickCourse(s)}
                    className={`tt-cell spring-press group absolute flex flex-col items-start justify-start overflow-hidden rounded-[10px] px-2.5 py-2 text-left transition-all duration-200 hover:-translate-y-px hover:shadow-[0_8px_20px_-8px_rgba(0,0,0,0.18)] hover:brightness-[1.02] ${
                      isNow ? "now-glow z-10 ring-2 ring-[var(--color-apple-action)] shadow-[0_10px_28px_-4px_rgba(0,113,227,0.5)] brightness-105" : ""
                    } ${isPast ? "opacity-35 saturate-50" : ""}`}
                    style={{
                      top: `calc(${top}% + 2px)`,
                      height: `calc(${height}% - 4px)`,
                      left: `calc(${left}% + 3px)`,
                      width: `calc(${colWidth}% - 6px)`,
                      backgroundColor: cellTint(s.courseName, s.color),
                    }}
                    aria-label={`${s.courseName} ${s.slot.startLabel} - ${s.slot.endLabel}${isNow ? " (진행 중)" : ""}`}
                  >
                    {/* 진행 중 라벨 — 셀 우상단 micro pulse dot */}
                    {isNow && (
                      <span
                        aria-hidden
                        className="absolute right-2 top-2 inline-flex h-1.5 w-1.5"
                      >
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-apple-action)] opacity-70" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-apple-action)]" />
                      </span>
                    )}
                    <span
                      className="line-clamp-2 text-[14px] leading-[1.15] wght-700 text-[var(--color-apple-ink)]"
                      style={{ letterSpacing: "-0.018em" }}
                    >
                      {s.courseName}
                    </span>
                    {height > 6 && (
                      <span
                        className="mt-1 line-clamp-1 text-[10.5px] wght-560 tabular-nums text-[var(--color-apple-ink)]/55"
                        style={{ letterSpacing: "-0.012em" }}
                      >
                        {s.slot.startLabel}–{s.slot.endLabel}
                      </span>
                    )}
                  </button>
                );
              });
            })}

            {/* 현재 시각 라인 — Fantastical 톤. 도트 + 가는 라인 + 현재 시각 라벨 */}
            {nowFrac !== null && shownDays.some((w) => isKstToday(w, now)) && (
              <div
                aria-hidden
                className="time-bar-pulse pointer-events-none absolute inset-x-0 z-20 flex items-center"
                style={{ top: `${nowFrac * 100}%` }}
              >
                <span className="relative -ml-1 inline-flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-apple-action)] opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-apple-action)] shadow-[0_0_8px_rgba(0,113,227,0.5)]" />
                </span>
                <span className="ml-0 h-px flex-1 bg-gradient-to-r from-[var(--color-apple-action)]/85 via-[var(--color-apple-action)]/60 to-[var(--color-apple-action)]/20" />
              </div>
            )}
          </div>
        </div>
      </div>
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
          ? "spring-press inline-flex h-6 items-center rounded-full bg-[var(--color-apple-ink)] px-2.5 text-[10.5px] wght-560 text-white"
          : "spring-press inline-flex h-6 items-center rounded-full border border-[var(--color-apple-hairline)] bg-white px-2.5 text-[10.5px] wght-450 text-[var(--color-apple-muted)] transition-colors hover:text-[var(--color-apple-ink)] disabled:opacity-40"
      }
      style={{ letterSpacing: "-0.012em" }}
    >
      {label}
    </button>
  );
}

/* ─────────────────────────── Empty ─────────────────────────── */

function EmptyTimetableHero() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center rounded-[16px] border border-dashed border-[var(--color-apple-hairline)] bg-white/60 p-8 text-center">
      <p
        className="text-[10px] uppercase wght-620 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "0.08em" }}
      >
        시간표 없음
      </p>
      <p
        className="mt-2 max-w-[360px] text-[14.5px] wght-560 text-[var(--color-apple-ink)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        한 학기를 한 장으로 펼쳐볼게요
      </p>
      <p
        className="mt-1.5 max-w-[400px] text-[12px] wght-450 leading-[1.55] text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        시간표 한 장만 올려두면 오늘 어디서 뭘 듣는지 한눈에 들어와요.
      </p>
      <Link
        href="/dashboard/calendar/import?kind=timetable"
        className="spring-press mt-5 inline-flex h-10 items-center gap-1.5 rounded-full bg-[var(--color-apple-ink)] px-4 text-[12.5px] wght-560 text-white transition-opacity hover:opacity-90"
        style={{ letterSpacing: "-0.012em" }}
      >
        시간표 올리기 <span aria-hidden>›</span>
      </Link>
    </div>
  );
}

/* ─────────────────────────── Utils ─────────────────────────── */

// Palette 함수는 lib/course-palette로 추출됨 (study CourseCard·quiz와 공유).
// 셀 배경 호출은 cellTint(name, color) 시그니처 유지.
const cellTint = (name: string, color: string | null | undefined) => courseTint(name, color);
