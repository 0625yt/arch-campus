"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BellRing, CalendarCheck2, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Arrow, Dot, Divider } from "@/components/primitives";
import { PageShell, PageFooter } from "@/components/page-shell";

/* ─────────── data (mock) ─────────── */

const COURSE = {
  운영체제: "#7aa6d6",
  자료구조: "#7fb38c",
  데이터베이스: "#cca06b",
  알고리즘: "#a08bc4",
  영어회화: "#d68a9c",
} as const;

type CourseName = keyof typeof COURSE;

type EventKind = "과제" | "시험" | "발표" | "퀴즈";
const EVENT_KINDS: EventKind[] = ["시험", "과제", "발표", "퀴즈"];
const COURSE_NAMES = Object.keys(COURSE) as CourseName[];

interface CalEvent {
  id: string;
  course: CourseName;
  kind: EventKind;
  title: string;
  due: Date;
  weight?: string;
}

function dayOffset(days: number, hour = 23, minute = 59) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

const INITIAL_EVENTS: CalEvent[] = [
  { id: "e1", course: "자료구조", kind: "과제", title: "과제 3 — 이진 탐색 트리 구현", due: dayOffset(0), weight: "10%" },
  { id: "e2", course: "운영체제", kind: "시험", title: "중간고사", due: dayOffset(4, 8, 30), weight: "30%" },
  { id: "e3", course: "데이터베이스", kind: "발표", title: "정규화 사례 분석", due: dayOffset(5, 14, 0), weight: "15%" },
  { id: "e4", course: "알고리즘", kind: "퀴즈", title: "퀴즈 2 — 동적 계획법", due: dayOffset(5, 11, 0), weight: "5%" },
  { id: "e5", course: "영어회화", kind: "과제", title: "Speaking 과제 4", due: dayOffset(6), weight: "8%" },
  { id: "e6", course: "자료구조", kind: "과제", title: "5장 균형 트리 읽기", due: dayOffset(7), weight: "—" },
  { id: "e7", course: "데이터베이스", kind: "퀴즈", title: "퀴즈 3 — 조인", due: dayOffset(11, 11, 0), weight: "5%" },
  { id: "e8", course: "알고리즘", kind: "시험", title: "기말고사", due: dayOffset(28, 8, 30), weight: "35%" },
];

interface SyllabusFile {
  id: string;
  course: CourseName;
  professor: string;
  uploaded: string;
  pages: number;
  eventCount: number;
}

const SYLLABI: SyllabusFile[] = [
  { id: "s1", course: "운영체제", professor: "김지훈 교수", uploaded: "방금", pages: 12, eventCount: 4 },
  { id: "s2", course: "자료구조", professor: "박서연 교수", uploaded: "어제", pages: 9, eventCount: 3 },
  { id: "s3", course: "데이터베이스", professor: "이민호 교수", uploaded: "3일 전", pages: 11, eventCount: 5 },
  { id: "s4", course: "알고리즘", professor: "최도현 교수", uploaded: "1주 전", pages: 14, eventCount: 4 },
];

/* ─────────── helpers ─────────── */

function dateInputValue(d: Date) {
  const yyyy = d.getFullYear();
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const dd = d.getDate().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function timeInputValue(d: Date) {
  const hh = d.getHours().toString().padStart(2, "0");
  const mi = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mi}`;
}

function dueLabel(d: Date) {
  const now = new Date();
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const days = Math.floor((d.getTime() - startOfToday.getTime()) / 86400000);
  const time = `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  if (days === 0) return time === "23:59" ? "오늘 자정" : `오늘 ${time}`;
  if (days === 1) return time === "23:59" ? "내일 자정" : `내일 ${time}`;
  if (days <= 7) {
    const weekday = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
    return time === "23:59" ? `${weekday}요일` : `${weekday}요일 ${time}`;
  }
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function daysAway(d: Date) {
  const now = new Date();
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  return Math.floor((d.getTime() - startOfToday.getTime()) / 86400000);
}

function groupByWeek(events: CalEvent[]) {
  const result: { label: string; events: CalEvent[] }[] = [
    { label: "이번 주", events: [] },
    { label: "다음 주", events: [] },
    { label: "이번 달 이후", events: [] },
  ];
  for (const e of events) {
    const d = daysAway(e.due);
    if (d <= 7) result[0].events.push(e);
    else if (d <= 14) result[1].events.push(e);
    else result[2].events.push(e);
  }
  return result.filter((g) => g.events.length > 0);
}

/* ─────────── page ─────────── */

export default function CalendarPage() {
  const [events, setEvents] = useState<CalEvent[]>(INITIAL_EVENTS);

  const sorted = [...events].sort((a, b) => a.due.getTime() - b.due.getTime());
  const groups = groupByWeek(sorted);
  const radar = sorted.filter((e) => daysAway(e.due) <= 7).slice(0, 4);
  const todayCount = sorted.filter((e) => daysAway(e.due) <= 1).length;

  function updateEvent(id: string, patch: Partial<CalEvent>) {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function deleteEvent(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <PageShell width="md">
      <header className="fade-up">
        <p className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
          마감 레이더
        </p>
        <h1 className="mt-3 text-[27px] leading-[1.23] wght-700 kerning-tight text-[var(--color-fg-strong)] sm:text-[32px]">
          일정표가 아니라, 놓치면 위험한 것부터 보여줘야 해요
        </h1>
        <p className="mt-3 max-w-[560px] text-[13.5px] leading-[1.6] wght-450 kerning-tight text-[var(--color-fg-muted)]">
          강의계획서를 올리면 시험·과제·발표가 위험도 순서로 정리되고, 바로 준비 액션으로 이어져요.
        </p>
      </header>

      <RadarSummary
        className="mt-7 fade-up fade-up-1"
        todayCount={todayCount}
        total={events.length}
      />

      <DeadlineRadar className="mt-8 fade-up fade-up-2" events={radar} />

      <ReminderMesh className="mt-8 fade-up fade-up-3" />

      <UploadZone className="mt-8 fade-up fade-up-4" />

      <ConfidencePanel className="mt-8 fade-up fade-up-5" />

      <Timeline
        groups={groups}
        total={events.length}
        onUpdate={updateEvent}
        onDelete={deleteEvent}
        className="mt-10"
      />

      <SyllabusList className="mt-10" />

      <PageFooter>
        업로드한 강의계획서는 본인만 볼 수 있어요. 자동 추출 일정은 클릭해서 바로 수정할 수 있어요.
      </PageFooter>
    </PageShell>
  );
}

function ReminderMesh({ className }: { className?: string }) {
  const reminders = [
    { label: "7일 전", title: "범위만 확정", meta: "시험·발표", icon: CalendarCheck2 },
    { label: "3일 전", title: "초안 만들기", meta: "과제·발표", icon: BellRing },
    { label: "전날", title: "감점 검사", meta: "제출 형식", icon: ShieldCheck },
    { label: "당일 18:00", title: "최종 끌어올림", meta: "자정 마감", icon: BellRing },
  ];

  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
          마감 알림 설계
        </h2>
        <span className="text-[11px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
          놓치기 전에 끌어올림
        </span>
      </div>
      <div className="mt-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {reminders.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10.5px] wght-700 kerning-tight tabular-nums text-[var(--color-fg-subtle)]">
                    {item.label}
                  </span>
                  <Icon size={14} strokeWidth={2} className="text-[var(--color-fg-subtle)]" />
                </div>
                <p className="mt-2 text-[13px] leading-[1.25] wght-700 kerning-tight text-[var(--color-fg-strong)]">
                  {item.title}
                </p>
                <p className="mt-1 truncate text-[11px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
                  {item.meta}
                </p>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3 border-t border-[var(--color-line)] pt-4">
          <p className="text-[12.5px] leading-[1.55] wght-450 kerning-tight text-[var(--color-fg-muted)]">
            일정 등록에서 끝나면 안 돼요. 마감마다 준비 행동과 제출 검사를 같이 예약해야 다시 열 이유가 생겨요.
          </p>
          <Link
            href="/dashboard/today"
            className="group inline-flex shrink-0 items-baseline gap-1.5 text-[13px] wght-560 kerning-tight text-[var(--color-accent)] hover:text-[var(--color-accent-strong)]"
          >
            Today에서 보기
            <Arrow className="text-[12px] transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function RadarSummary({
  todayCount,
  total,
  className,
}: {
  todayCount: number;
  total: number;
  className?: string;
}) {
  return (
    <section className={className}>
      <dl className="grid grid-cols-3 overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]">
        <SummaryCell label="오늘·내일" value={todayCount} urgent={todayCount > 0} />
        <SummaryCell label="전체 일정" value={total} />
        <SummaryCell label="확인 필요" value={2} warn />
      </dl>
    </section>
  );
}

function SummaryCell({
  label,
  value,
  urgent,
  warn,
}: {
  label: string;
  value: number;
  urgent?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="border-r border-[var(--color-line)] px-4 py-3 last:border-r-0">
      <dt className="text-[11px] wght-500 kerning-tight text-[var(--color-fg-subtle)]">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 text-[20px] wght-700 kerning-tight tabular-nums",
          urgent && "text-[var(--color-urgent)]",
          warn && !urgent && "text-[var(--color-warn)]",
          !urgent && !warn && "text-[var(--color-fg-strong)]",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function DeadlineRadar({
  events,
  className,
}: {
  events: CalEvent[];
  className?: string;
}) {
  const first = events[0];

  return (
    <section className={className}>
      <h2 className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
        지금 먼저 볼 일정
      </h2>
      {first && (
        <div className="mt-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-bg)] p-5 shadow-[var(--shadow-soft)] sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Dot color={COURSE[first.course]} size={7} />
              <span className="text-[13px] wght-560 kerning-tight text-[var(--color-fg-muted)]">
                {first.course}
              </span>
            </div>
            <RiskText event={first} />
          </div>
          <p className="mt-4 text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
            {first.kind} · {dueLabel(first.due)}
          </p>
          <h3 className="mt-2 text-[22px] leading-[1.28] wght-700 kerning-tight text-[var(--color-fg-strong)]">
            {first.title.replace(/^.*?— /, "")}
          </h3>
          <p className="mt-2 text-[13px] wght-450 kerning-tight text-[var(--color-fg-muted)]">
            오늘 안에 시작하면 아직 만회할 수 있어요. 일정만 보지 말고 바로 준비로 넘어가야 해요.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
            <ActionLink event={first} primary />
            <Link
              href="/dashboard/today"
              className="group inline-flex min-h-[44px] items-center gap-1.5 text-[13px] wght-500 kerning-tight text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
            >
              Today에 고정
              <Arrow className="text-[12px] transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      )}
      <ul className="mt-4 border-t border-[var(--color-line)]">
        {events.slice(1).map((event) => (
          <li key={event.id}>
            <RadarRow event={event} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RadarRow({ event }: { event: CalEvent }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-[var(--color-line)] py-3.5">
      <Dot color={COURSE[event.course]} size={6} className="translate-y-[-1px]" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
        <span className="text-[10.5px] wght-560 kerning-tight text-[var(--color-fg-subtle)] sm:w-[88px] sm:shrink-0">
          {event.course}
        </span>
        <span className="min-w-0 truncate text-[13.5px] wght-500 kerning-tight text-[var(--color-fg)]">
          {event.kind} · {event.title}
        </span>
      </div>
      <div className="flex shrink-0 items-baseline gap-2.5">
        <RiskText event={event} compact />
        <ActionLink event={event} />
      </div>
    </div>
  );
}

function RiskText({ event, compact }: { event: CalEvent; compact?: boolean }) {
  const days = daysAway(event.due);
  const urgent = days <= 1;
  const label = dueLabel(event.due);
  return (
    <span
      className={cn(
        "text-[11.5px] wght-560 kerning-tight tabular-nums",
        urgent ? "text-[var(--color-urgent)]" : "text-[var(--color-fg-subtle)]",
      )}
    >
      {compact ? label.replace("다음 주 ", "") : label}
    </span>
  );
}

function ActionLink({ event, primary }: { event: CalEvent; primary?: boolean }) {
  const query = `${event.course} ${event.title} 준비를 3단계로 쪼개줘`;
  const href =
    event.kind === "발표"
      ? "/dashboard/tools/presentation"
      : `/dashboard/chat?q=${encodeURIComponent(query)}`;

  return (
    <Link
      href={href}
      className={
        primary
          ? "inline-flex min-h-[44px] items-center rounded-lg bg-[var(--color-fg-strong)] px-4 text-[13.5px] wght-560 kerning-tight text-white hover:bg-[var(--color-fg)]"
          : "group inline-flex items-baseline gap-1 text-[12px] wght-500 kerning-tight text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
      }
    >
      {event.kind === "시험" ? "복습 만들기" : event.kind === "발표" ? "발표 준비" : "준비 시작"}
      {!primary && <Arrow className="text-[11px] transition-transform group-hover:translate-x-0.5" />}
    </Link>
  );
}

function ConfidencePanel({ className }: { className?: string }) {
  return (
    <section className={className}>
      <h2 className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
        자동 등록 전 확인할 것
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <CheckNote title="시험일" value="4건 확실" />
        <CheckNote title="과제 마감" value="2건 확인 필요" warn />
        <CheckNote title="평가 비중" value="평균 92%" />
      </div>
    </section>
  );
}

function CheckNote({
  title,
  value,
  warn,
}: {
  title: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="border-y border-[var(--color-line)] py-3 sm:border-y-0 sm:border-l sm:py-1 sm:pl-4 first:sm:border-l-0 first:sm:pl-0">
      <p className="text-[11px] wght-500 kerning-tight text-[var(--color-fg-subtle)]">
        {title}
      </p>
      <p
        className={cn(
          "mt-1 text-[13px] wght-560 kerning-tight",
          warn ? "text-[var(--color-warn)]" : "text-[var(--color-fg)]",
        )}
      >
        {value}
      </p>
    </div>
  );
}

/* ─────────── Upload ─────────── */

function UploadZone({ className }: { className?: string }) {
  const [over, setOver] = useState(false);
  const [name, setName] = useState<string | null>(null);

  return (
    <label
      htmlFor="syllabus-upload"
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) setName(f.name);
      }}
      className={cn(
        "block cursor-pointer rounded-2xl border border-dashed p-5 transition-colors duration-[var(--duration-base)] sm:p-6",
        over
          ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
          : "border-[var(--color-line-strong)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-strong)]",
        className,
      )}
    >
      <input
        id="syllabus-upload"
        type="file"
        accept=".pdf,.hwpx"
        className="sr-only"
        onChange={(e) => setName(e.target.files?.[0]?.name ?? null)}
      />
      {name ? (
        <>
          <p className="inline-flex items-center gap-1.5 text-[15px] wght-700 kerning-tight text-[var(--color-fg-strong)] sm:text-[16px]">
            <CheckIcon />
            {name}
          </p>
          <p className="mt-1 text-[12.5px] wght-450 kerning-tight text-[var(--color-fg-muted)]">
            일정을 정리하고 있어요…
          </p>
        </>
      ) : (
        <>
          <p className="text-[15px] wght-700 kerning-tight text-[var(--color-fg-strong)] sm:text-[16px]">
            강의계획서 올리고 마감 레이더 만들기
          </p>
          <p className="mt-1 text-[12.5px] wght-450 kerning-tight text-[var(--color-fg-muted)]">
            시험일·과제 마감·발표일·평가 비중을 먼저 뽑고, 애매한 건 확인 목록에 남겨요
          </p>
          <Divider className="my-4" />
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
            <span>PDF · HWPX</span>
            <span className="text-[var(--color-line-strong)]">·</span>
            <span>HWP는 변환 안내</span>
            <span className="text-[var(--color-line-strong)]">·</span>
            <span>본인만 볼 수 있어요</span>
          </div>
        </>
      )}
    </label>
  );
}

/* ─────────── Syllabus list ─────────── */

function SyllabusList({ className }: { className?: string }) {
  return (
    <section className={className}>
      <h2 className="text-[10.5px] wght-700 kerning-mono uppercase text-[var(--color-fg-subtle)]">
        올린 강의계획서
        <span className="ml-2 wght-450 tabular-nums text-[var(--color-fg-disabled)]">
          {SYLLABI.length}건
        </span>
      </h2>

      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {SYLLABI.map((s) => (
          <li key={s.id}>
            <Link
              href={`/dashboard/study/${encodeURIComponent(s.course)}`}
              className="group flex w-full items-baseline gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-bg)] px-4 py-3 text-left transition-all duration-[var(--duration-base)] hover:-translate-y-px hover:border-[var(--color-line-strong)] hover:shadow-[var(--shadow-soft)]"
            >
              <Dot
                color={COURSE[s.course]}
                size={6}
                className="translate-y-[-1px]"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[13.5px] wght-560 kerning-tight text-[var(--color-fg-strong)] sm:text-[14px]">
                  {s.course}
                </span>
                <span className="truncate text-[11.5px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
                  {s.professor} · {s.pages}p · 일정 {s.eventCount}건
                </span>
              </div>
              <span className="shrink-0 self-baseline text-[10.5px] wght-450 kerning-mono tabular-nums text-[var(--color-fg-subtle)]">
                {s.uploaded}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ─────────── Timeline ─────────── */

function Timeline({
  groups,
  total,
  onUpdate,
  onDelete,
  className,
}: {
  groups: { label: string; events: CalEvent[] }[];
  total: number;
  onUpdate: (id: string, patch: Partial<CalEvent>) => void;
  onDelete: (id: string) => void;
  className?: string;
}) {
  return (
    <section className={className}>
      <h2 className="text-[10.5px] wght-700 kerning-mono uppercase text-[var(--color-fg-subtle)]">
        학기 일정
        <span className="ml-2 wght-450 tabular-nums text-[var(--color-fg-disabled)]">
          {total}건
        </span>
      </h2>

      {groups.length === 0 ? (
        <p className="mt-6 text-[13px] wght-450 kerning-tight text-[var(--color-fg-muted)]">
          아직 일정이 없어요. 강의계획서를 올려보세요.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-7">
          {groups.map((g) => (
            <div key={g.label}>
              <h3 className="text-[10.5px] wght-700 kerning-mono uppercase text-[var(--color-fg-subtle)]">
                {g.label}
                <span className="ml-2 wght-450 tabular-nums text-[var(--color-fg-disabled)]">
                  {g.events.length}건
                </span>
              </h3>
              <ul className="mt-2 border-t border-[var(--color-line)]">
                {g.events.map((e) => (
                  <li key={e.id}>
                    <EventRow
                      event={e}
                      onUpdate={(patch) => onUpdate(e.id, patch)}
                      onDelete={() => onDelete(e.id)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ─────────── EventRow + 인라인 편집 ─────────── */

function EventRow({
  event,
  onUpdate,
  onDelete,
}: {
  event: CalEvent;
  onUpdate: (patch: Partial<CalEvent>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <EventEditor
        event={event}
        onSave={(patch) => {
          onUpdate(patch);
          setEditing(false);
        }}
        onDelete={() => {
          onDelete();
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const days = daysAway(event.due);
  const isUrgent = days <= 3;
  const isExam = event.kind === "시험";

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="row-shift group flex w-full items-baseline gap-3 border-b border-[var(--color-line)] py-3 text-left sm:py-3.5"
    >
      <Dot color={COURSE[event.course]} size={6} className="translate-y-[-1px]" />
      <div className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:gap-3">
        <span className="text-[10.5px] wght-560 kerning-mono uppercase text-[var(--color-fg-subtle)] sm:w-[88px] sm:shrink-0">
          {event.course}
        </span>
        <span className="flex min-w-0 items-baseline gap-2">
          <span
            className={cn(
              "shrink-0 text-[10px] wght-700 kerning-mono uppercase",
              isExam ? "text-[var(--color-urgent)]" : "text-[var(--color-fg-subtle)]",
            )}
          >
            {event.kind}
          </span>
          <span
            className={cn(
              "truncate kerning-tight text-[13.5px] sm:text-[14px]",
              isUrgent
                ? "wght-560 text-[var(--color-fg-strong)]"
                : "wght-450 text-[var(--color-fg)]",
            )}
          >
            {event.title}
          </span>
        </span>
      </div>
      <div className="flex shrink-0 items-baseline gap-2.5 self-baseline">
        {event.weight && event.weight !== "—" && (
          <span className="hidden text-[10.5px] wght-450 kerning-mono tabular-nums text-[var(--color-fg-subtle)] sm:inline">
            {event.weight}
          </span>
        )}
        <span
          className={cn(
            "text-[11.5px] kerning-tight tabular-nums",
            isUrgent
              ? "wght-560 text-[var(--color-accent)]"
              : "wght-450 text-[var(--color-fg-subtle)]",
          )}
        >
          {dueLabel(event.due)}
        </span>
        <span
          aria-hidden
          className="text-[10.5px] wght-560 kerning-mono uppercase text-[var(--color-fg-subtle)]"
        >
          편집
        </span>
      </div>
    </button>
  );
}

function EventEditor({
  event,
  onSave,
  onDelete,
  onCancel,
}: {
  event: CalEvent;
  onSave: (patch: Partial<CalEvent>) => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(event.title);
  const [course, setCourse] = useState<CourseName>(event.course);
  const [kind, setKind] = useState<EventKind>(event.kind);
  const [date, setDate] = useState(dateInputValue(event.due));
  const [time, setTime] = useState(timeInputValue(event.due));
  const [weight, setWeight] = useState(event.weight ?? "");

  // 모바일에서 즉시 autoFocus는 OS 키보드가 폼을 가리는 문제. 데스크톱(coarse pointer X)에서만 자동 포커스
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isCoarse = window.matchMedia("(pointer: coarse)").matches;
    if (!isCoarse) titleRef.current?.focus();
  }, []);

  function commit() {
    if (!title.trim()) return;
    const [yyyy, mm, dd] = date.split("-").map((s) => parseInt(s, 10));
    const [hh, mi] = time.split(":").map((s) => parseInt(s, 10));
    const newDue = new Date(yyyy, mm - 1, dd, hh, mi);
    onSave({
      title: title.trim(),
      course,
      kind,
      due: newDue,
      weight: weight.trim() || undefined,
    });
  }

  return (
    <div
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
      className="border-b border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-4 sm:px-5 sm:py-5"
    >
      {/* 제목 */}
      <input
        ref={titleRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="일정 제목"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        className="w-full bg-transparent text-[15px] wght-560 kerning-tight text-[var(--color-fg-strong)] placeholder:wght-380 placeholder:text-[var(--color-fg-disabled)] focus-visible:outline-none sm:text-[16px]"
      />

      {/* 필드 */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="강의">
          <select
            value={course}
            onChange={(e) => setCourse(e.target.value as CourseName)}
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-bg)] px-2.5 py-1.5 text-[13px] wght-500 kerning-tight text-[var(--color-fg)] focus:border-[var(--color-fg-disabled)] focus-visible:outline-none"
          >
            {COURSE_NAMES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        <Field label="종류">
          <div className="-mx-1 flex flex-wrap gap-x-1 gap-y-1.5">
            {EVENT_KINDS.map((k) => {
              const active = kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11.5px] kerning-tight transition-colors",
                    active
                      ? "wght-560 bg-[var(--color-fg-strong)] text-white"
                      : "wght-450 text-[var(--color-fg-muted)] hover:bg-[var(--color-bg)]",
                  )}
                >
                  {k}
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="날짜">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-bg)] px-2.5 py-1.5 text-[13px] wght-500 kerning-tight tabular-nums text-[var(--color-fg)] focus:border-[var(--color-fg-disabled)] focus-visible:outline-none"
          />
        </Field>

        <Field label="시각">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-bg)] px-2.5 py-1.5 text-[13px] wght-500 kerning-tight tabular-nums text-[var(--color-fg)] focus:border-[var(--color-fg-disabled)] focus-visible:outline-none"
          />
        </Field>

        <Field label="평가 비중" hint="없으면 비워두세요">
          <input
            type="text"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="예: 30%"
            className="w-full rounded-md border border-[var(--color-line)] bg-[var(--color-bg)] px-2.5 py-1.5 text-[13px] wght-500 kerning-tight tabular-nums text-[var(--color-fg)] placeholder:wght-380 placeholder:text-[var(--color-fg-disabled)] focus:border-[var(--color-fg-disabled)] focus-visible:outline-none"
          />
        </Field>
      </div>

      {/* 액션 */}
      <div className="mt-5 flex items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={commit}
          disabled={!title.trim()}
          className={cn(
            "inline-flex items-baseline gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] wght-560 kerning-tight transition-colors",
            title.trim()
              ? "bg-[var(--color-fg-strong)] text-white hover:bg-[var(--color-fg)]"
              : "cursor-not-allowed bg-[var(--color-line)] text-[var(--color-fg-disabled)]",
          )}
        >
          저장
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-[12.5px] wght-450 kerning-tight text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
        >
          취소
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="ml-auto text-[12px] wght-450 kerning-tight text-[var(--color-fg-subtle)] hover:text-[var(--color-urgent)]"
        >
          삭제
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline gap-2">
        <span className="text-[10.5px] wght-700 kerning-mono uppercase text-[var(--color-fg-subtle)]">
          {label}
        </span>
        {hint && (
          <span className="text-[10.5px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
            {hint}
          </span>
        )}
      </div>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function CheckIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
      className="shrink-0 text-[var(--color-success)]"
    >
      <path
        d="M2.5 6.4l2.4 2.4L9.5 3.6"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
