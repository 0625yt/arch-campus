"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Dot, Divider } from "@/components/primitives";
import {
  PageShell,
  PageHint,
  PageTitle,
  PageFooter,
} from "@/components/page-shell";

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

  function updateEvent(id: string, patch: Partial<CalEvent>) {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function deleteEvent(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <PageShell width="md">
      <PageHint>강의계획서를 올리면 학기 일정이 정리돼요. 클릭해서 직접 수정할 수도 있어요</PageHint>

      <PageTitle className="mt-6">일정</PageTitle>

      <UploadZone className="mt-10 fade-up fade-up-1" />

      <SyllabusList className="mt-12 fade-up fade-up-2" />

      <Timeline
        groups={groups}
        total={events.length}
        onUpdate={updateEvent}
        onDelete={deleteEvent}
        className="mt-14 fade-up fade-up-3 sm:mt-16"
      />

      <PageFooter>
        업로드한 강의계획서는 본인만 볼 수 있어요. 일정은 직접 수정·삭제할 수
        있어요.
      </PageFooter>
    </PageShell>
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
            강의계획서 PDF 끌어다 놓으세요
          </p>
          <p className="mt-1 text-[12.5px] wght-450 kerning-tight text-[var(--color-fg-muted)]">
            시험·과제·발표·평가 비중까지 한 번에 정리돼요
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
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
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
