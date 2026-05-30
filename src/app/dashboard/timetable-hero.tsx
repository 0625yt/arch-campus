"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CourseListItem } from "@/lib/data/materials";
import {
  buildTimetable,
  type CourseSlot,
  findNowAndNext,
  isKstToday,
  type Weekday,
} from "@/lib/timetable-grid";

/**
 * Dashboard 메인 hero — 이번 학기 시간표를 한눈에.
 *
 * 설계 원칙 (재작성):
 *   1. 단일 grid 구조 — header / time gutter / cells가 같은 grid coordinate 안에.
 *      sub-grid 분기로 정렬 어긋남 방지.
 *   2. 픽셀 단위 row 높이 — 모바일 18px / 데스크탑 22px (촘촘). 시간표 전체가 화면 안에 들어옴.
 *   3. 5분 단위 정밀도 — 9:00·9:25 같은 비표준 시간도 정확히 표시.
 *   4. 빈 시간 압축 — 강의 없는 hour는 그대로 두되 row 자체가 작아서 부담 없음.
 *   5. 모바일은 "오늘만" 기본 — 토글로 한 주 전환. 7 column 좁아지는 문제 해소.
 *   6. 진행 중 강의 now-glow + 현재 시각 가로 라인.
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

const ROW_PX_MOBILE = 18;
const ROW_PX_DESKTOP = 22;
const ROW_MIN = 5; // 5분 단위
const GUTTER_PX_MOBILE = 36;
const GUTTER_PX_DESKTOP = 48;

export function TimetableHero({
  courses,
  studentName,
  onPickCourse,
}: {
  courses: CourseListItem[];
  studentName: string | null;
  onPickCourse: (course: CourseListItem) => void;
}) {
  const semester = useMemo(() => courses.filter((c) => c.category === "semester"), [courses]);

  const data = useMemo(
    () =>
      buildTimetable(
        semester.map((c) => ({
          id: c.id,
          name: c.name,
          professor: c.professor,
          location: c.location ?? null,
          color: c.color,
          schedule: c.schedule,
        })),
      ),
    [semester],
  );

  const [tick, setTick] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const { current, next } = useMemo(
    () => findNowAndNext(data, new Date(tick)),
    [data, tick],
  );

  if (data.slots.length === 0) {
    return <EmptyTimetableHero studentName={studentName} />;
  }

  return (
    <section className="fade-up">
      <Heading studentName={studentName} current={current} next={next} />
      <TimetableGrid
        data={data}
        now={new Date(tick)}
        onPickCourse={(slot) => {
          const course = semester.find((c) => c.id === slot.courseId);
          if (course) onPickCourse(course);
        }}
      />
    </section>
  );
}

/* ─────────────────────────── Heading ─────────────────────────── */

function Heading({
  studentName,
  current,
  next,
}: {
  studentName: string | null;
  current: CourseSlot | null;
  next: CourseSlot | null;
}) {
  const greeting = studentName ? `${studentName}님의 이번 주` : "이번 주";
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p
          className="text-[11px] uppercase tracking-[0.08em] wght-560 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "0.08em" }}
        >
          시간표
        </p>
        <h1
          className="mt-1.5 text-[28px] leading-[1.06] wght-700 text-[var(--color-apple-ink)] sm:text-[36px] md:text-[40px]"
          style={{ letterSpacing: "-0.022em" }}
        >
          {greeting}
        </h1>
      </div>
      <NowReadout current={current} next={next} />
    </header>
  );
}

function NowReadout({
  current,
  next,
}: {
  current: CourseSlot | null;
  next: CourseSlot | null;
}) {
  if (current) {
    return (
      <div className="rounded-[12px] border border-[var(--color-apple-hairline-soft)] bg-white/80 px-3.5 py-2.5 backdrop-blur-sm">
        <p
          className="text-[10px] wght-560 uppercase tracking-[0.08em] text-[var(--color-apple-action)]"
          style={{ letterSpacing: "0.08em" }}
        >
          진행 중
        </p>
        <p
          className="mt-0.5 text-[13.5px] wght-620 tabular-nums text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {current.courseName}{" "}
          <span className="wght-450 text-[var(--color-apple-muted)]">
            · {current.slot.endLabel}까지
          </span>
        </p>
      </div>
    );
  }
  if (next) {
    return (
      <div className="rounded-[12px] border border-[var(--color-apple-hairline-soft)] bg-white/80 px-3.5 py-2.5 backdrop-blur-sm">
        <p
          className="text-[10px] wght-560 uppercase tracking-[0.08em] text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "0.08em" }}
        >
          다음 강의
        </p>
        <p
          className="mt-0.5 text-[13.5px] wght-620 tabular-nums text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {next.courseName}{" "}
          <span className="wght-450 text-[var(--color-apple-muted)]">
            · {next.slot.startLabel} 시작
          </span>
        </p>
      </div>
    );
  }
  return (
    <p
      className="text-[12.5px] wght-450 text-[var(--color-apple-muted)]"
      style={{ letterSpacing: "-0.012em" }}
    >
      오늘 남은 강의 없음 — 자료 정리하기 좋은 날
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
  // 모바일은 today 기본, 데스크탑은 week.
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

  // 표시할 요일들.
  const shownDays = useMemo<Weekday[]>(() => {
    if (view === "today") {
      return todayWeekday ? [todayWeekday] : (data.activeWeekdays.slice(0, 1) ?? []);
    }
    return data.activeWeekdays;
  }, [view, todayWeekday, data.activeWeekdays]);

  // 빈 hour 압축 — 시작/끝을 강의 시간에 딱 맞춤. 1시간 buffer만 양옆.
  const compactHourStart = Math.max(0, data.hourStart);
  const compactHourEnd = Math.min(24, data.hourEnd);
  const totalMinutes = (compactHourEnd - compactHourStart) * 60;
  const minuteOffset = compactHourStart * 60;
  const rowCount = Math.ceil(totalMinutes / ROW_MIN);
  // 1 hour = 12 rows of 5 min. row 1개 높이는 rowPx/12.
  const rowPx = isMobile ? ROW_PX_MOBILE : ROW_PX_DESKTOP;
  const rowPxPer5 = rowPx / 12;

  // 시간 표시 hour 단위만.
  const hours = useMemo(() => {
    const list: number[] = [];
    for (let h = compactHourStart; h <= compactHourEnd; h++) list.push(h);
    return list;
  }, [compactHourStart, compactHourEnd]);

  // 현재 시각 라인 — 절대 위치(px)로 정확히.
  const kst = useMemo(() => new Date(now.getTime() + 9 * 60 * 60 * 1000), [now]);
  const nowMin = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  const nowInRange =
    nowMin >= minuteOffset && nowMin <= minuteOffset + totalMinutes;
  const nowTop = nowInRange
    ? ((nowMin - minuteOffset) / 60) * rowPx
    : null;

  // 총 높이 = hours * rowPx.
  const gridHeight = (compactHourEnd - compactHourStart) * rowPx;

  const gutterPx = isMobile ? GUTTER_PX_MOBILE : GUTTER_PX_DESKTOP;

  return (
    <div className="mt-6 sm:mt-8">
      {/* View toggle — 모바일은 today/week 토글 보임. */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ViewPill
            active={view === "week"}
            onClick={() => setView("week")}
            label="한 주"
          />
          <ViewPill
            active={view === "today"}
            onClick={() => setView("today")}
            label="오늘만"
            disabled={!todayWeekday}
          />
        </div>
        <Link
          href="/dashboard/calendar"
          className="text-[11.5px] wght-450 text-[var(--color-apple-muted)] transition-colors hover:text-[var(--color-apple-action)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          캘린더에서 보기 ›
        </Link>
      </div>

      <div className="overflow-hidden rounded-[18px] border border-[var(--color-apple-hairline-soft)] bg-white elev-1 fade-up fade-up-1">
        {/* Header row — 좌측 gutter + 각 요일 column. 본문 grid와 동일한 column template. */}
        <div
          className="grid border-b border-[var(--color-apple-hairline-soft)] bg-[var(--color-apple-pearl)]/40"
          style={{
            gridTemplateColumns: `${gutterPx}px repeat(${shownDays.length}, minmax(0, 1fr))`,
          }}
        >
          <div aria-hidden />
          {shownDays.map((w) => {
            const today = isKstToday(w, now);
            return (
              <div
                key={w}
                className={`flex items-center justify-center py-2 text-[10.5px] uppercase wght-620 ${
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

        {/*
         * Body — flex row 2개로 분리:
         *   1) 좌측 gutter: absolute로 시간 라벨 (어긋날 수 없음)
         *   2) 우측 cells: pure grid (rows × days)
         * 두 영역은 같은 height, 같은 row 픽셀 계산을 공유.
         */}
        <div className="relative flex" style={{ height: `${gridHeight}px` }}>
          {/* 좌측 시간 gutter — absolute 라벨 + 자기 width 고정 */}
          <div
            aria-hidden
            className="relative shrink-0"
            style={{ width: `${gutterPx}px` }}
          >
            {hours.slice(0, -1).map((h, idx) => (
              <span
                key={`label-${h}`}
                className="absolute right-1.5 text-[10px] wght-450 tabular-nums text-[var(--color-apple-muted)]/80"
                style={{
                  top: `${idx * rowPx - 6}px`,
                  letterSpacing: "-0.012em",
                }}
              >
                {String(h).padStart(2, "0")}
              </span>
            ))}
          </div>

          {/* 우측 cells grid */}
          <div
            className="relative flex-1 border-l border-[var(--color-apple-hairline-soft)]/60"
            style={{ height: `${gridHeight}px` }}
          >
            {/* hour hairline — absolute로 정확한 hour 위치에 */}
            {hours.slice(0, -1).map((h, idx) =>
              idx === 0 ? null : (
                <div
                  key={`line-${h}`}
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 border-t border-[var(--color-apple-hairline-soft)]/40"
                  style={{ top: `${idx * rowPx}px` }}
                />
              ),
            )}

            {/* 요일 column vertical divider */}
            {shownDays.slice(1).map((w, i) => (
              <div
                key={`vline-${w}`}
                aria-hidden
                className="pointer-events-none absolute inset-y-0 border-l border-[var(--color-apple-hairline-soft)]/40"
                style={{ left: `${((i + 1) / shownDays.length) * 100}%` }}
              />
            ))}

            {/* 강의 칸 — 모두 absolute 위치 (퍼센트 left/width, 픽셀 top/height) */}
            {shownDays.flatMap((w, dayIdx) => {
              const daySlots = data.slots.filter((s) => s.slot.weekday === w);
              return daySlots.map((s) => {
                const top = ((s.slot.startMinute - minuteOffset) / 60) * rowPx;
                const height =
                  ((s.slot.endMinute - s.slot.startMinute) / 60) * rowPx;
                const colWidth = 100 / shownDays.length;
                const left = dayIdx * colWidth;
                const isNow =
                  isKstToday(w, now) &&
                  nowMin >= s.slot.startMinute &&
                  nowMin < s.slot.endMinute;
                const color = s.color ?? "#0071e3";
                const shortRow = height < 36;
                return (
                  <button
                    key={`${s.courseId}-${w}-${s.slot.startMinute}`}
                    type="button"
                    onClick={() => onPickCourse(s)}
                    className={`spring-press group absolute flex flex-col items-start justify-start overflow-hidden rounded-[8px] px-2 py-1 text-left transition-all hover:brightness-95 ${
                      isNow ? "now-glow" : ""
                    }`}
                    style={{
                      top: `${top + 2}px`,
                      height: `${Math.max(24, height - 4)}px`,
                      left: `calc(${left}% + 3px)`,
                      width: `calc(${colWidth}% - 6px)`,
                      backgroundColor: tintFromColor(color, 0.14),
                      boxShadow: isNow
                        ? undefined
                        : "inset 0 0 0 1px rgba(20,30,50,0.04)",
                    }}
                    aria-label={`${s.courseName} ${s.slot.startLabel} - ${s.slot.endLabel}`}
                  >
                    <span
                      aria-hidden
                      className="absolute left-0 top-1 bottom-1 w-[2.5px] rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span
                      className="ml-1 line-clamp-1 text-[11px] leading-[1.15] wght-620 text-[var(--color-apple-ink)]"
                      style={{ letterSpacing: "-0.012em" }}
                    >
                      {s.courseName}
                    </span>
                    {!shortRow && (
                      <span
                        className="ml-1 mt-0.5 line-clamp-1 text-[10px] wght-450 tabular-nums text-[var(--color-apple-ink)]/65"
                        style={{ letterSpacing: "-0.012em" }}
                      >
                        {s.slot.startLabel}–{s.slot.endLabel}
                        {s.location ? ` · ${s.location}` : ""}
                      </span>
                    )}
                  </button>
                );
              });
            })}

            {/* 현재 시각 라인 */}
            {nowTop !== null &&
              shownDays.some((w) => isKstToday(w, now)) && (
                <div
                  aria-hidden
                  className="time-bar-pulse pointer-events-none absolute inset-x-0 z-10 flex items-center"
                  style={{ top: `${nowTop}px` }}
                >
                  <span className="-ml-1 h-1.5 w-1.5 rounded-full bg-[var(--color-apple-action)]" />
                  <span className="ml-0 h-px flex-1 bg-[var(--color-apple-action)]/70" />
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
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
          ? "spring-press inline-flex h-7 items-center rounded-full bg-[var(--color-apple-ink)] px-3 text-[11.5px] wght-560 text-white"
          : "spring-press inline-flex h-7 items-center rounded-full border border-[var(--color-apple-hairline)] bg-white px-3 text-[11.5px] wght-450 text-[var(--color-apple-muted)] transition-colors hover:text-[var(--color-apple-ink)] disabled:opacity-40"
      }
      style={{ letterSpacing: "-0.012em" }}
    >
      {label}
    </button>
  );
}

/* ─────────────────────────── Empty state ─────────────────────────── */

function EmptyTimetableHero({ studentName }: { studentName: string | null }) {
  const greeting = studentName ? `${studentName}님,` : "안녕하세요,";
  return (
    <section className="fade-up">
      <p
        className="text-[11px] uppercase tracking-[0.08em] wght-560 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "0.08em" }}
      >
        시간표
      </p>
      <h1
        className="mt-2 max-w-[820px] text-[28px] leading-[1.06] wght-700 text-[var(--color-apple-ink)] sm:text-[36px] md:text-[44px]"
        style={{ letterSpacing: "-0.022em" }}
      >
        {greeting}
        <br />
        <span className="text-[var(--color-apple-muted)]">한 학기를 한 장으로 펼쳐볼게요</span>
      </h1>
      <p
        className="mt-4 max-w-[560px] text-[14.5px] leading-[1.55] wght-450 text-[var(--color-apple-muted)] sm:text-[16px]"
        style={{ letterSpacing: "-0.022em" }}
      >
        시간표 한 장만 올려두면 오늘 어디서 뭘 듣는지 한눈에 들어와요.
      </p>
      <Link
        href="/dashboard/calendar/import?kind=timetable"
        className="spring-press mt-6 inline-flex h-[48px] items-center gap-2 rounded-full bg-[var(--color-apple-ink)] px-5 text-[14px] wght-560 text-white shadow-[0_2px_8px_rgba(15,23,42,0.12)] transition-all hover:opacity-90"
        style={{ letterSpacing: "-0.012em" }}
      >
        시간표 올리기
        <span aria-hidden>›</span>
      </Link>
    </section>
  );
}

/* ─────────────────────────── Utils ─────────────────────────── */

/**
 * hex 색을 옅은 tint로. alpha는 0~1. 강의 색상이 살아있되 텍스트 가독성 보존.
 */
function tintFromColor(color: string, alpha: number): string {
  if (color.startsWith("#") && (color.length === 7 || color.length === 4)) {
    const c =
      color.length === 4
        ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
        : color;
    const r = Number.parseInt(c.slice(1, 3), 16);
    const g = Number.parseInt(c.slice(3, 5), 16);
    const b = Number.parseInt(c.slice(5, 7), 16);
    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  return `rgba(0, 113, 227, ${alpha * 0.6})`;
}
