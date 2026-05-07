import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { Arrow, Dot } from "@/components/primitives";
import { PageShell } from "@/components/page-shell";
import { COURSE_COLOR } from "@/app/dashboard/study/data";
import { UploadIntake } from "./upload-intake";

const FOCUS_ITEMS = [
  {
    label: "지금",
    title: "자료구조 과제 제출 조건 확인",
    meta: "오늘 자정 · 파일명 학번.txt · 실행 결과 캡처 필요",
    course: "자료구조",
    href: "/dashboard/today",
    urgent: true,
  },
  {
    label: "다음",
    title: "운영체제 시험 범위 정리",
    meta: "D-4 · 동기화와 데드락부터 보기",
    course: "운영체제",
    href: "/dashboard/study/%EC%9A%B4%EC%98%81%EC%B2%B4%EC%A0%9C",
    urgent: false,
  },
  {
    label: "대기",
    title: "데이터베이스 팀플 역할 빈자리",
    meta: "오늘 19:00 전 · 발표 흐름 1명 비어 있음",
    course: "데이터베이스",
    href: "/dashboard/tools/presentation",
    urgent: false,
  },
] as const;

export default function DashboardPage() {
  return (
    <PageShell width="wide" className="pb-24 md:pb-20">
      <header className="fade-up">
        <p className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
          내 캠퍼스
        </p>
        <h1 className="mt-3 max-w-[620px] text-[28px] leading-[1.18] wght-700 kerning-tight text-[var(--color-fg-strong)] sm:text-[36px]">
          자료를 넣고, 오늘 할 일만 보세요
        </h1>
        <p className="mt-3 max-w-[560px] text-[13.5px] leading-[1.65] wght-450 kerning-tight text-[var(--color-fg-muted)]">
          강의계획서, 과제 안내, 공지를 올리면 마감과 제출 조건만 골라서 정리합니다.
        </p>
      </header>

      <UploadIntake className="mt-7 fade-up fade-up-1" />

      <FocusList className="mt-8 fade-up fade-up-2" />
    </PageShell>
  );
}

function FocusList({ className }: { className?: string }) {
  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
          자료에서 뽑힌 할 일
        </h2>
        <Link
          href="/dashboard/calendar"
          className="group inline-flex items-baseline gap-1 text-[11.5px] wght-500 kerning-tight text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]"
        >
          전체 일정
          <Arrow className="text-[11px]" />
        </Link>
      </div>

      <div className="mt-3 grid gap-5 lg:grid-cols-[1fr_260px]">
        <ul className="overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)]">
          {FOCUS_ITEMS.map((item) => (
            <li key={item.title} className="border-b border-[var(--color-line)] last:border-b-0">
              <Link
                href={item.href}
                className="row-shift group grid grid-cols-[52px_1fr_auto] items-baseline gap-3 px-4 py-4 transition-colors hover:bg-[var(--color-surface)]"
              >
                <span
                  className={
                    item.urgent
                      ? "text-[11px] wght-700 kerning-tight text-[var(--color-urgent)]"
                      : "text-[11px] wght-560 kerning-tight text-[var(--color-fg-subtle)]"
                  }
                >
                  {item.label}
                </span>
                <span className="min-w-0">
                  <span className="flex items-baseline gap-2">
                    <Dot color={COURSE_COLOR[item.course]} size={6} />
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
        </ul>

        <Link
          href="/dashboard/today"
          className="flex min-h-[148px] flex-col justify-between rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-soft)] transition-colors hover:bg-[var(--color-surface)]"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-fg-strong)] text-white">
            <ClipboardCheck size={17} strokeWidth={2.2} />
          </span>
          <span>
            <span className="block text-[15px] leading-[1.35] wght-700 kerning-tight text-[var(--color-fg-strong)]">
              바로 시작하기
            </span>
            <span className="mt-1 block text-[12px] leading-[1.5] wght-450 kerning-tight text-[var(--color-fg-muted)]">
              지금 해야 할 과제 화면으로 넘어가요.
            </span>
          </span>
        </Link>
      </div>
    </section>
  );
}
