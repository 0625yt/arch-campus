"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { COURSE_COLOR, type CourseSlug } from "@/app/dashboard/study/data";
import { Dot } from "@/components/primitives";

type TaskKind = "과제" | "시험" | "발표" | "퀴즈";

interface Task {
  course: CourseSlug;
  kind: TaskKind;
  title: string;
  due: Date;
  weight: string;
  href: string;
  source: string;
}

interface NextItem {
  startHour: number;
  endHour: number;
  course: CourseSlug | null;
  kind: string;
  title: string;
  meta: string;
  href: string;
}

interface WeekDay {
  day: string;
  date: number;
  level: 0 | 1 | 2 | 3;
  events: { course?: CourseSlug; title: string; urgent?: boolean }[];
}

const NEXT_TIMELINE: NextItem[] = [
  {
    startHour: 12,
    endHour: 13,
    course: "자료구조",
    kind: "과제",
    title: "BST 삭제 케이스 마무리",
    meta: "predecessor 선택 부분부터",
    href: "/dashboard/chat?q=BST%20%EC%82%AD%EC%A0%9C%20%EC%9D%B4%EC%96%B4%EC%84%9C",
  },
  {
    startHour: 14,
    endHour: 15,
    course: "운영체제",
    kind: "수업",
    title: "운영체제 강의 — 동기화",
    meta: "수업 전 8분 브리핑",
    href: "/dashboard/study/%EC%9A%B4%EC%98%81%EC%B2%B4%EC%A0%9C/process-sync",
  },
  {
    startHour: 19,
    endHour: 20,
    course: "데이터베이스",
    kind: "팀플",
    title: "데이터베이스 발표 역할 정리",
    meta: "오늘 19:00 전 회의",
    href: "/dashboard/tools/presentation",
  },
] as const;

const WEEK: WeekDay[] = [
  {
    day: "월",
    date: 5,
    level: 2,
    events: [{ course: "자료구조", title: "과제 3 제출", urgent: true }],
  },
  {
    day: "화",
    date: 6,
    level: 3,
    events: [{ course: "운영체제", title: "중간고사", urgent: true }],
  },
  { day: "수", date: 7, level: 1, events: [] },
  { day: "목", date: 8, level: 2, events: [{ course: "데이터베이스", title: "발표 리허설" }] },
  { day: "금", date: 9, level: 2, events: [{ course: "알고리즘", title: "퀴즈 2" }] },
  { day: "토", date: 10, level: 0, events: [] },
  { day: "일", date: 11, level: 0, events: [] },
];

const TODAY_INDEX = 1; // 화

const STATS = {
  streak: 5,
  weekHours: 5.5,
  accuracy: 78,
  problems: 18,
};

function startPrompt(task: Task) {
  return [
    `${task.course} ${task.title}을 지금 시작할게.`,
    "내가 바로 실행할 수 있게 1단계부터 같이 진행해줘.",
    "파일명 규칙, 제출 조건, 테스트 케이스, 시간복잡도 설명까지 빠뜨리지 말고 체크해줘.",
    "한 번에 길게 설명하지 말고 현재 단계에서 내가 해야 할 행동만 알려줘.",
  ].join(" ");
}

function dateLabel(d: Date) {
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${days[d.getDay()]}요일`;
}

export default function TodayPage() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 0, 0);

  const focus: Task = {
    course: "자료구조",
    kind: "과제",
    title: "이진 탐색 트리 구현",
    due: todayEnd,
    weight: "10%",
    href: "/dashboard/study/%EC%9E%90%EB%A3%8C%EA%B5%AC%EC%A1%B0/bst",
    source: "과제 안내 캡처",
  };

  return (
    <div className="bg-[var(--color-apple-pearl)]">
      <div className="mx-auto w-full max-w-[1080px] px-6 pb-24 pt-8 sm:px-10 sm:pb-28 sm:pt-12 md:px-12">
        {/* ─── Top bar ─────────────── */}
        <header className="fade-up flex items-baseline justify-between gap-3">
          <p
            className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {now ? dateLabel(now) : "—"}
          </p>
          <Link
            href="/dashboard"
            className="group inline-flex items-baseline text-[12px] wght-450 text-[var(--color-apple-action)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            <span className="border-b border-transparent group-hover:border-[var(--color-apple-action)]">
              내 캠퍼스
            </span>
            <span className="ml-0.5">›</span>
          </Link>
        </header>

        {/* ─── Hero · 풀스크린 카운트다운 ─── */}
        <HeroCountdown
          now={now}
          target={focus.due}
          task={focus}
          className="mt-10 fade-up fade-up-1 sm:mt-14"
        />

        {/* ─── 오늘의 흐름 타임라인 ─── */}
        <Timeline now={now} className="mt-16 fade-up fade-up-2 sm:mt-20" />

        {/* ─── 이번 주 ─── */}
        <WeekStrip className="mt-14 fade-up fade-up-3 sm:mt-16" />

        {/* ─── 동기부여 Bento ─── */}
        <MotivationBento className="mt-14 fade-up fade-up-4 sm:mt-16" />
      </div>
    </div>
  );
}

/* ──────────── Hero ──────────── */

function HeroCountdown({
  now,
  target,
  task,
  className,
}: {
  now: Date | null;
  target: Date;
  task: Task;
  className?: string;
}) {
  const prompt = startPrompt(task);

  let h = 0,
    m = 0,
    s = 0,
    diffSec = 0;
  if (now) {
    diffSec = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
    h = Math.floor(diffSec / 3600);
    m = Math.floor((diffSec % 3600) / 60);
    s = diffSec % 60;
  }

  const isUrgent = diffSec < 6 * 3600; // 6시간 이내

  return (
    <section className={className}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span
          className="inline-flex items-center text-[13px] wght-560 text-[var(--color-urgent)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          <span
            aria-hidden
            className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-urgent)] pulse-dot"
          />
          오늘 자정 마감 · {task.weight}
        </span>
        <span className="text-[var(--color-apple-hairline)]">·</span>
        <div
          className={`flex items-baseline gap-2 ${
            isUrgent ? "text-[var(--color-urgent)]" : "text-[var(--color-apple-ink)]"
          }`}
        >
          <ClockCell value={h} unit="h" />
          <ClockCell value={m} unit="m" />
          <ClockCell value={s} unit="s" subtle />
        </div>
      </div>

      <h1
        className="mt-6 max-w-[760px] text-[34px] leading-[1.06] wght-620 text-[var(--color-apple-ink)] sm:text-[48px] md:text-[56px]"
        style={{ letterSpacing: "-0.012em" }}
      >
        <span className="text-[var(--color-apple-muted)]">자료구조 ·</span> {task.title}.
      </h1>
      <p
        className="mt-4 max-w-[560px] text-[15px] leading-[1.55] wght-450 text-[var(--color-apple-muted)] sm:text-[17px] sm:leading-[1.5]"
        style={{ letterSpacing: "-0.022em" }}
      >
        파일명은 학번.txt, 실행 결과 캡처와 시간복잡도 설명을 같이 넣어주세요. 마감을 놓치면{" "}
        {task.weight} 감점이에요.
      </p>

      <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
        <Link
          href={`/dashboard/chat?q=${encodeURIComponent(prompt)}`}
          className="group inline-flex h-[52px] items-center justify-center rounded-full bg-[var(--color-apple-action)] px-8 text-[17px] wght-560 text-white transition-all duration-150 hover:bg-[var(--color-apple-action-hover)] active:scale-[0.97]"
          style={{ letterSpacing: "-0.012em" }}
        >
          지금 시작하기
          <span className="ml-1.5 transition-transform group-hover:translate-x-0.5">›</span>
        </Link>
        <Link
          href={task.href}
          className="group inline-flex h-[52px] items-center text-[17px] wght-450 text-[var(--color-apple-action)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          <span className="border-b border-transparent group-hover:border-[var(--color-apple-action)]">
            과제 자료 열기
          </span>
          <span className="ml-1 transition-transform group-hover:translate-x-0.5">›</span>
        </Link>
      </div>
    </section>
  );
}

function ClockCell({
  value,
  unit,
  subtle,
}: {
  value: number;
  unit: "h" | "m" | "s";
  subtle?: boolean;
}) {
  return (
    <div className="flex items-baseline">
      <span
        className={`tabular-nums leading-none wght-560 ${
          subtle
            ? "text-[28px] sm:text-[36px] opacity-60"
            : "text-[36px] sm:text-[52px] md:text-[60px]"
        }`}
        style={{ letterSpacing: "-0.024em" }}
      >
        {value.toString().padStart(2, "0")}
      </span>
      <span
        className={`ml-1 ${
          subtle ? "text-[13px] sm:text-[15px]" : "text-[14px] sm:text-[17px]"
        } wght-450 text-[var(--color-apple-muted)]`}
        style={{ letterSpacing: "-0.012em" }}
      >
        {unit}
      </span>
    </div>
  );
}

/* ──────────── Timeline ──────────── */

function Timeline({ now, className }: { now: Date | null; className?: string }) {
  const currentHour = now?.getHours() ?? 0;

  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2
          className="text-[24px] leading-[1.1] wght-620 text-[var(--color-apple-ink)] sm:text-[28px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          오늘의 흐름.
        </h2>
        <Link
          href="/dashboard/calendar"
          className="group inline-flex items-baseline text-[14px] wght-450 text-[var(--color-apple-action)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          <span className="border-b border-transparent group-hover:border-[var(--color-apple-action)]">
            전체 일정
          </span>
          <span className="ml-1">›</span>
        </Link>
      </div>

      <ol className="relative mt-8 space-y-3">
        {/* 왼쪽 세로 라인 */}
        <div className="absolute left-[44px] top-[14px] bottom-[14px] w-px bg-[var(--color-apple-hairline)] sm:left-[68px]" />

        {NEXT_TIMELINE.map((item, idx) => {
          const isPast = currentHour >= item.endHour;
          const isCurrent = currentHour >= item.startHour && currentHour < item.endHour;
          const dotColor = item.course ? COURSE_COLOR[item.course] : "#86868b";

          return (
            <li key={idx} className="relative">
              <Link href={item.href} className="group flex items-stretch gap-4 sm:gap-6">
                {/* 시간 + 점 */}
                <div className="relative flex w-[80px] shrink-0 items-center sm:w-[104px]">
                  <span
                    className={`tabular-nums text-[14px] wght-560 ${
                      isPast
                        ? "text-[var(--color-apple-muted)]"
                        : isCurrent
                          ? "text-[var(--color-apple-action)]"
                          : "text-[var(--color-apple-ink)]"
                    }`}
                    style={{ letterSpacing: "-0.012em" }}
                  >
                    {item.startHour.toString().padStart(2, "0")}:00
                  </span>
                  {/* 점 */}
                  <span
                    className={`absolute right-0 top-1/2 z-10 h-3 w-3 -translate-y-1/2 translate-x-1/2 rounded-full border-2 border-[var(--color-apple-pearl)] transition-transform group-hover:scale-110 ${
                      isCurrent ? "ring-4 ring-white" : ""
                    }`}
                    style={{ backgroundColor: isPast ? "#d2d2d7" : dotColor }}
                  />
                </div>

                {/* 카드 */}
                <div
                  className={`flex flex-1 items-center justify-between gap-4 rounded-[12px] px-5 py-4 transition-all duration-200 group-hover:translate-x-0.5 ${
                    isPast
                      ? "border border-[var(--color-apple-hairline)] bg-transparent"
                      : isCurrent
                        ? "bg-white ring-2 ring-[var(--color-apple-action)]"
                        : "bg-white"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {isPast ? (
                        <span className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-success)]">
                          ✓ 완료
                        </span>
                      ) : (
                        <>
                          <span className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
                            {item.kind}
                          </span>
                          {isCurrent && (
                            <span className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-action)]">
                              · 지금
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    <p
                      className={`mt-1 truncate text-[15px] wght-560 ${
                        isPast ? "text-[var(--color-apple-muted)]" : "text-[var(--color-apple-ink)]"
                      }`}
                      style={{ letterSpacing: "-0.012em" }}
                    >
                      {item.title}
                    </p>
                    <p
                      className="mt-0.5 truncate text-[12px] wght-450 text-[var(--color-apple-muted)]"
                      style={{ letterSpacing: "-0.022em" }}
                    >
                      {item.meta}
                    </p>
                  </div>
                  <span className="shrink-0 text-[15px] text-[var(--color-apple-muted)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--color-apple-action)]">
                    ›
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ──────────── Week Strip ──────────── */

function WeekStrip({ className }: { className?: string }) {
  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2
          className="text-[24px] leading-[1.1] wght-620 text-[var(--color-apple-ink)] sm:text-[28px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          이번 주.
        </h2>
        <span
          className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          5월 5일 — 11일
        </span>
      </div>

      <div className="mt-8 grid grid-cols-7 gap-2 sm:gap-3">
        {WEEK.map((d, idx) => {
          const isToday = idx === TODAY_INDEX;
          const isPast = idx < TODAY_INDEX;
          const hasUrgent = d.events.some((e) => e.urgent);

          return (
            <Link
              key={d.day}
              href="/dashboard/calendar"
              className={`group flex aspect-[3/4] flex-col rounded-[12px] p-3 transition-transform duration-200 hover:-translate-y-0.5 sm:p-4 ${
                isToday
                  ? "bg-[var(--color-apple-ink)] text-white"
                  : isPast
                    ? "bg-white opacity-60"
                    : "bg-white"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span
                  className={`text-[11px] wght-560 uppercase tracking-[0.06em] ${
                    isToday
                      ? "text-white/60"
                      : hasUrgent
                        ? "text-[var(--color-urgent)]"
                        : "text-[var(--color-apple-muted)]"
                  }`}
                >
                  {d.day}
                </span>
                <span
                  className={`text-[18px] wght-620 sm:text-[20px] ${
                    isToday ? "text-white" : "text-[var(--color-apple-ink)]"
                  }`}
                  style={{ letterSpacing: "-0.012em" }}
                >
                  {d.date}
                </span>
              </div>

              {/* 이벤트 칩들 */}
              <div className="mt-auto space-y-1">
                {d.events.length === 0 ? (
                  <span
                    className={`text-[10px] wght-450 ${
                      isToday ? "text-white/40" : "text-[var(--color-apple-hairline)]"
                    }`}
                    style={{ letterSpacing: "-0.012em" }}
                  >
                    없음
                  </span>
                ) : (
                  d.events.map((e, i) => (
                    <div key={i} className="flex items-center gap-1">
                      {e.course && (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: COURSE_COLOR[e.course] }}
                        />
                      )}
                      <span
                        className={`truncate text-[10.5px] wght-450 ${
                          isToday
                            ? "text-white/80"
                            : e.urgent
                              ? "text-[var(--color-urgent)] wght-560"
                              : "text-[var(--color-apple-muted)]"
                        }`}
                        style={{ letterSpacing: "-0.012em" }}
                      >
                        {e.title}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/* ──────────── Motivation Bento ──────────── */

function MotivationBento({ className }: { className?: string }) {
  return (
    <section className={className}>
      <h2
        className="text-[24px] leading-[1.1] wght-620 text-[var(--color-apple-ink)] sm:text-[28px]"
        style={{ letterSpacing: "-0.012em" }}
      >
        잘 해내고 있어요.
      </h2>

      <div className="mt-8 grid gap-4 md:grid-cols-3 md:gap-5">
        {/* 큰 — 연속 학습 */}
        <div className="md:col-span-2">
          <div className="flex h-full min-h-[220px] flex-col justify-between rounded-[18px] bg-white p-7 sm:p-8">
            <div>
              <p
                className="text-[13px] wght-560"
                style={{ letterSpacing: "-0.012em", color: "var(--color-apple-streak)" }}
              >
                연속 학습
              </p>
              <h3
                className="mt-3 text-[44px] leading-[1.0] wght-620 text-[var(--color-apple-ink)] sm:text-[56px]"
                style={{ letterSpacing: "-0.024em" }}
              >
                {STATS.streak}일째.
              </h3>
              <p
                className="mt-3 max-w-[400px] text-[14px] leading-[1.5] wght-450 text-[var(--color-apple-muted)]"
                style={{ letterSpacing: "-0.022em" }}
              >
                이번 주 {STATS.weekHours}시간 공부했어요. 지난주보다 1시간 30분 더 했어요.
              </p>
            </div>

            {/* 7일 시각화 */}
            <div className="mt-6 flex items-end gap-1.5">
              {[2, 3, 1, 3, 2, 4, 3].map((level, i) => (
                <div
                  key={i}
                  className="h-10 flex-1 rounded-[3px] transition-all"
                  style={{
                    backgroundColor:
                      level >= 4
                        ? "var(--color-apple-streak)"
                        : level >= 3
                          ? "rgba(255, 149, 0, 0.7)"
                          : level >= 2
                            ? "rgba(255, 149, 0, 0.4)"
                            : level >= 1
                              ? "rgba(255, 149, 0, 0.2)"
                              : "var(--color-apple-hairline)",
                    height: `${20 + level * 8}px`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* 작은 — 정답률 */}
        <Link
          href="/dashboard/history"
          className="group flex min-h-[220px] flex-col justify-between rounded-[18px] bg-white p-7 transition-transform duration-200 hover:-translate-y-0.5"
        >
          <p
            className="text-[13px] wght-560"
            style={{ letterSpacing: "-0.012em", color: "var(--color-apple-success)" }}
          >
            정답률
          </p>

          <div>
            <p
              className="text-[44px] leading-[1.0] wght-620 text-[var(--color-apple-ink)] sm:text-[56px]"
              style={{ letterSpacing: "-0.024em" }}
            >
              {STATS.accuracy}
              <span className="text-[28px] text-[var(--color-apple-muted)]">%</span>
            </p>
            <p
              className="mt-2 text-[13px] wght-450 text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.022em" }}
            >
              {STATS.problems}문제 풀었어요
            </p>

            {/* 도넛형 게이지 */}
            <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-[var(--color-apple-hairline)]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${STATS.accuracy}%`,
                  backgroundColor: "var(--color-apple-success)",
                }}
              />
            </div>
          </div>
        </Link>
      </div>

      {/* 1줄 메시지 */}
      <p
        className="mt-12 text-center text-[15px] wght-450 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.022em" }}
      >
        오늘 하나만 끝내면 6일 연속이에요.
      </p>
    </section>
  );
}
