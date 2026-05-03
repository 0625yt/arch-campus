import Link from "next/link";
import {
  BookOpenCheck,
  ClipboardCheck,
  TimerReset,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Arrow, Dot, ProgressLine } from "@/components/primitives";
import { Countdown } from "@/components/countdown";
import { PageShell } from "@/components/page-shell";
import { COURSE_COLOR, type CourseSlug } from "@/app/dashboard/study/data";

export const dynamic = "force-dynamic";

function dateLabel(d: Date) {
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${days[d.getDay()]}요일`;
}

function timeLabel(d: Date) {
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h < 12 ? "오전" : "오후";
  const hh = h % 12 || 12;
  return `${ampm} ${hh}:${m.toString().padStart(2, "0")}`;
}

function dayOffset(base: Date, days: number, hour = 23, minute = 59) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function nextWeekday(base: Date, weekday: number, hour = 23, minute = 59) {
  const offset = (weekday - base.getDay() + 7) % 7 || 7;
  return dayOffset(base, offset, hour, minute);
}

function daysAwayFrom(base: Date, target: Date) {
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const targetStart = new Date(target);
  targetStart.setHours(0, 0, 0, 0);
  return Math.floor((targetStart.getTime() - start.getTime()) / 86400000);
}

type TaskKind = "과제" | "시험" | "발표" | "퀴즈" | "복습";

interface Task {
  course: CourseSlug;
  kind: TaskKind;
  title: string;
  due: Date;
  dueLabel: string;
  daysAway: number;
  href: string;
  weight?: string;
}

interface Move {
  title: string;
  label: string;
  meta: string;
  href: string;
  icon: LucideIcon;
  urgent?: boolean;
}

function createTodayData(now: Date) {
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 0, 0);

  const focus: Task = {
    course: "자료구조",
    kind: "과제",
    title: "과제 3 — 이진 탐색 트리 구현",
    due: todayEnd,
    dueLabel: "오늘 자정",
    daysAway: 0,
    href: "/dashboard/study/%EC%9E%90%EB%A3%8C%EA%B5%AC%EC%A1%B0/bst",
    weight: "10%",
  };

  const operatingExam = nextWeekday(now, 2, 8, 30);
  const dbPresentation = dayOffset(now, 5, 14, 0);
  const algoQuiz = nextWeekday(now, 3, 11, 0);

  const week: Task[] = [
    {
      course: "운영체제",
      kind: "시험",
      title: "중간고사",
      due: operatingExam,
      dueLabel: "다음 화 · 8:30",
      daysAway: daysAwayFrom(now, operatingExam),
      href: "/dashboard/study/%EC%9A%B4%EC%98%81%EC%B2%B4%EC%A0%9C",
      weight: "30%",
    },
    {
      course: "데이터베이스",
      kind: "발표",
      title: "정규화 사례 분석",
      due: dbPresentation,
      dueLabel: "5일 뒤",
      daysAway: daysAwayFrom(now, dbPresentation),
      href: "/dashboard/tools/presentation",
      weight: "15%",
    },
    {
      course: "알고리즘",
      kind: "퀴즈",
      title: "퀴즈 2 — 동적 계획법",
      due: algoQuiz,
      dueLabel: "수요일",
      daysAway: daysAwayFrom(now, algoQuiz),
      href: "/dashboard/study/%EC%95%8C%EA%B3%A0%EB%A6%AC%EC%A6%98/dp",
      weight: "5%",
    },
  ];

  const moves: Move[] = [
    {
      label: "제출 전",
      title: "90초 감점 검사",
      meta: "파일명·예외 케이스·시간복잡도",
      href: `/dashboard/chat?q=${encodeURIComponent("자료구조 BST 과제 제출 전 감점 포인트를 체크해줘")}`,
      icon: ClipboardCheck,
      urgent: true,
    },
    {
      label: "시험",
      title: "운영체제 약점 7문제",
      meta: "D-4 · 중간고사 30%",
      href: "/dashboard/study/%EC%9A%B4%EC%98%81%EC%B2%B4%EC%A0%9C/process-sync",
      icon: BookOpenCheck,
    },
  ];

  return { focus, week, moves };
}

export default function TodayPage() {
  const now = new Date();
  const { focus, week, moves } = createTodayData(now);

  return (
    <PageShell width="md" className="pb-24 md:pb-20">
      <TopBar now={now} />

      <header className="mt-7 fade-up fade-up-1 sm:mt-9">
        <p className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
          오늘
        </p>
        <h1 className="mt-3 max-w-[560px] text-[28px] leading-[1.2] wght-700 kerning-tight text-[var(--color-fg-strong)] sm:text-[34px]">
          오늘은 이 과제 하나만 끝내면 돼요
        </h1>
      </header>

      <FocusCard className="mt-6 fade-up fade-up-2" task={focus} />

      <NextMoves className="mt-8 fade-up fade-up-3" moves={moves} />

      <WeekList className="mt-10 fade-up fade-up-4" tasks={week} />
    </PageShell>
  );
}

function TopBar({ now }: { now: Date }) {
  return (
    <header className="fade-up flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[12px] wght-450 kerning-tight">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="wght-560 text-[var(--color-fg-strong)]">
          {dateLabel(now)}
        </span>
        <span className="text-[var(--color-line-strong)]">·</span>
        <span className="tabular-nums text-[var(--color-fg-muted)]">
          {timeLabel(now)}
        </span>
      </div>
      <Link
        href="/dashboard"
        className="group inline-flex items-baseline gap-1 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
      >
        학기 대시보드
        <Arrow className="text-[11px] transition-transform group-hover:translate-x-0.5" />
      </Link>
    </header>
  );
}

function FocusCard({ task, className }: { task: Task; className?: string }) {
  const taskNoun = task.title.replace(/^.*?— /, "");

  return (
    <section
      className={cn(
        "rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-bg)] p-5 shadow-[var(--shadow-soft)] sm:p-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-urgent-soft)] px-2.5 py-1 text-[11px] wght-700 kerning-tight text-[var(--color-urgent)]">
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-[var(--color-urgent)] pulse-dot"
          />
          {task.dueLabel} · {task.weight}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11.5px] wght-560 kerning-tight text-[var(--color-fg-muted)]">
          <Dot color={COURSE_COLOR[task.course]} size={6} />
          {task.course}
        </span>
      </div>

      <h2 className="mt-5 text-[24px] leading-[1.22] wght-700 kerning-tight text-[var(--color-fg-strong)] sm:text-[29px]">
        {taskNoun}
      </h2>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px] wght-450 kerning-tight text-[var(--color-fg-muted)]">
        <Countdown
          target={task.due}
          className="wght-700 tabular-nums text-[var(--color-urgent)]"
        />
        <span className="text-[var(--color-line-strong)]">·</span>
        <span>필요 시간 약 60분</span>
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-[1fr_190px] md:items-end">
        <div>
          <div className="flex items-baseline justify-between gap-3 text-[11.5px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
            <span>오늘 진행</span>
            <span className="tabular-nums text-[var(--color-fg)]">0/3</span>
          </div>
          <ProgressLine value={0} className="mt-3" />
          <ol className="mt-4 flex flex-col gap-2.5">
            <Step label="BST 삭제 케이스 확인" meta="40분" active />
            <Step label="샘플 입력 5개 돌리기" meta="15분" />
            <Step label="제출 형식 검사" meta="5분" />
          </ol>
        </div>

        <div className="flex flex-col gap-2">
          <Link
            href={task.href}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[var(--color-fg-strong)] px-4 text-[13.5px] wght-560 kerning-tight text-white transition-colors hover:bg-[var(--color-fg)]"
          >
            <TimerReset size={16} strokeWidth={2.1} />
            10분만 시작
          </Link>
          <Link
            href={`/dashboard/chat?q=${encodeURIComponent(task.title + " 제출 전 감점 체크리스트 만들어줘")}`}
            className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-bg)] px-4 text-[13px] wght-560 kerning-tight text-[var(--color-fg)] transition-colors hover:bg-[var(--color-surface)]"
          >
            <ClipboardCheck size={15} strokeWidth={2.1} />
            제출 전 검사
          </Link>
        </div>
      </div>
    </section>
  );
}

function Step({
  label,
  meta,
  active,
}: {
  label: string;
  meta: string;
  active?: boolean;
}) {
  return (
    <li className="flex items-center gap-2 text-[12.5px] wght-450 kerning-tight text-[var(--color-fg-muted)]">
      <span
        aria-hidden
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border",
          active
            ? "border-[var(--color-urgent)] bg-[var(--color-urgent-soft)]"
            : "border-[var(--color-line-strong)] bg-[var(--color-bg)]",
        )}
      >
        {active && <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-urgent)]" />}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="tabular-nums text-[11px] text-[var(--color-fg-subtle)]">
        {meta}
      </span>
    </li>
  );
}

function NextMoves({ moves, className }: { moves: Move[]; className?: string }) {
  return (
    <section className={className}>
      <h2 className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
        그다음 2개
      </h2>
      <ul className="mt-3 border-t border-[var(--color-line)]">
        {moves.map((move) => (
          <li key={move.title}>
            <MoveRow move={move} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function MoveRow({ move }: { move: Move }) {
  const Icon = move.icon;

  return (
    <Link
      href={move.href}
      className="row-shift group flex items-center gap-3 border-b border-[var(--color-line)] py-3.5"
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          move.urgent
            ? "bg-[var(--color-urgent-soft)] text-[var(--color-urgent)]"
            : "bg-[var(--color-accent-soft)] text-[var(--color-accent)]",
        )}
      >
        <Icon size={16} strokeWidth={2.1} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-[10.5px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
          {move.label}
        </span>
        <span className="mt-0.5 block truncate text-[13.5px] wght-700 kerning-tight text-[var(--color-fg-strong)]">
          {move.title}
        </span>
      </span>
      <span className="hidden max-w-[190px] truncate text-[11.5px] wght-450 kerning-tight text-[var(--color-fg-subtle)] sm:block">
        {move.meta}
      </span>
      <Arrow className="reveal-right text-[12px] text-[var(--color-fg-subtle)]" />
    </Link>
  );
}

function WeekList({ tasks, className }: { tasks: Task[]; className?: string }) {
  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
          이번 주
        </h2>
        <Link
          href="/dashboard/calendar"
          className="group inline-flex items-baseline gap-1 text-[11.5px] wght-500 kerning-tight text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]"
        >
          마감 레이더
          <Arrow className="text-[11px]" />
        </Link>
      </div>

      <ul className="mt-3 border-t border-[var(--color-line)]">
        {tasks.map((item) => (
          <li key={`${item.course}-${item.title}`}>
            <TaskRow item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function TaskRow({ item }: { item: Task }) {
  const isUrgent = item.daysAway <= 3;

  return (
    <Link
      href={item.href}
      className="row-shift group flex items-baseline gap-3 border-b border-[var(--color-line)] py-3 text-[var(--color-fg)] hover:text-[var(--color-fg-strong)] sm:py-3.5"
    >
      <Dot color={COURSE_COLOR[item.course]} size={6} className="translate-y-[-1px]" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
        <span className="text-[10.5px] wght-560 kerning-tight text-[var(--color-fg-subtle)] sm:w-[88px] sm:shrink-0">
          {item.course}
        </span>
        <span className="flex min-w-0 items-baseline gap-2">
          <span
            className={cn(
              "shrink-0 text-[10px] wght-700 kerning-tight",
              item.kind === "시험"
                ? "text-[var(--color-urgent)]"
                : "text-[var(--color-fg-subtle)]",
            )}
          >
            {item.kind}
          </span>
          <span
            className={cn(
              "truncate text-[13.5px] kerning-tight sm:text-[14px]",
              isUrgent
                ? "wght-560 text-[var(--color-fg-strong)]"
                : "wght-450 text-[var(--color-fg)]",
            )}
          >
            {item.title}
          </span>
        </span>
      </div>
      <div className="flex shrink-0 items-baseline gap-2.5 self-baseline">
        {item.weight && (
          <span className="hidden text-[10.5px] wght-450 kerning-mono tabular-nums text-[var(--color-fg-subtle)] sm:inline">
            {item.weight}
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
          {item.dueLabel}
        </span>
        <Arrow className="reveal-right text-[12px] text-[var(--color-fg-subtle)]" />
      </div>
    </Link>
  );
}
