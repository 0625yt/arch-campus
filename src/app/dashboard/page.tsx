import Link from "next/link";
import {
  BookOpenCheck,
  CalendarCheck2,
  ClipboardCheck,
  Coffee,
  FileUp,
  UsersRound,
} from "lucide-react";
import { Arrow, Dot, ProgressLine } from "@/components/primitives";
import { PageShell } from "@/components/page-shell";
import { COURSE_COLOR } from "@/app/dashboard/study/data";

const STATUS = [
  { label: "오늘 남은 수업", value: "2", unit: "개", urgent: false },
  { label: "자정 마감", value: "1", unit: "개", urgent: true },
  { label: "시험까지", value: "4", unit: "일", urgent: false },
  { label: "팀플 대기", value: "2", unit: "건", urgent: false },
] as const;

const SCHEDULE = [
  {
    time: "10:30",
    title: "자료구조 과제 시작",
    meta: "이진 탐색 트리 · 제출 조건 확인",
    href: "/dashboard/today",
    color: COURSE_COLOR["자료구조"],
    current: true,
  },
  {
    time: "13:00",
    title: "운영체제 수업",
    meta: "프로세스 동기화 · 8분 브리핑",
    href: "/dashboard/study/%EC%9A%B4%EC%98%81%EC%B2%B4%EC%A0%9C/process-sync",
    color: COURSE_COLOR["운영체제"],
    current: false,
  },
  {
    time: "19:00",
    title: "데이터베이스 팀플 역할 확정",
    meta: "발표 흐름 1명 비어 있음",
    href: "/dashboard/tools/presentation",
    color: COURSE_COLOR["데이터베이스"],
    current: false,
  },
] as const;

const COURSE_HEALTH = [
  {
    course: "자료구조",
    status: "오늘 마감",
    detail: "과제 10% · 제출 조건 변경",
    value: 0.25,
    href: "/dashboard/today",
    urgent: true,
  },
  {
    course: "운영체제",
    status: "시험 D-4",
    detail: "동기화·데드락 범위",
    value: 0.62,
    href: "/dashboard/study/%EC%9A%B4%EC%98%81%EC%B2%B4%EC%A0%9C",
    urgent: false,
  },
  {
    course: "데이터베이스",
    status: "팀플 D-5",
    detail: "발표 역할 공백",
    value: 0.4,
    href: "/dashboard/tools/presentation",
    urgent: false,
  },
] as const;

const LIFE_SIGNALS = [
  { icon: Coffee, title: "점심은 12:25 이후", meta: "11:50 수업 종료 · 학생식당 혼잡 피하기" },
  { icon: CalendarCheck2, title: "SW 장학금 D-3", meta: "성적 증명서와 활동 증빙 필요" },
  { icon: UsersRound, title: "팀플 답장 2개 대기", meta: "데이터베이스 · 알고리즘" },
] as const;

const INPUTS = [
  { label: "학기 뼈대", title: "강의계획서 PDF", meta: "시험·과제·평가 비중" },
  { label: "감점 방지", title: "과제 안내 캡처", meta: "제출 형식·주의사항" },
  { label: "생활 신호", title: "공지 링크·팀플 메모", meta: "장학금·회의·역할 공백" },
] as const;

export default function DashboardPage() {
  return (
    <PageShell width="wide" className="pb-24 md:pb-20">
      <header className="fade-up">
        <p className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
          내 캠퍼스
        </p>
        <h1 className="mt-3 max-w-[680px] text-[28px] leading-[1.18] wght-700 kerning-tight text-[var(--color-fg-strong)] sm:text-[36px]">
          오늘 내 수업, 과제, 시험, 팀플 흐름을 한눈에 봐요
        </h1>
        <p className="mt-3 max-w-[600px] text-[13.5px] leading-[1.65] wght-450 kerning-tight text-[var(--color-fg-muted)]">
          자동 연결 없이도 직접 넣은 강의계획서, 과제 안내, 공지 링크, 팀플 메모를 바탕으로
          지금 상태를 생활 단위로 정리합니다.
        </p>
      </header>

      <StatusStrip className="mt-7 fade-up fade-up-1" />

      <section className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <TodayTimeline className="fade-up fade-up-2" />
        <NowCard className="fade-up fade-up-2" />
      </section>

      <section className="mt-10 grid gap-8 lg:grid-cols-[1fr_0.95fr]">
        <CourseBoard className="fade-up fade-up-3" />
        <LifeBoard className="fade-up fade-up-3" />
      </section>

      <InputBoard className="mt-10 fade-up fade-up-4" />
    </PageShell>
  );
}

function StatusStrip({ className }: { className?: string }) {
  return (
    <section className={className}>
      <dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] sm:grid-cols-4">
        {STATUS.map((item) => (
          <div
            key={item.label}
            className="border-b border-r border-[var(--color-line)] px-4 py-3 even:border-r-0 last:border-b-0 sm:border-b-0 sm:even:border-r sm:last:border-r-0"
          >
            <dt className="text-[11px] wght-500 kerning-tight text-[var(--color-fg-subtle)]">
              {item.label}
            </dt>
            <dd
              className={
                item.urgent
                  ? "mt-1 text-[24px] leading-none wght-700 kerning-tight tabular-nums text-[var(--color-urgent)]"
                  : "mt-1 text-[24px] leading-none wght-700 kerning-tight tabular-nums text-[var(--color-fg-strong)]"
              }
            >
              {item.value}
              <span className="ml-0.5 text-[12px] wght-450 text-[var(--color-fg-muted)]">
                {item.unit}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function TodayTimeline({ className }: { className?: string }) {
  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
          오늘 흐름
        </h2>
        <span className="text-[11px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
          월요일
        </span>
      </div>
      <ol className="mt-3 border-t border-[var(--color-line)]">
        {SCHEDULE.map((item) => (
          <li key={`${item.time}-${item.title}`}>
            <Link
              href={item.href}
              className="row-shift group grid grid-cols-[54px_1fr_auto] items-baseline gap-3 border-b border-[var(--color-line)] py-4"
            >
              <span
                className={
                  item.current
                    ? "text-[12px] wght-700 kerning-mono tabular-nums text-[var(--color-urgent)]"
                    : "text-[12px] wght-560 kerning-mono tabular-nums text-[var(--color-fg-subtle)]"
                }
              >
                {item.time}
              </span>
              <span className="min-w-0">
                <span className="flex items-baseline gap-2">
                  <Dot color={item.color} size={6} />
                  <span className="truncate text-[14px] wght-700 kerning-tight text-[var(--color-fg-strong)]">
                    {item.title}
                  </span>
                </span>
                <span className="mt-1 block truncate text-[11.5px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
                  {item.meta}
                </span>
              </span>
              <Arrow className="reveal-right text-[12px] text-[var(--color-fg-subtle)]" />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

function NowCard({ className }: { className?: string }) {
  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
          지금 할 일
        </h2>
        <Link
          href="/dashboard/today"
          className="group inline-flex items-baseline gap-1 text-[11.5px] wght-500 kerning-tight text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]"
        >
          시작
          <Arrow className="text-[11px]" />
        </Link>
      </div>
      <div className="mt-3 rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-bg)] p-5 shadow-[var(--shadow-soft)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-urgent-soft)] px-2.5 py-1 text-[11px] wght-700 kerning-tight text-[var(--color-urgent)]">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--color-urgent)] pulse-dot" />
            오늘 자정 · 10%
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11.5px] wght-560 kerning-tight text-[var(--color-fg-muted)]">
            <Dot color={COURSE_COLOR["자료구조"]} size={6} />
            자료구조
          </span>
        </div>
        <h3 className="mt-4 text-[22px] leading-[1.25] wght-700 kerning-tight text-[var(--color-fg-strong)]">
          이진 탐색 트리 구현
        </h3>
        <p className="mt-2 text-[12.5px] leading-[1.55] wght-450 kerning-tight text-[var(--color-fg-muted)]">
          제출 조건 확인 → 핵심 케이스 구현 → 감점 항목 점검 순서로 바로 시작하면 돼요.
        </p>
        <Link
          href="/dashboard/today"
          className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-fg-strong)] px-4 text-[13.5px] wght-700 kerning-tight text-white hover:bg-[var(--color-fg)]"
        >
          <ClipboardCheck size={16} strokeWidth={2.1} />
          바로 시작하기
        </Link>
      </div>
    </section>
  );
}

function CourseBoard({ className }: { className?: string }) {
  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
          과목 상태
        </h2>
        <Link
          href="/dashboard/study"
          className="group inline-flex items-baseline gap-1 text-[11.5px] wght-500 kerning-tight text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]"
        >
          공부
          <Arrow className="text-[11px]" />
        </Link>
      </div>
      <ul className="mt-3 overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)]">
        {COURSE_HEALTH.map((item) => (
          <li key={item.course} className="border-b border-[var(--color-line)] last:border-b-0">
            <Link href={item.href} className="group block px-4 py-4 hover:bg-[var(--color-surface)]">
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-baseline gap-2">
                  <Dot color={COURSE_COLOR[item.course]} size={6} />
                  <span className="truncate text-[13.5px] wght-700 kerning-tight text-[var(--color-fg-strong)]">
                    {item.course}
                  </span>
                </span>
                <span
                  className={
                    item.urgent
                      ? "shrink-0 text-[11px] wght-700 kerning-tight text-[var(--color-urgent)]"
                      : "shrink-0 text-[11px] wght-560 kerning-tight text-[var(--color-fg-subtle)]"
                  }
                >
                  {item.status}
                </span>
              </div>
              <p className="mt-1 truncate text-[11.5px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
                {item.detail}
              </p>
              <ProgressLine value={item.value} className="mt-3" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LifeBoard({ className }: { className?: string }) {
  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
          생활 신호
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
        {LIFE_SIGNALS.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.title} className="border-b border-[var(--color-line)] py-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface)] text-[var(--color-fg-muted)]">
                  <Icon size={16} strokeWidth={2.1} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] wght-700 kerning-tight text-[var(--color-fg-strong)]">
                    {item.title}
                  </span>
                  <span className="mt-1 block text-[11.5px] leading-[1.45] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
                    {item.meta}
                  </span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function InputBoard({ className }: { className?: string }) {
  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
          지금 넣을 수 있는 자료
        </h2>
        <FileUp size={15} strokeWidth={2} className="text-[var(--color-fg-subtle)]" />
      </div>
      <div className="mt-3 grid grid-cols-1 overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] sm:grid-cols-3">
        {INPUTS.map((item) => (
          <div
            key={item.label}
            className="border-b border-[var(--color-line)] px-4 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
          >
            <p className="text-[10.5px] wght-700 kerning-tight text-[var(--color-fg-subtle)]">
              {item.label}
            </p>
            <p className="mt-1 text-[13.5px] leading-[1.35] wght-700 kerning-tight text-[var(--color-fg-strong)]">
              {item.title}
            </p>
            <p className="mt-1 text-[11.5px] leading-[1.45] wght-450 kerning-tight text-[var(--color-fg-muted)]">
              {item.meta}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
