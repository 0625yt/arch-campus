"use client";

import Link from "next/link";
import { useState } from "react";
import { Arrow, Dot, HighlightText } from "@/components/primitives";
import {
  PageShell,
  PageHint,
  PageTitle,
  MetaLine,
  PageFooter,
} from "@/components/page-shell";

/* ─────────── data (mock) ─────────── */

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
  hook: string;
  steps: number;
  output: string;
  hot?: boolean;
}

const WIZARDS: Wizard[] = [
  {
    slug: "presentation",
    category: "발표",
    title: "발표자료 구조화",
    hook: "5단계로 답하면 슬라이드·대본·예상질문이 나와요",
    steps: 5,
    output: "구조 + 슬라이드 + 대본",
    hot: true,
  },
  {
    slug: "presentation-qa",
    category: "발표",
    title: "Q&A 예상질문",
    hook: "발표 직전에 떨리는 사람을 위해",
    steps: 3,
    output: "질문 10개 + 답변 초안",
  },
  {
    slug: "report-structure",
    category: "과제",
    title: "리포트 구조 설계",
    hook: "본문은 본인이 쓰고, 우리는 뼈대만",
    steps: 4,
    output: "목차 + 섹션 가이드",
  },
  {
    slug: "report-checklist",
    category: "과제",
    title: "교수 요구사항 체크",
    hook: "공지에서 가점 포인트 뽑아드려요",
    steps: 2,
    output: "체크리스트",
  },
  {
    slug: "exam-questions",
    category: "시험",
    title: "기출형 문제 생성",
    hook: "내 자료로 만든 문제만",
    steps: 4,
    output: "객관식 / 주관식 / 서술형",
    hot: true,
  },
  {
    slug: "exam-wrong",
    category: "시험",
    title: "오답 원인 분석",
    hook: "왜 틀렸는지 패턴으로",
    steps: 3,
    output: "오답 유형 + 보완 개념",
  },
  {
    slug: "exam-cram",
    category: "시험",
    title: "벼락치기 학습 계획",
    hook: "30분·1시간·3시간 시나리오",
    steps: 3,
    output: "시간대별 학습안",
    hot: true,
  },
  {
    slug: "team-roles",
    category: "팀플",
    title: "역할 분배",
    hook: "팀원 수와 마감만 있으면",
    steps: 3,
    output: "역할표 + 일정",
  },
  {
    slug: "team-minutes",
    category: "팀플",
    title: "합의록 정리",
    hook: "회의 텍스트를 결정사항으로",
    steps: 2,
    output: "합의록 + 숙제",
  },
  {
    slug: "career-cover",
    category: "진로",
    title: "자기소개서 구조화",
    hook: "본문 X. 항목별 구조 가이드만",
    steps: 4,
    output: "문항별 구조 가이드",
  },
  {
    slug: "career-interview",
    category: "진로",
    title: "면접 예상질문",
    hook: "회사·직무·이력서로 20문",
    steps: 3,
    output: "질문 + 답변 프레임",
  },
  {
    slug: "career-contest",
    category: "진로",
    title: "공모전 제안서 구조",
    hook: "아이디어를 제안서로 정렬",
    steps: 4,
    output: "제안서 목차",
  },
];

const FILTERS: { id: "전체" | Category; label: string; count: number }[] = [
  { id: "전체", label: "전체", count: WIZARDS.length },
  { id: "발표", label: "발표", count: WIZARDS.filter((w) => w.category === "발표").length },
  { id: "과제", label: "과제", count: WIZARDS.filter((w) => w.category === "과제").length },
  { id: "시험", label: "시험", count: WIZARDS.filter((w) => w.category === "시험").length },
  { id: "팀플", label: "팀플", count: WIZARDS.filter((w) => w.category === "팀플").length },
  { id: "진로", label: "진로", count: WIZARDS.filter((w) => w.category === "진로").length },
];

/* ─────────── page ─────────── */

type FilterId = "전체" | Category;

export default function ToolsPage() {
  const [filter, setFilter] = useState<FilterId>("전체");

  const filtered =
    filter === "전체" ? WIZARDS : WIZARDS.filter((w) => w.category === filter);

  return (
    <PageShell width="wide">
      <PageHint>프롬프트 못 짜도 괜찮아요. 답만 입력하면 결과물이 나와요</PageHint>

      <PageTitle className="mt-6">
        막막할 때 <HighlightText>단계별로 풀어드려요</HighlightText>
      </PageTitle>

      <MetaLine className="mt-2 fade-up fade-up-1">
        <span>
          <span className="tabular-nums text-[var(--color-fg)]">
            {WIZARDS.length}
          </span>
          종 위저드
        </span>
        <span>5단계 평균 2분</span>
      </MetaLine>

      <Filters
        className="mt-10 fade-up fade-up-2"
        active={filter}
        onChange={setFilter}
      />

      <Grid className="mt-6 fade-up fade-up-3" wizards={filtered} />

      <PageFooter>
        위저드 결과물은 학습 보조용이에요. 본문을 대신 써주는 위저드는 만들지
        않아요 — 구조와 가이드만 드려요.
      </PageFooter>
    </PageShell>
  );
}

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
      <ul className="-mx-1 flex flex-wrap gap-x-1 gap-y-2">
        {FILTERS.map((f) => {
          const isActive = f.id === active;
          return (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => onChange(f.id)}
                aria-pressed={isActive}
                className={
                  isActive
                    ? "inline-flex items-baseline gap-1.5 rounded-full bg-[var(--color-fg-strong)] px-3 py-1.5 text-[12.5px] wght-560 kerning-tight text-white"
                    : "inline-flex items-baseline gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] wght-450 kerning-tight text-[var(--color-fg-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)]"
                }
              >
                {f.id !== "전체" && (
                  <Dot color={CATEGORY[f.id as Category]} size={5} />
                )}
                {f.label}
                <span
                  className={
                    isActive
                      ? "tabular-nums text-white/60"
                      : "tabular-nums text-[var(--color-fg-subtle)]"
                  }
                >
                  {f.count}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Grid({
  className,
  wizards,
}: {
  className?: string;
  wizards: Wizard[];
}) {
  return (
    <section className={className}>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {wizards.map((w) => (
          <li key={w.slug}>
            <Card w={w} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Card({ w }: { w: Wizard }) {
  const ready = w.slug === "presentation";
  const cardCls =
    "group flex h-full flex-col rounded-2xl border border-[var(--color-line)] bg-[var(--color-bg)] p-5 transition-all duration-[var(--duration-base)]";
  const interactive =
    "hover:-translate-y-px hover:border-[var(--color-line-strong)] hover:shadow-[var(--shadow-soft)]";
  const dimmed = "opacity-60";

  const inner = (
    <>
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] wght-560 kerning-mono uppercase text-[var(--color-fg-subtle)]">
          <Dot color={CATEGORY[w.category]} size={5} />
          {w.category}
        </span>
        {ready ? (
          w.hot && (
            <span className="text-[9.5px] wght-700 kerning-mono uppercase text-[var(--color-urgent)]">
              많이 써요
            </span>
          )
        ) : (
          <span className="rounded-full bg-[var(--color-surface-strong)] px-2 py-0.5 text-[9.5px] wght-560 kerning-mono uppercase text-[var(--color-fg-muted)]">
            준비 중
          </span>
        )}
      </div>

      <h3 className="mt-3 text-[16px] wght-700 kerning-tight text-[var(--color-fg-strong)] sm:text-[16.5px]">
        {w.title}
      </h3>

      <p className="mt-1.5 text-[12.5px] leading-[1.55] kerning-tight text-[var(--color-fg-muted)]">
        {w.hook}
      </p>

      <div className="mt-5 flex items-baseline justify-between gap-2 border-t border-[var(--color-line)] pt-3 text-[11px] wght-450 kerning-tight">
        <span className="text-[var(--color-fg-subtle)]">
          <span className="tabular-nums text-[var(--color-fg)]">{w.steps}단계</span>
          <span className="mx-1.5 text-[var(--color-line-strong)]">·</span>
          {w.output}
        </span>
        {ready && (
          <Arrow className="text-[12px] text-[var(--color-fg-subtle)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--color-fg)]" />
        )}
      </div>
    </>
  );

  if (!ready) {
    return (
      <div
        aria-disabled
        title="아직 준비 중이에요. 곧 만나요"
        className={`${cardCls} ${dimmed} cursor-not-allowed`}
      >
        {inner}
      </div>
    );
  }

  return (
    <Link
      href="/dashboard/tools/presentation"
      className={`${cardCls} ${interactive}`}
    >
      {inner}
    </Link>
  );
}
