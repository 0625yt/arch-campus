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
          {/* Gutter — 시간 라벨을 hour 비율로 절대 배치. 컨테이너가 flex-1이라 자동 추적. */}
          <div
            aria-hidden
            className="relative shrink-0"
            style={{ width: `${gutterPx}px` }}
          >
            {hours.slice(0, -1).map((h, idx) => {
              const top = (idx / (hourEnd - hourStart)) * 100;
              return (
                <span
                  key={`label-${h}`}
                  className="absolute right-1.5 -translate-y-1.5 text-[10px] wght-450 tabular-nums text-[var(--color-apple-muted)]/80"
                  style={{ top: `${top}%`, letterSpacing: "-0.012em" }}
                >
                  {String(h).padStart(2, "0")}
                </span>
              );
            })}
          </div>

          {/* Cells */}
          <div className="relative min-w-0 flex-1 border-l border-[var(--color-apple-hairline-soft)]/60">
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
                return (
                  <button
                    key={`${s.courseId}-${w}-${s.slot.startMinute}`}
                    type="button"
                    onClick={() => onPickCourse(s)}
                    className={`spring-press group absolute flex flex-col items-start justify-start overflow-hidden rounded-[10px] px-2.5 py-2 text-left transition-all hover:brightness-[0.97] ${
                      isNow ? "now-glow" : ""
                    }`}
                    style={{
                      top: `calc(${top}% + 2px)`,
                      height: `calc(${height}% - 4px)`,
                      left: `calc(${left}% + 3px)`,
                      width: `calc(${colWidth}% - 6px)`,
                      backgroundColor: cellTint(s.courseName, s.color),
                    }}
                    aria-label={`${s.courseName} ${s.slot.startLabel} - ${s.slot.endLabel}`}
                  >
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

            {/* 현재 시각 라인 */}
            {nowFrac !== null && shownDays.some((w) => isKstToday(w, now)) && (
              <div
                aria-hidden
                className="time-bar-pulse pointer-events-none absolute inset-x-0 z-10 flex items-center"
                style={{ top: `${nowFrac * 100}%` }}
              >
                <span className="-ml-1 h-1.5 w-1.5 rounded-full bg-[var(--color-apple-action)]" />
                <span className="ml-0 h-px flex-1 bg-[var(--color-apple-action)]/70" />
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

/**
 * Apple Calendar 톤 7색 파스텔 — 강의명 해시로 안정적으로 매핑.
 * course.color가 비어있거나 모두 같은 값일 때도 시각적으로 구분되게.
 * tint는 매우 연하게(7~10% alpha) + 글자는 진한 ink로 — 사용자 사진 톤.
 */
const PASTEL_PALETTE = [
  { r: 122, g: 166, b: 214 }, // sky blue
  { r: 127, g: 179, b: 140 }, // mint
  { r: 224, g: 142, b: 158 }, // peach pink
  { r: 204, g: 160, b: 107 }, // butter
  { r: 160, g: 139, b: 196 }, // lavender
  { r: 214, g: 139, b: 122 }, // coral
  { r: 122, g: 196, b: 196 }, // teal
];

function pickPaletteColor(seed: string): { r: number; g: number; b: number } {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PASTEL_PALETTE[hash % PASTEL_PALETTE.length];
}

function parseHex(color: string): { r: number; g: number; b: number } | null {
  if (!color.startsWith("#")) return null;
  const c =
    color.length === 4
      ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      : color;
  if (c.length !== 7) return null;
  const r = Number.parseInt(c.slice(1, 3), 16);
  const g = Number.parseInt(c.slice(3, 5), 16);
  const b = Number.parseInt(c.slice(5, 7), 16);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
  return { r, g, b };
}

/**
 * 강의 셀 배경 — 사용자 사진 톤: 매우 연한 파스텔(알파 12%) + 글자는 ink.
 * course.color가 default "#0071e3" 같이 다 같으면 강의명으로 팔레트 재배정.
 */
function cellTint(courseName: string, color: string | null | undefined): string {
  const DEFAULT_BLUE = "#0071e3";
  const seed = color && color !== DEFAULT_BLUE ? color : courseName;
  const parsed = (color && color !== DEFAULT_BLUE && parseHex(color)) || pickPaletteColor(seed);
  return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, 0.12)`;
}
