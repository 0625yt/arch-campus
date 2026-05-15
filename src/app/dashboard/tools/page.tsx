"use client";

import Link from "next/link";
import { useState } from "react";

const CATEGORY = {
  발표: "#7aa6d6",
  과제: "#cca06b",
  시험: "#e0445e",
  팀플: "#7fb38c",
  진로: "#a08bc4",
} as const;

type Category = keyof typeof CATEGORY;

interface Wizard {
  slug: string;
  category: Category;
  title: string;
  situation: string;
  output: string;
  minutes: number;
  ready?: boolean;
  query: string;
}

const WIZARDS: Wizard[] = [
  {
    slug: "presentation",
    category: "발표",
    title: "발표자료 구조화",
    situation: "발표 날짜는 잡혔는데 첫 장부터 막힐 때",
    output: "슬라이드 흐름 + 대본 + 예상 질문",
    minutes: 5,
    ready: true,
    query: "발표 주제와 평가 기준을 바탕으로 슬라이드 구조를 잡아줘",
  },
  {
    slug: "presentation-qa",
    category: "발표",
    title: "Q&A 예상질문",
    situation: "발표 전날 질문이 무서워질 때",
    output: "질문 10개 + 답변 방향",
    minutes: 3,
    query: "내 발표 내용 기준으로 예상 질문과 답변 방향을 만들어줘",
  },
  {
    slug: "report-structure",
    category: "과제",
    title: "리포트 구조 설계",
    situation: "본문을 쓰기 전에 목차가 안 잡힐 때",
    output: "목차 + 섹션별 작성 가이드",
    minutes: 4,
    query: "리포트 주제와 분량 기준으로 목차와 섹션별 작성 가이드를 만들어줘",
  },
  {
    slug: "report-checklist",
    category: "과제",
    title: "교수 요구사항 체크",
    situation: "공지사항은 긴데 뭘 챙겨야 할지 모르겠을 때",
    output: "감점 방지 체크리스트",
    minutes: 2,
    ready: true,
    query: "과제 공지에서 요구사항과 감점 위험을 체크리스트로 정리해줘",
  },
  {
    slug: "exam-questions",
    category: "시험",
    title: "기출형 문제 생성",
    situation: "노트를 다시 읽기 싫고 바로 점검하고 싶을 때",
    output: "객관식·주관식·서술형 문제",
    minutes: 4,
    query: "업로드한 강의자료에서 시험에 나올 만한 문제를 만들어줘",
  },
  {
    slug: "exam-wrong",
    category: "시험",
    title: "오답 원인 분석",
    situation: "틀린 건 아는데 왜 틀렸는지 애매할 때",
    output: "오답 유형 + 보완 개념",
    minutes: 3,
    query: "내 오답을 보고 왜 틀렸는지와 다시 볼 개념을 정리해줘",
  },
  {
    slug: "exam-cram",
    category: "시험",
    title: "벼락치기 학습 계획",
    situation: "시험까지 시간이 거의 없을 때",
    output: "30분·1시간·3시간 학습안",
    minutes: 3,
    ready: true,
    query: "시험 범위와 남은 시간 기준으로 벼락치기 계획을 짜줘",
  },
  {
    slug: "team-roles",
    category: "팀플",
    title: "역할 분배",
    situation: "팀원이 모였는데 누가 뭘 할지 안 정해질 때",
    output: "역할표 + 일정표",
    minutes: 3,
    query: "팀플 주제와 팀원 수 기준으로 역할과 일정을 나눠줘",
  },
  {
    slug: "team-minutes",
    category: "팀플",
    title: "합의록 정리",
    situation: "회의는 했는데 결정사항이 흩어졌을 때",
    output: "결정사항 + 각자 숙제",
    minutes: 2,
    query: "회의 내용을 결정사항과 담당자별 할 일로 정리해줘",
  },
  {
    slug: "career-cover",
    category: "진로",
    title: "자기소개서 구조화",
    situation: "경험은 있는데 문항에 어떻게 넣을지 막힐 때",
    output: "문항별 구조 가이드",
    minutes: 4,
    query: "회사와 직무, 내 경험을 바탕으로 자기소개서 구조만 잡아줘",
  },
  {
    slug: "career-interview",
    category: "진로",
    title: "면접 예상질문",
    situation: "면접 전에 뭘 물어볼지 감이 없을 때",
    output: "질문 20개 + 답변 프레임",
    minutes: 3,
    query: "직무와 이력서 기준으로 면접 예상질문과 답변 프레임을 만들어줘",
  },
  {
    slug: "career-contest",
    category: "진로",
    title: "공모전 제안서 구조",
    situation: "아이디어는 있는데 제안서로 안 묶일 때",
    output: "제안서 목차 + 핵심 메시지",
    minutes: 4,
    query: "공모전 주제와 아이디어 기준으로 제안서 구조를 잡아줘",
  },
];

const FILTERS: ("전체" | Category)[] = ["전체", "발표", "과제", "시험", "팀플", "진로"];

type FilterId = "전체" | Category;

export default function ToolsPage() {
  const [filter, setFilter] = useState<FilterId>("전체");

  const filtered = filter === "전체" ? WIZARDS : WIZARDS.filter((w) => w.category === filter);
  const urgent = WIZARDS.filter((w) =>
    ["exam-cram", "report-checklist", "presentation"].includes(w.slug),
  );

  return (
    <div>
      <div className="mx-auto w-full max-w-[1080px] px-6 pb-24 pt-8 sm:px-10 sm:pb-28 sm:pt-12 md:px-12">
        {/* Top bar */}
        <header className="fade-up flex items-baseline justify-between gap-3">
          <p
            className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            도구
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

        {/* Hero */}
        <header className="mt-10 fade-up fade-up-1 sm:mt-14">
          <h1
            className="max-w-[820px] text-[34px] leading-[1.07] wght-620 text-[var(--color-apple-ink)] sm:text-[48px] md:text-[56px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            막혔을 때 꺼내는 <span className="text-[var(--color-apple-muted)]">12개 도구.</span>
          </h1>
          <p
            className="mt-4 max-w-[600px] text-[15px] leading-[1.55] wght-450 text-[var(--color-apple-muted)] sm:text-[17px] sm:leading-[1.5]"
            style={{ letterSpacing: "-0.022em" }}
          >
            글을 대신 써주는 게 아니라, 직접 완성할 수 있도록 구조·순서·체크포인트만 잡아드려요.
          </p>
        </header>

        {/* 이번 주 자주 막히는 순간 — Bento 3 */}
        <UrgentBoard wizards={urgent} className="mt-12 fade-up fade-up-2 sm:mt-14" />

        {/* 필터 + 리스트 */}
        <section className="mt-16 fade-up fade-up-3 sm:mt-20">
          <div className="flex items-baseline justify-between gap-3">
            <h2
              className="text-[24px] leading-[1.1] wght-620 text-[var(--color-apple-ink)] sm:text-[28px]"
              style={{ letterSpacing: "-0.012em" }}
            >
              모든 도구.
            </h2>
            <span
              className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              {filtered.length}개
            </span>
          </div>

          <Filters active={filter} onChange={setFilter} className="mt-6" />

          <ToolList wizards={filtered} className="mt-6" />
        </section>
      </div>
    </div>
  );
}

/* ──────────── 이번 주 자주 막히는 순간 ──────────── */

function UrgentBoard({ wizards, className }: { wizards: Wizard[]; className?: string }) {
  return (
    <section className={className}>
      <h2 className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
        이번 주 자주 막히는 순간
      </h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-3 sm:gap-5">
        {wizards.map((w) => (
          <UrgentCard key={w.slug} wizard={w} />
        ))}
      </div>
    </section>
  );
}

function UrgentCard({ wizard }: { wizard: Wizard }) {
  const dotColor = CATEGORY[wizard.category];

  return (
    <Link
      href={wizardHref(wizard)}
      className="group elev-hover-2 flex min-h-[200px] flex-col justify-between rounded-[18px] bg-white p-7"
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-[12px] wght-560 uppercase tracking-[0.06em]"
            style={{ color: dotColor, letterSpacing: "0.06em" }}
          >
            {wizard.category}
          </span>
          <ReadyBadge ready={wizard.ready} />
        </div>
        <h3
          className="mt-3 text-[22px] leading-[1.15] wght-620 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {wizard.title}
        </h3>
        <p
          className="mt-2 text-[13px] leading-[1.5] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.022em" }}
        >
          {wizard.situation}
        </p>
      </div>

      <div className="mt-6 flex items-baseline justify-between">
        <span
          className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {wizard.minutes}분 안에
        </span>
        <span className="text-[14px] text-[var(--color-apple-muted)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--color-apple-action)]">
          ›
        </span>
      </div>
    </Link>
  );
}

/* ──────────── Filters ──────────── */

function Filters({
  className,
  active,
  onChange,
}: {
  className?: string;
  active: FilterId;
  onChange: (id: FilterId) => void;
}) {
  return (
    <nav className={className}>
      <ul className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const isActive = f === active;
          const count =
            f === "전체" ? WIZARDS.length : WIZARDS.filter((w) => w.category === f).length;
          const dotColor = f === "전체" ? null : CATEGORY[f as Category];
          return (
            <li key={f}>
              <button
                type="button"
                onClick={() => onChange(f)}
                aria-pressed={isActive}
                className={
                  isActive
                    ? "inline-flex h-[32px] items-center gap-1.5 rounded-full bg-[var(--color-apple-ink)] px-3.5 text-[13px] wght-560 text-white"
                    : "inline-flex h-[32px] items-center gap-1.5 rounded-full border border-[var(--color-apple-hairline-soft)] bg-white px-3.5 text-[13px] wght-450 text-[var(--color-apple-muted)] transition-colors hover:border-[var(--color-apple-hairline)] hover:text-[var(--color-apple-ink)]"
                }
                style={{ letterSpacing: "-0.012em" }}
              >
                {dotColor && (
                  <span
                    aria-hidden
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: dotColor }}
                  />
                )}
                {f}
                <span
                  className={
                    isActive
                      ? "tabular-nums text-white/60"
                      : "tabular-nums text-[var(--color-apple-muted)]"
                  }
                >
                  {count}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ──────────── Tool List ──────────── */

function ToolList({ className, wizards }: { className?: string; wizards: Wizard[] }) {
  return (
    <ul className={`grid gap-3 sm:grid-cols-2 ${className ?? ""}`}>
      {wizards.map((w) => (
        <li key={w.slug}>
          <ToolCard wizard={w} />
        </li>
      ))}
    </ul>
  );
}

function ToolCard({ wizard }: { wizard: Wizard }) {
  const dotColor = CATEGORY[wizard.category];
  const tint = categoryTint(wizard.category);

  return (
    <Link
      href={wizardHref(wizard)}
      className="group elev-hover-2 relative flex h-full flex-col overflow-hidden rounded-[12px] bg-white p-5 sm:p-6"
    >
      {/* 좌측 카테고리 리본 — 평소 거의 안 보이다가 hover에 살짝 더 진해짐 */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[2.5px] opacity-50 transition-all group-hover:opacity-100"
        style={{ backgroundColor: dotColor }}
      />
      {/* hover 시 우상단 미세한 컬러 워시 */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(140px at 100% 0%, ${tint} 0%, transparent 70%)`,
        }}
      />

      <div className="relative flex items-center justify-between gap-2">
        <span
          className="inline-flex items-center gap-1.5 text-[11px] wght-700 uppercase tracking-[0.06em]"
          style={{ color: dotColor, letterSpacing: "0.06em" }}
        >
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: dotColor }}
          />
          {wizard.category}
        </span>
        <span className="inline-flex items-center gap-2">
          <ReadyBadge ready={wizard.ready} />
          <span
            className="text-[11px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {wizard.minutes}분
          </span>
        </span>
      </div>

      <h4
        className="relative mt-3 text-[16px] leading-[1.3] wght-560 text-[var(--color-apple-ink)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {wizard.title}
      </h4>
      <p
        className="relative mt-1.5 text-[13px] leading-[1.5] wght-450 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.022em" }}
      >
        {wizard.situation}
      </p>

      <div className="relative mt-auto flex items-center justify-between pt-5">
        <span
          className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {wizard.output}
        </span>
        <span className="text-[14px] text-[var(--color-apple-muted)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--color-apple-action)]">
          ›
        </span>
      </div>
    </Link>
  );
}

function categoryTint(category: Category): string {
  switch (category) {
    case "발표":
      return "var(--color-tint-prez)";
    case "과제":
      return "var(--color-tint-assign)";
    case "시험":
      return "var(--color-tint-exam)";
    case "팀플":
      return "var(--color-tint-class)";
    case "진로":
      return "var(--color-tint-etc)";
  }
}

function wizardHref(wizard: Wizard) {
  if (wizard.slug === "presentation") return "/dashboard/tools/presentation";
  if (wizard.slug === "exam-cram") return "/dashboard/tools/exam-cram";
  if (wizard.slug === "report-checklist") return "/dashboard/tools/report-checklist";
  return `/dashboard/chat?q=${encodeURIComponent(wizard.query)}`;
}

/**
 * 위저드가 진짜 단계별 위저드 페이지로 가는지(ready),
 * 아니면 채팅창에 질문이 자동 입력되어 가는지(채팅) 시각적으로 구분.
 *
 * 라벨 없이 카드만 똑같이 생기면 "발표 위저드" 클릭했는데 채팅창 떠서 사용자 혼란.
 */
function ReadyBadge({ ready }: { ready?: boolean }) {
  if (ready) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-[var(--color-tint-class)] px-2 py-0.5 text-[10px] wght-620 text-[var(--color-tint-class-ink)]"
        style={{ letterSpacing: "0.02em" }}
      >
        위저드
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-[var(--color-apple-hairline)] bg-white px-2 py-0.5 text-[10px] wght-560 text-[var(--color-apple-muted)]"
      style={{ letterSpacing: "0.02em" }}
    >
      채팅으로
    </span>
  );
}
