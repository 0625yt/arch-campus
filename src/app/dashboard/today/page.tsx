import Link from "next/link";
import { BellRing, ClipboardCheck, TimerReset } from "lucide-react";
import { cn } from "@/lib/utils";
import { Arrow, Dot } from "@/components/primitives";
import { Countdown } from "@/components/countdown";
import { PageShell } from "@/components/page-shell";
import { COURSE_COLOR, type CourseSlug } from "@/app/dashboard/study/data";

export const dynamic = "force-dynamic";

type TaskKind = "과제" | "시험" | "발표" | "퀴즈";

interface Task {
  course: CourseSlug;
  kind: TaskKind;
  title: string;
  due: Date;
  dueLabel: string;
  href: string;
  weight?: string;
  source: string;
}

const NEXT_ITEMS = [
  {
    label: "수업 전",
    title: "운영체제 8분 브리핑",
    meta: "과제 시작 후 보기",
    href: "/dashboard/study/%EC%9A%B4%EC%98%81%EC%B2%B4%EC%A0%9C/process-sync",
  },
  {
    label: "팀플",
    title: "데이터베이스 발표 역할 정리",
    meta: "오늘 19:00 전",
    href: "/dashboard/tools/presentation",
  },
] as const;

const WEEK_ITEMS = [
  {
    day: "화",
    title: "운영체제 중간고사",
    meta: "평가 30% · 동기화/데드락",
    href: "/dashboard/study/%EC%9A%B4%EC%98%81%EC%B2%B4%EC%A0%9C",
    urgent: true,
  },
  {
    day: "목",
    title: "데이터베이스 발표 리허설",
    meta: "정규화 사례 · 예상 질문 정리",
    href: "/dashboard/tools/presentation",
    urgent: false,
  },
  {
    day: "금",
    title: "알고리즘 퀴즈 2",
    meta: "동적 계획법 기본 점화식",
    href: "/dashboard/study/%EC%95%8C%EA%B3%A0%EB%A6%AC%EC%A6%98/dp",
    urgent: false,
  },
] as const;

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

function createNowData(now: Date) {
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 0, 0);

  const focus: Task = {
    course: "자료구조",
    kind: "과제",
    title: "과제 3 — 이진 탐색 트리 구현",
    due: todayEnd,
    dueLabel: "오늘 자정",
    href: "/dashboard/study/%EC%9E%90%EB%A3%8C%EA%B5%AC%EC%A1%B0/bst",
    weight: "10%",
    source: "과제 안내 캡처",
  };

  return { focus };
}

function startPrompt(task: Task) {
  return [
    `${task.course} ${task.title}을 지금 시작할게.`,
    "내가 바로 실행할 수 있게 1단계부터 같이 진행해줘.",
    "파일명 규칙, 제출 조건, 테스트 케이스, 시간복잡도 설명까지 빠뜨리지 말고 체크해줘.",
    "한 번에 길게 설명하지 말고 현재 단계에서 내가 해야 할 행동만 알려줘.",
  ].join(" ");
}

export default function TodayPage() {
  const now = new Date();
  const { focus } = createNowData(now);

  return (
    <PageShell width="narrow" className="pb-24 md:pb-20">
      <TopBar now={now} />

      <header className="mt-7 fade-up fade-up-1 sm:mt-9">
        <p className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
          지금
        </p>
        <h1 className="mt-3 max-w-[540px] text-[28px] leading-[1.18] wght-700 kerning-tight text-[var(--color-fg-strong)] sm:text-[34px]">
          지금은 이거 하나만 하면 돼요
        </h1>
        <p className="mt-3 max-w-[500px] text-[13.5px] leading-[1.6] wght-450 kerning-tight text-[var(--color-fg-muted)]">
          오늘 마감과 감점 위험을 기준으로 가장 먼저 시작할 일을 하나만 골랐어요.
        </p>
      </header>

      <FocusTask className="mt-7 fade-up fade-up-2" task={focus} />

      <ResumeWork className="mt-8 fade-up fade-up-3" />

      <LaterQueue className="mt-8 fade-up fade-up-4" />

      <WeekQueue className="mt-8 fade-up fade-up-5" />
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
        내 캠퍼스
        <Arrow className="text-[11px] transition-transform group-hover:translate-x-0.5" />
      </Link>
    </header>
  );
}

function FocusTask({ task, className }: { task: Task; className?: string }) {
  const taskNoun = task.title.replace(/^.*?— /, "");
  const prompt = startPrompt(task);

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
          {task.course} · {task.kind}
        </span>
      </div>

      <h2 className="mt-5 text-[25px] leading-[1.18] wght-700 kerning-tight text-[var(--color-fg-strong)] sm:text-[31px]">
        {taskNoun}
      </h2>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px] wght-450 kerning-tight text-[var(--color-fg-muted)]">
        <Countdown
          target={task.due}
          className="wght-700 tabular-nums text-[var(--color-urgent)]"
        />
        <span className="text-[var(--color-line-strong)]">·</span>
        <span>{task.source} 기준으로 제출 조건 확인 필요</span>
      </div>

      <div className="mt-7 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-urgent-soft)] text-[var(--color-urgent)]">
            <BellRing size={16} strokeWidth={2.1} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] wght-700 kerning-tight text-[var(--color-fg-strong)]">
              유의할 점
            </p>
            <p className="mt-1 text-[12.5px] leading-[1.55] wght-450 kerning-tight text-[var(--color-fg-muted)]">
              제출 파일명은 <span className="wght-700 text-[var(--color-fg)]">학번.txt</span> 형식으로 맞추고,
              실행 결과 캡처와 시간복잡도 설명을 같이 넣어야 해요.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-7 grid gap-2 sm:grid-cols-[1fr_auto]">
        <Link
          href={`/dashboard/chat?q=${encodeURIComponent(prompt)}`}
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg bg-[var(--color-fg-strong)] px-5 text-[14px] wght-700 kerning-tight text-white transition-colors hover:bg-[var(--color-fg)]"
        >
          <ClipboardCheck size={17} strokeWidth={2.2} />
          바로 시작하기
        </Link>
        <Link
          href={task.href}
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-bg)] px-4 text-[13px] wght-560 kerning-tight text-[var(--color-fg)] transition-colors hover:bg-[var(--color-surface)]"
        >
          <TimerReset size={15} strokeWidth={2.1} />
          자료 열기
        </Link>
      </div>
    </section>
  );
}

function ResumeWork({ className }: { className?: string }) {
  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
          하다 만 과제
        </h2>
        <span className="text-[11px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
          18분 전 저장
        </span>
      </div>
      <Link
        href="/dashboard/chat?q=%EC%9E%90%EB%A3%8C%EA%B5%AC%EC%A1%B0%20BST%20%EC%82%AD%EC%A0%9C%20%EC%BC%80%EC%9D%B4%EC%8A%A4%20%EC%9D%B4%EC%96%B4%EC%84%9C%20%EC%A7%84%ED%96%89%ED%95%B4%EC%A4%98"
        className="mt-3 flex items-baseline justify-between gap-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] px-4 py-3.5 transition-colors hover:bg-[var(--color-surface)]"
      >
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] wght-700 kerning-tight text-[var(--color-fg-strong)]">
            BST 삭제 케이스 구현 이어서 하기
          </span>
          <span className="mt-0.5 block truncate text-[11.5px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
            predecessor/successor 선택 부분에서 멈췄어요
          </span>
        </span>
        <Arrow className="shrink-0 text-[12px] text-[var(--color-fg-subtle)]" />
      </Link>
    </section>
  );
}

function LaterQueue({ className }: { className?: string }) {
  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
          이거 끝나면
        </h2>
        <Link
          href="/dashboard/calendar"
          className="group inline-flex items-baseline gap-1 text-[11.5px] wght-500 kerning-tight text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]"
        >
          레이더
          <Arrow className="text-[11px]" />
        </Link>
      </div>
      <ul className="mt-3 border-t border-[var(--color-line)]">
        {NEXT_ITEMS.map((item) => (
          <li key={item.title}>
            <Link
              href={item.href}
              className="row-shift group flex items-baseline gap-3 border-b border-[var(--color-line)] py-3.5"
            >
              <span className="w-[54px] shrink-0 text-[10.5px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
                {item.label}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] wght-620 kerning-tight text-[var(--color-fg-strong)]">
                  {item.title}
                </span>
                <span className="mt-0.5 block truncate text-[11.5px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
                  {item.meta}
                </span>
              </span>
              <Arrow className="reveal-right text-[12px] text-[var(--color-fg-subtle)]" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function WeekQueue({ className }: { className?: string }) {
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
          전체 보기
          <Arrow className="text-[11px]" />
        </Link>
      </div>
      <ul className="mt-3 border-t border-[var(--color-line)]">
        {WEEK_ITEMS.map((item) => (
          <li key={item.title}>
            <Link
              href={item.href}
              className="row-shift group flex items-baseline gap-3 border-b border-[var(--color-line)] py-3.5"
            >
              <span
                className={
                  item.urgent
                    ? "w-[34px] shrink-0 text-[10.5px] wght-700 kerning-tight text-[var(--color-urgent)]"
                    : "w-[34px] shrink-0 text-[10.5px] wght-560 kerning-tight text-[var(--color-fg-subtle)]"
                }
              >
                {item.day}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] wght-620 kerning-tight text-[var(--color-fg-strong)]">
                  {item.title}
                </span>
                <span className="mt-0.5 block truncate text-[11.5px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
                  {item.meta}
                </span>
              </span>
              <Arrow className="reveal-right text-[12px] text-[var(--color-fg-subtle)]" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
