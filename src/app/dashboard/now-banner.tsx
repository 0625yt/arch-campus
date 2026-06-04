"use client";

import { useEffect, useMemo, useState } from "react";
import type { CourseListItem } from "@/lib/data/materials";
import { buildTimetable, type CourseSlot, findNowAndNext } from "@/lib/timetable-grid";

/**
 * NowBanner — 시간표 위 "지금 / 다음" 강조 한 줄.
 *
 * 화면 열자마자 "지금 뭘 해야 하나"가 가장 먼저 잡히게.
 * Apple Calendar 상단 배너 톤. 친절체 카피 없음(명사형).
 */
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

  if (data.slots.length === 0) return null;

  const minutesUntil = next ? minutesUntilSlot(next, new Date(tick)) : null;

  return (
    <div className="flex items-center gap-3 rounded-[14px] border border-[var(--color-apple-action)]/15 bg-[var(--color-apple-action)]/[0.05] px-4 py-2.5">
      {current ? (
        <>
          <NowDot />
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            <span
              className="text-[10px] uppercase wght-620 text-[var(--color-apple-action)]"
              style={{ letterSpacing: "0.08em" }}
            >
              지금
            </span>
            <span
              className="line-clamp-1 text-[16px] wght-700 text-[var(--color-apple-ink)] sm:text-[17px]"
              style={{ letterSpacing: "-0.018em" }}
            >
              {current.courseName}
            </span>
          </div>
          <span
            className="shrink-0 text-[12.5px] wght-560 tabular-nums text-[var(--color-apple-muted)]"
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
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            <span
              className="line-clamp-1 text-[16px] wght-700 text-[var(--color-apple-ink)] sm:text-[17px]"
              style={{ letterSpacing: "-0.018em" }}
            >
              {next.courseName}
            </span>
            <span
              className="shrink-0 text-[12.5px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              {next.slot.startLabel}
            </span>
          </div>
          {minutesUntil !== null && minutesUntil >= 0 && (
            <span
              className="shrink-0 text-[12.5px] wght-560 tabular-nums text-[var(--color-apple-action)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              {formatUntil(minutesUntil)}
            </span>
          )}
        </>
      ) : (
        <span
          className="text-[13px] wght-560 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          오늘 일정 마무리
        </span>
      )}
    </div>
  );
}

/** 코발트 상태 점 + breathe — now-glow 톤. (DESIGN §10의 장식 점과 구분되는 상태 표시.) */
function NowDot() {
  return (
    <span aria-hidden className="relative inline-flex h-2 w-2 shrink-0">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-apple-action)] opacity-60" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-apple-action)]" />
    </span>
  );
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
