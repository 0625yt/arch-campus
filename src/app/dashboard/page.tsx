import Link from "next/link";
import {
  BookOpenCheck,
  CalendarCheck2,
  ClipboardCheck,
  Gauge,
} from "lucide-react";
import { Arrow, Dot, ProgressLine } from "@/components/primitives";
import { PageShell } from "@/components/page-shell";
import { COURSE_COLOR } from "@/app/dashboard/study/data";

export default function DashboardPage() {
  return (
    <PageShell width="wide" className="pb-24 md:pb-20">
      <header className="fade-up">
        <p className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
          학기 대시보드
        </p>
        <h1 className="mt-3 max-w-[640px] text-[28px] leading-[1.2] wght-700 kerning-tight text-[var(--color-fg-strong)] sm:text-[36px]">
          전체 현황은 여기서 보고, 오늘 할 일은 가볍게 끝내요
        </h1>
      </header>

      <section className="mt-7 grid grid-cols-1 gap-3 fade-up fade-up-1 sm:grid-cols-3">
        <Metric label="오늘 막을 점수" value="10%" urgent />
        <Metric label="이번 주 마감" value="4건" />
        <Metric label="시험 준비" value="62%" />
      </section>

      <section className="mt-8 grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <PriorityPanel />
        <SemesterPanel />
      </section>
    </PageShell>
  );
}

function Metric({
  label,
  value,
  urgent,
}: {
  label: string;
  value: string;
  urgent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] px-4 py-4">
      <p className="text-[11px] wght-500 kerning-tight text-[var(--color-fg-subtle)]">
        {label}
      </p>
      <p
        className={
          urgent
            ? "mt-1 text-[24px] leading-none wght-700 kerning-tight tabular-nums text-[var(--color-urgent)]"
            : "mt-1 text-[24px] leading-none wght-700 kerning-tight tabular-nums text-[var(--color-fg-strong)]"
        }
      >
        {value}
      </p>
    </div>
  );
}

function PriorityPanel() {
  return (
    <section className="fade-up fade-up-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
          지금 먼저 볼 것
        </h2>
        <Link
          href="/dashboard/today"
          className="group inline-flex items-baseline gap-1 text-[11.5px] wght-500 kerning-tight text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]"
        >
          오늘 보기
          <Arrow className="text-[11px] transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
      <div className="mt-3 rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-bg)] p-5 shadow-[var(--shadow-soft)]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-urgent-soft)] text-[var(--color-urgent)]">
            <ClipboardCheck size={17} strokeWidth={2.1} />
          </span>
          <span className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-muted)]">
            자료구조 · 오늘 자정
          </span>
        </div>
        <h3 className="mt-4 text-[22px] leading-[1.28] wght-700 kerning-tight text-[var(--color-fg-strong)]">
          이진 탐색 트리 과제 10%
        </h3>
        <p className="mt-2 text-[13px] leading-[1.6] wght-450 kerning-tight text-[var(--color-fg-muted)]">
          오늘 화면에는 이 과제 하나만 남겨뒀어요. 여기서는 왜 먼저 해야 하는지만 확인하면 돼요.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/dashboard/today"
            className="inline-flex min-h-[42px] items-center rounded-lg bg-[var(--color-fg-strong)] px-4 text-[13px] wght-560 kerning-tight text-white hover:bg-[var(--color-fg)]"
          >
            오늘에서 처리
          </Link>
          <Link
            href="/dashboard/calendar"
            className="inline-flex min-h-[42px] items-center rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-bg)] px-4 text-[13px] wght-560 kerning-tight text-[var(--color-fg)] hover:bg-[var(--color-surface)]"
          >
            마감 레이더
          </Link>
        </div>
      </div>
    </section>
  );
}

function SemesterPanel() {
  const rows = [
    {
      icon: BookOpenCheck,
      title: "운영체제 시험 준비",
      meta: "D-4 · 중간고사 30%",
      href: "/dashboard/study/운영체제",
      value: 0.62,
      color: COURSE_COLOR["운영체제"],
    },
    {
      icon: CalendarCheck2,
      title: "강의계획서 추출",
      meta: "마감 8건 · 확인 필요 2건",
      href: "/dashboard/calendar",
      value: 0.78,
      color: "var(--color-accent)",
    },
    {
      icon: Gauge,
      title: "학기 진행",
      meta: "5/15주차",
      href: "/dashboard/study",
      value: 0.33,
      color: "var(--color-fg-strong)",
    },
  ];

  return (
    <section className="fade-up fade-up-2">
      <h2 className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
        전체 신호
      </h2>
      <ul className="mt-3 overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)]">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <li key={row.title} className="border-b border-[var(--color-line)] last:border-b-0">
              <Link
                href={row.href}
                className="group block px-4 py-4 transition-colors hover:bg-[var(--color-surface)]"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface)] text-[var(--color-fg-muted)]">
                    <Icon size={16} strokeWidth={2.1} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <Dot color={row.color} size={6} />
                      <span className="truncate text-[13.5px] wght-700 kerning-tight text-[var(--color-fg-strong)]">
                        {row.title}
                      </span>
                    </span>
                    <span className="mt-1 block truncate text-[11.5px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
                      {row.meta}
                    </span>
                    <ProgressLine value={row.value} className="mt-3" />
                  </span>
                  <Arrow className="mt-1 text-[12px] text-[var(--color-fg-subtle)] transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
