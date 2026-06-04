"use client";

import { useEffect, useMemo, useState } from "react";
import type { CourseListItem } from "@/lib/data/materials";
import {
  buildTimetable,
  type CourseSlot,
  findNowAndNext,
  type Weekday,
} from "@/lib/timetable-grid";

/**
 * NowBanner — 상단 주간 날짜 strip + "지금/다음" 인라인.
 *
 * lazyweb 레퍼런스(Saturn·Amie): 학생 캘린더는 상단에 요일+날짜 strip을 두고
 * 오늘을 강조 pill로, 그 끝에 현재 상태(지금/다음)를 붙인다.
 * 친절체 카피 없음(명사형).
 */

const STRIP_DAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI"];
const KO: Record<Weekday, string> = {
  MON: "월",
  TUE: "화",
  WED: "수",
  THU: "목",
  FRI: "금",
  SAT: "토",
  SUN: "일",
};
const JS_DAY: Record<Weekday, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

export function NowBanner({ courses }: { courses: CourseListItem[] }) {
  const data = useMemo(() => {
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

  const [tick, setTick] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const { current, next } = useMemo(() => findNowAndNext(data, new Date(tick)), [data, tick]);

  // 이번 주 월~금 날짜 (KST). 오늘이 속한 주의 월요일 기준.
  const week = useMemo(() => buildWeek(new Date(tick)), [tick]);
  const todayJsDay = useMemo(() => {
    const kst = new Date(new Date(tick).getTime() + 9 * 60 * 60 * 1000);
    return kst.getUTCDay();
  }, [tick]);

  if (data.slots.length === 0) return null;

  const minutesUntil = next ? minutesUntilSlot(next, new Date(tick)) : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      {/* 주간 날짜 strip */}
      <div className="flex items-center gap-1">
        {STRIP_DAYS.map((w) => {
          const isToday = JS_DAY[w] === todayJsDay;
          return (
            <div
              key={w}
              className={`flex h-9 min-w-[40px] flex-col items-center justify-center rounded-[10px] px-2 transition-colors ${
                isToday
                  ? "bg-[var(--color-apple-action)] text-white"
                  : "text-[var(--color-apple-muted)]"
              }`}
            >
              <span className="text-[9px] uppercase wght-620" style={{ letterSpacing: "0.06em" }}>
                {KO[w]}
              </span>
              <span
                className={`text-[13px] wght-700 tabular-nums ${
                  isToday ? "text-white" : "text-[var(--color-apple-ink)]"
                }`}
                style={{ letterSpacing: "-0.018em" }}
              >
                {week[w]}
              </span>
            </div>
          );
        })}
      </div>

      {/* 지금/다음 인라인 */}
      <div className="flex min-w-0 items-center gap-2">
        {current ? (
          <>
            <NowDot />
            <span
              className="text-[10px] uppercase wght-620 text-[var(--color-apple-action)]"
              style={{ letterSpacing: "0.08em" }}
            >
              지금
            </span>
            <span
              className="line-clamp-1 text-[15px] wght-700 text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "-0.018em" }}
            >
              {current.courseName}
            </span>
            <span
              className="shrink-0 text-[12px] wght-560 tabular-nums text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              {current.slot.endLabel}까지
            </span>
          </>
        ) : next ? (
          <>
            <span
              className="text-[10px] uppercase wght-620 text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "0.08em" }}
            >
              다음
            </span>
            <span
              className="line-clamp-1 text-[15px] wght-700 text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "-0.018em" }}
            >
              {next.courseName}
            </span>
            <span
              className="shrink-0 text-[12px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              {next.slot.startLabel}
            </span>
            {minutesUntil !== null && minutesUntil >= 0 && (
              <span
                className="shrink-0 text-[12px] wght-560 tabular-nums text-[var(--color-apple-action)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                {formatUntil(minutesUntil)}
              </span>
            )}
          </>
        ) : (
          <span
            className="text-[12.5px] wght-560 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            오늘 일정 마무리
          </span>
        )}
      </div>
    </div>
  );
}

/** 코발트 상태 점 + breathe. */
function NowDot() {
  return (
    <span aria-hidden className="relative inline-flex h-2 w-2 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-apple-action)] opacity-60" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-apple-action)]" />
    </span>
  );
}

/** 이번 주 월~금의 "일(day-of-month)" 숫자 (KST). */
function buildWeek(now: Date): Record<Weekday, number> {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const jsDay = kst.getUTCDay(); // 0=일
  // 월요일까지의 오프셋 (월=1 기준). 일요일(0)이면 -6.
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  const result = {} as Record<Weekday, number>;
  STRIP_DAYS.forEach((w, idx) => {
    const d = new Date(kst);
    d.setUTCDate(kst.getUTCDate() + mondayOffset + idx);
    result[w] = d.getUTCDate();
  });
  return result;
}

/** next 슬롯 시작까지 남은 분 (KST 기준). */
function minutesUntilSlot(next: CourseSlot, now: Date): number {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const nowMin = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  return next.slot.startMinute - nowMin;
}

function formatUntil(min: number): string {
  if (min < 60) return `${min}분 후`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}시간 후` : `${h}시간 ${m}분 후`;
}
