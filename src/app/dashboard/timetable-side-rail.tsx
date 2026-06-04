"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { EventView } from "@/lib/data/events";
import type { CourseListItem } from "@/lib/data/materials";
import { formatEventLabel } from "@/lib/format-event";
import { kstStartOfDay } from "@/lib/kst";
import {
  buildTimetable,
  type CourseSlot,
  findNowAndNext,
  type Weekday,
} from "@/lib/timetable-grid";

/**
 * 시간표 우측 사이드 — Apple Wallet 카드 톤.
 *
 * 3섹션이 한 카드 안에 hairline으로 분리:
 *   ① 지금 — 진행 중 강의 카운트다운 또는 다음 강의 시작까지
 *   ② 오늘 남은 — 오늘 시간표 + 오늘 마감 이벤트
 *   ③ 다가오는 시험·과제 — D-day 가장 가까운 1~2개
 *
 * 모든 데이터가 비어있으면 사이드 자체가 안 보임 (페이지가 더 깔끔).
 */
export function TimetableSideRail({
  courses,
  events,
}: {
  courses: CourseListItem[];
  events: EventView[];
}) {
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

  // 1분마다 갱신.
  const [tick, setTick] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const now = useMemo(() => new Date(tick), [tick]);

  const { current, next } = useMemo(() => findNowAndNext(data, now), [data, now]);

  // 오늘 남은 강의 (현재 시각 이후 시작 + 진행 중도 포함).
  const todaysRemaining = useMemo<CourseSlot[]>(() => {
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const order: Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    const todayW = order[kst.getUTCDay()];
    const nowMin = kst.getUTCHours() * 60 + kst.getUTCMinutes();
    return data.slots
      .filter((s) => s.slot.weekday === todayW && s.slot.endMinute > nowMin)
      .sort((a, b) => a.slot.startMinute - b.slot.startMinute);
  }, [data.slots, now]);

  // 오늘 마감 이벤트 (시간표 강의 제외).
  const todaysEvents = useMemo(() => {
    const today = kstStartOfDay(now);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    return events
      .filter((e) => e.kind !== "class")
      .filter((e) => {
        const t = new Date(e.startsAt).getTime();
        return t >= today.getTime() && t < tomorrow.getTime();
      })
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }, [events, now]);

  // 다가오는 시험·과제 (시간표 제외, 오늘 이후 최대 14일).
  const upcomingDeadlines = useMemo(() => {
    const today = kstStartOfDay(now);
    const horizon = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
    return events
      .filter((e) => e.kind === "exam" || e.kind === "assignment")
      .filter((e) => {
        const t = new Date(e.startsAt).getTime();
        return t >= today.getTime() && t <= horizon.getTime();
      })
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
      .slice(0, 2);
  }, [events, now]);

  // 다음 강의가 오늘도 다음 주에도 없으면 "내일 첫 강의" 찾기.
  const nextDayFirst = useMemo<CourseSlot | null>(() => {
    if (current || next) return null;
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const order: Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    // 내일부터 7일 안에서 첫 강의를 찾음.
    for (let i = 1; i <= 7; i++) {
      const targetDay = order[(kst.getUTCDay() + i) % 7];
      const candidates = data.slots
        .filter((s) => s.slot.weekday === targetDay)
        .sort((a, b) => a.slot.startMinute - b.slot.startMinute);
      if (candidates[0]) return candidates[0];
    }
    return null;
  }, [data.slots, current, next, now]);

  return (
    <aside className="fade-up fade-up-2 flex h-full min-h-0 flex-col overflow-hidden rounded-[16px] border border-[var(--color-apple-hairline-soft)] bg-white elev-1">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <SectionNow current={current} next={next} nextDayFirst={nextDayFirst} now={now} />
        {(todaysRemaining.length > 0 || todaysEvents.length > 0) && (
          <SectionToday
            slots={todaysRemaining.filter((s) => s.courseId !== current?.courseId)}
            events={todaysEvents}
            now={now}
          />
        )}
        {upcomingDeadlines.length > 0 && <SectionUpcoming events={upcomingDeadlines} now={now} />}
      </div>
    </aside>
  );
}

/* ─────────────────────────── ① 지금 ─────────────────────────── */

function SectionNow({
  current,
  next,
  nextDayFirst,
  now,
}: {
  current: CourseSlot | null;
  next: CourseSlot | null;
  nextDayFirst: CourseSlot | null;
  now: Date;
}) {
  if (current) {
    const minutesLeft = minutesUntil(now, current.slot.endMinute, current.slot.weekday);
    const color = current.color ?? "#0071e3";
    return (
      <div className="relative p-4">
        <SectionLabel tone="action">진행 중</SectionLabel>
        <h3
          className="mt-2 line-clamp-1 text-[18px] leading-[1.18] wght-700 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.022em" }}
        >
          {current.courseName}
        </h3>
        <div className="mt-2.5 flex items-baseline gap-1">
          <span
            className="text-[34px] leading-none wght-700 tabular-nums text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.028em" }}
          >
            {minutesLeft}
          </span>
          <span
            className="text-[12.5px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            분 남음
          </span>
        </div>
        <p
          className="mt-1 line-clamp-1 text-[11.5px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {current.slot.startLabel}–{current.slot.endLabel}
          {current.location ? ` · ${current.location}` : ""}
        </p>
      </div>
    );
  }
  if (next) {
    const minutesUntilStart = minutesUntil(now, next.slot.startMinute, next.slot.weekday);
    return (
      <div className="p-4">
        <SectionLabel tone="muted">다음 강의</SectionLabel>
        <h3
          className="mt-2 line-clamp-1 text-[18px] leading-[1.18] wght-700 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.022em" }}
        >
          {next.courseName}
        </h3>
        <div className="mt-2.5 flex items-baseline gap-1">
          <span
            className="text-[28px] leading-none wght-700 tabular-nums text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.028em" }}
          >
            {minutesUntilStart > 60
              ? `${Math.floor(minutesUntilStart / 60)}시간 ${minutesUntilStart % 60}`
              : minutesUntilStart}
          </span>
          <span
            className="text-[12.5px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            분 후 시작
          </span>
        </div>
        <p
          className="mt-1 line-clamp-1 text-[11.5px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {next.slot.startLabel}
          {next.location ? ` · ${next.location}` : ""}
        </p>
      </div>
    );
  }
  if (nextDayFirst) {
    return (
      <div className="p-4">
        <SectionLabel tone="muted">내일 첫 강의</SectionLabel>
        <h3
          className="mt-2 line-clamp-1 text-[18px] leading-[1.18] wght-700 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.022em" }}
        >
          {nextDayFirst.courseName}
        </h3>
        <p
          className="mt-1 text-[11.5px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {nextDayFirst.slot.startLabel}
          {nextDayFirst.location ? ` · ${nextDayFirst.location}` : ""}
        </p>
      </div>
    );
  }
  return (
    <div className="p-4">
      <SectionLabel tone="muted">지금</SectionLabel>
      <p
        className="mt-2 text-[14.5px] wght-560 text-[var(--color-apple-ink)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        오늘 남은 강의가 없어요
      </p>
    </div>
  );
}

/* ─────────────────────────── ② 오늘 남은 ─────────────────────────── */

function SectionToday({
  slots,
  events,
  now,
}: {
  slots: CourseSlot[];
  events: EventView[];
  now: Date;
}) {
  const items: Array<{
    key: string;
    timeMin: number;
    color: string;
    label: string;
    title: string;
    sub: string;
  }> = [];
  for (const s of slots) {
    items.push({
      key: `c-${s.courseId}-${s.slot.startMinute}`,
      timeMin: s.slot.startMinute,
      color: s.color ?? "#7aa6d6",
      label: s.slot.startLabel,
      title: s.courseName,
      sub: s.location ?? "강의",
    });
  }
  for (const e of events) {
    const t = new Date(e.startsAt);
    const kst = new Date(t.getTime() + 9 * 60 * 60 * 1000);
    const timeMin = kst.getUTCHours() * 60 + kst.getUTCMinutes();
    items.push({
      key: `e-${e.id}`,
      timeMin,
      color: kindColor(e.kind),
      label: e.allDay
        ? "종일"
        : `${String(kst.getUTCHours()).padStart(2, "0")}:${String(kst.getUTCMinutes()).padStart(2, "0")}`,
      title: formatEventLabel(e),
      sub: kindLabel(e.kind),
    });
  }
  items.sort((a, b) => a.timeMin - b.timeMin);
  if (items.length === 0) return null;

  return (
    <div className="border-t border-[var(--color-apple-hairline-soft)] p-4">
      <SectionLabel tone="muted">오늘 남은 일정</SectionLabel>
      <ul className="mt-2.5 flex flex-col gap-2">
        {items.slice(0, 4).map((it) => (
          <li key={it.key} className="row-shift flex items-center gap-2.5">
            <span
              aria-hidden
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: it.color }}
            />
            <span
              className="w-[42px] shrink-0 text-[11px] wght-560 tabular-nums text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              {it.label}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className="line-clamp-1 text-[12.5px] wght-560 text-[var(--color-apple-ink)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                {it.title}
              </p>
              <p
                className="line-clamp-1 text-[10.5px] wght-450 text-[var(--color-apple-muted)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                {it.sub}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─────────────────────────── ③ 다가오는 시험·과제 ─────────────────────────── */

function SectionUpcoming({ events, now }: { events: EventView[]; now: Date }) {
  const today = kstStartOfDay(now);
  return (
    <div className="border-t border-[var(--color-apple-hairline-soft)] p-4">
      <SectionLabel tone="muted">다가오는 마감</SectionLabel>
      <ul className="mt-2.5 flex flex-col gap-2.5">
        {events.map((e) => {
          const days = Math.round((new Date(e.startsAt).getTime() - today.getTime()) / 86400000);
          const dDay = days === 0 ? "오늘" : `D-${days}`;
          const tone: "urgent" | "warn" | "calm" =
            days <= 1 ? "urgent" : days <= 3 ? "warn" : "calm";
          const colors = toneColor(tone);
          return (
            <Link
              key={e.id}
              href="/dashboard/calendar"
              className="spring-press flex items-center justify-between gap-3 rounded-[10px] bg-[var(--color-apple-pearl)]/60 px-3 py-2 transition-colors hover:bg-[var(--color-apple-pearl)]"
            >
              <div className="min-w-0 flex-1">
                <p
                  className="line-clamp-1 text-[12.5px] wght-560 text-[var(--color-apple-ink)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  {formatEventLabel(e)}
                </p>
                <p
                  className="line-clamp-1 text-[10.5px] wght-450 text-[var(--color-apple-muted)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  {kindLabel(e.kind)}
                </p>
              </div>
              <span
                className={`shrink-0 text-[13px] wght-700 tabular-nums ${colors.text}`}
                style={{ letterSpacing: "-0.012em" }}
              >
                {dDay}
              </span>
            </Link>
          );
        })}
      </ul>
    </div>
  );
}

/* ─────────────────────────── Utils ─────────────────────────── */

function SectionLabel({ tone, children }: { tone: "action" | "muted"; children: React.ReactNode }) {
  return (
    <p
      className={`text-[10px] uppercase wght-620 ${
        tone === "action" ? "text-[var(--color-apple-action)]" : "text-[var(--color-apple-muted)]"
      }`}
      style={{ letterSpacing: "0.08em" }}
    >
      {children}
    </p>
  );
}

function minutesUntil(now: Date, targetMin: number, w: Weekday): number {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const order: Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const todayW = order[kst.getUTCDay()];
  if (todayW !== w) return Math.max(0, targetMin);
  const nowMin = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  return Math.max(0, targetMin - nowMin);
}

function kindColor(kind: EventView["kind"]): string {
  switch (kind) {
    case "exam":
      return "#e0445e";
    case "assignment":
      return "#cc7a30";
    case "presentation":
      return "#7aa6d6";
    case "class":
      return "#7fb38c";
    case "etc":
      return "#a08bc4";
  }
}

function kindLabel(kind: EventView["kind"]): string {
  switch (kind) {
    case "exam":
      return "시험";
    case "assignment":
      return "과제";
    case "presentation":
      return "발표";
    case "class":
      return "강의";
    case "etc":
      return "일정";
  }
}

function toneColor(tone: "urgent" | "warn" | "calm"): { text: string } {
  switch (tone) {
    case "urgent":
      return { text: "text-[var(--color-urgent)]" };
    case "warn":
      return { text: "text-[#cc7a30]" };
    case "calm":
      return { text: "text-[var(--color-apple-action)]" };
  }
}
