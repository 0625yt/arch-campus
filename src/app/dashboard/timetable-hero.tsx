"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CourseListItem } from "@/lib/data/materials";
import {
  buildTimetable,
  type CourseSlot,
  findNowAndNext,
  isKstToday,
  weekdayKoShort,
  type Weekday,
} from "@/lib/timetable-grid";

/**
 * Dashboard 메인 hero — 이번 학기 시간표를 한눈에.
 *
 * 디자인 의도:
 *   - 첫 화면 fold에 시간표가 들어와 "오늘 이 시간 뭐 듣지?"를 즉시 해소.
 *   - 지금 진행 중인 강의는 now-glow로 살짝 발광 (AI 티 안 나게 절제).
 *   - 강의 칸 클릭 → CourseSheet가 우측에서 spring up — 페이지 이동 없이 정보 확인.
 *   - 시간표 없는 사용자에겐 시간표 업로드 진입을 강하게 박음.
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

  // 클라이언트 시각 — KST 자정·시각 진행률을 1분마다 갱신.
  const [tick, setTick] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const { current, next } = useMemo(
    () => findNowAndNext(data, new Date(tick)),
    [data, tick],
  );

  // 시간표가 비었으면 — 업로드 유도 hero.
  if (data.slots.length === 0) {
    return <EmptyTimetableHero studentName={studentName} />;
  }

  return (
    <section className="fade-up">
      <Heading studentName={studentName} current={current} next={next} />
      <TimetableGrid data={data} now={new Date(tick)} onPickCourse={(slot) => {
        const course = semester.find((c) => c.id === slot.courseId);
        if (course) onPickCourse(course);
      }} />
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
          className="mt-2 text-[34px] leading-[1.06] wght-700 text-[var(--color-apple-ink)] sm:text-[44px] md:text-[52px]"
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
      <div className="rounded-[14px] border border-[var(--color-apple-hairline-soft)] bg-white/80 px-4 py-3 backdrop-blur-sm">
        <p
          className="text-[11px] wght-560 uppercase tracking-[0.08em] text-[var(--color-apple-action)]"
          style={{ letterSpacing: "0.08em" }}
        >
          진행 중
        </p>
        <p
          className="mt-1 text-[15px] wght-620 text-[var(--color-apple-ink)] tabular-nums"
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
      <div className="rounded-[14px] border border-[var(--color-apple-hairline-soft)] bg-white/80 px-4 py-3 backdrop-blur-sm">
        <p
          className="text-[11px] wght-560 uppercase tracking-[0.08em] text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "0.08em" }}
        >
          다음 강의
        </p>
        <p
          className="mt-1 text-[15px] wght-620 text-[var(--color-apple-ink)] tabular-nums"
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
      className="text-[13px] wght-450 text-[var(--color-apple-muted)]"
      style={{ letterSpacing: "-0.012em" }}
    >
      오늘 남은 강의 없음 — 자료 정리하기 좋은 날
    </p>
  );
}

/* ─────────────────────────── Grid ─────────────────────────── */

function TimetableGrid({
  data,
  now,
  onPickCourse,
}: {
  data: ReturnType<typeof buildTimetable>;
  now: Date;
  onPickCourse: (slot: CourseSlot) => void;
}) {
  const hours = useMemo(() => {
    const list: number[] = [];
    for (let h = data.hourStart; h <= data.hourEnd; h++) list.push(h);
    return list;
  }, [data.hourStart, data.hourEnd]);

  const totalMinutes = (data.hourEnd - data.hourStart) * 60;
  const minuteOffset = data.hourStart * 60;

  // 현재 시각 line — KST 기준.
  const kst = useMemo(() => new Date(now.getTime() + 9 * 60 * 60 * 1000), [now]);
  const nowMin = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  const nowInRange =
    nowMin >= minuteOffset &&
    nowMin <= minuteOffset + totalMinutes &&
    data.activeWeekdays.some((w) => isKstToday(w, now));

  // 그리드 column = 활성 요일, row = 30분 단위. 60min = 2 row → 정렬 정밀도 확보.
  const rowMin = 30;
  const rowCount = Math.ceil(totalMinutes / rowMin);

  return (
    <div className="mt-10 overflow-hidden rounded-[20px] border border-[var(--color-apple-hairline-soft)] bg-white/70 backdrop-blur-xl elev-1 fade-up fade-up-1">
      <div
        className="grid"
        style={{
          gridTemplateColumns: `64px repeat(${data.activeWeekdays.length}, minmax(0, 1fr))`,
        }}
      >
        {/* Header row */}
        <div aria-hidden />
        {data.activeWeekdays.map((w) => {
          const today = isKstToday(w, now);
          return (
            <div
              key={w}
              className={`px-3 pt-4 pb-3 text-center text-[11px] wght-560 uppercase tracking-[0.08em] ${
                today ? "text-[var(--color-apple-action)]" : "text-[var(--color-apple-muted)]"
              }`}
              style={{ letterSpacing: "0.08em" }}
            >
              {DAY_LABELS_KO[w]}
              {today && (
                <span className="ml-1 inline-block h-1 w-1 rounded-full bg-[var(--color-apple-action)] align-middle" />
              )}
            </div>
          );
        })}

        {/* Time gutter + cell area */}
        <div className="border-t border-[var(--color-apple-hairline-soft)] py-3">
          <div
            className="grid h-full"
            style={{ gridTemplateRows: `repeat(${rowCount}, 1fr)` }}
          >
            {hours.map((h, idx) => (
              <div
                key={h}
                className="px-3 text-[10.5px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
                style={{
                  gridRow: `${idx * 2 + 1} / span 2`,
                  letterSpacing: "-0.012em",
                }}
              >
                {String(h).padStart(2, "0")}
              </div>
            ))}
          </div>
        </div>
        {data.activeWeekdays.map((w) => {
          const daySlots = data.slots.filter((s) => s.slot.weekday === w);
          return (
            <DayColumn
              key={w}
              weekday={w}
              slots={daySlots}
              rowCount={rowCount}
              minuteOffset={minuteOffset}
              rowMin={rowMin}
              today={isKstToday(w, now)}
              nowMin={nowMin}
              nowInRange={nowInRange}
              onPickCourse={onPickCourse}
            />
          );
        })}
      </div>
    </div>
  );
}

function DayColumn({
  slots,
  rowCount,
  minuteOffset,
  rowMin,
  today,
  nowMin,
  nowInRange,
  onPickCourse,
}: {
  weekday: Weekday;
  slots: CourseSlot[];
  rowCount: number;
  minuteOffset: number;
  rowMin: number;
  today: boolean;
  nowMin: number;
  nowInRange: boolean;
  onPickCourse: (slot: CourseSlot) => void;
}) {
  // 현재 시각 라인 위치 (오늘 column에만, 진행 중일 때만).
  const nowOffsetPct =
    today && nowInRange
      ? Math.max(0, Math.min(100, ((nowMin - minuteOffset) / (rowCount * rowMin)) * 100))
      : null;

  return (
    <div className="relative border-t border-l border-[var(--color-apple-hairline-soft)] py-3">
      <div
        className="relative grid h-full"
        style={{ gridTemplateRows: `repeat(${rowCount}, 1fr)` }}
      >
        {/* 30분 단위 hairline */}
        {Array.from({ length: rowCount - 1 }, (_, i) => (
          <div
            key={`l-${i}`}
            className="border-b border-[var(--color-apple-hairline-soft)]/40"
            style={{ gridRow: `${i + 1} / span 1` }}
          />
        ))}

        {slots.map((s) => {
          const startRow = Math.floor((s.slot.startMinute - minuteOffset) / rowMin) + 1;
          const span = Math.max(
            1,
            Math.ceil((s.slot.endMinute - s.slot.startMinute) / rowMin),
          );
          const isNow =
            today && nowMin >= s.slot.startMinute && nowMin < s.slot.endMinute;
          const color = s.color ?? "#0071e3";
          return (
            <button
              key={`${s.courseId}-${s.slot.startMinute}`}
              type="button"
              onClick={() => onPickCourse(s)}
              className={`group spring-press relative mx-1 my-0.5 flex flex-col items-start justify-start rounded-[10px] px-3 py-2 text-left transition-all hover:brightness-95 ${
                isNow ? "now-glow" : ""
              }`}
              style={{
                gridRow: `${startRow} / span ${span}`,
                backgroundColor: tintFromColor(color),
                color: "var(--color-apple-ink)",
                boxShadow: isNow ? undefined : "inset 0 0 0 1px rgba(20,30,50,0.04)",
              }}
              aria-label={`${s.courseName} ${s.slot.startLabel} - ${s.slot.endLabel}`}
            >
              <span
                aria-hidden
                className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full"
                style={{ backgroundColor: color }}
              />
              <span
                className="text-[12.5px] leading-[1.2] wght-620"
                style={{ letterSpacing: "-0.012em" }}
              >
                {s.courseName}
              </span>
              <span
                className="mt-0.5 text-[10.5px] wght-450 tabular-nums opacity-70"
                style={{ letterSpacing: "-0.012em" }}
              >
                {s.slot.startLabel}–{s.slot.endLabel}
                {s.location ? ` · ${s.location}` : ""}
              </span>
            </button>
          );
        })}

        {nowOffsetPct !== null && (
          <div
            aria-hidden
            className="time-bar-pulse pointer-events-none absolute inset-x-0 z-10 flex items-center"
            style={{ top: `${nowOffsetPct}%` }}
          >
            <span className="h-2 w-2 -translate-y-0.5 rounded-full bg-[var(--color-apple-action)]" />
            <span className="ml-1 h-px flex-1 bg-[var(--color-apple-action)] opacity-70" />
          </div>
        )}
      </div>
    </div>
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
        className="mt-2 max-w-[820px] text-[34px] leading-[1.06] wght-700 text-[var(--color-apple-ink)] sm:text-[44px] md:text-[52px]"
        style={{ letterSpacing: "-0.022em" }}
      >
        {greeting}
        <br />
        <span className="text-[var(--color-apple-muted)]">한 학기를 한 장으로 펼쳐볼게요</span>
      </h1>
      <p
        className="mt-5 max-w-[560px] text-[15px] leading-[1.55] wght-450 text-[var(--color-apple-muted)] sm:text-[17px] sm:leading-[1.5]"
        style={{ letterSpacing: "-0.022em" }}
      >
        시간표 한 장만 올려두면 오늘 어디서 뭘 듣는지, 빈 시간은 언제인지 한눈에 들어와요.
      </p>
      <Link
        href="/dashboard/calendar/import?kind=timetable"
        className="mt-8 inline-flex h-[52px] items-center gap-2 rounded-full bg-[var(--color-apple-ink)] px-6 text-[14.5px] wght-560 text-white shadow-[0_2px_8px_rgba(15,23,42,0.12)] transition-all hover:opacity-90 active:scale-[0.98]"
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
 * 강의 컬러를 살짝 옅은 배경 tint로. hex만 처리, 외 케이스는 기본 페어로 fallback.
 */
function tintFromColor(color: string): string {
  if (color.startsWith("#") && (color.length === 7 || color.length === 4)) {
    const c = color.length === 4
      ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      : color;
    const r = Number.parseInt(c.slice(1, 3), 16);
    const g = Number.parseInt(c.slice(3, 5), 16);
    const b = Number.parseInt(c.slice(5, 7), 16);
    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
      // 매우 옅은 tint (alpha 0.10).
      return `rgba(${r}, ${g}, ${b}, 0.10)`;
    }
  }
  return "rgba(0, 113, 227, 0.08)";
}

export { weekdayKoShort };
