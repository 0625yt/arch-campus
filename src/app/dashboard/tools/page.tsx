"use client";

import Link from "next/link";
import { useState } from "react";
import { Arrow, Dot } from "@/components/primitives";
import { PageShell, PageFooter } from "@/components/page-shell";

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

  const filtered =
    filter === "전체" ? WIZARDS : WIZARDS.filter((w) => w.category === filter);
  const urgent = WIZARDS.filter((w) => ["exam-cram", "report-checklist", "presentation"].includes(w.slug));

  return (
    <PageShell width="wide">
      <header className="fade-up">
        <p className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
          막혔을 때 쓰는 도구
        </p>
        <h1 className="mt-3 max-w-[680px] text-[27px] leading-[1.23] wght-700 kerning-tight text-[var(--color-fg-strong)] sm:text-[32px]">
          프롬프트 목록이 아니라, 지금 상황에서 바로 꺼내는 해결책
        </h1>
        <p className="mt-3 max-w-[560px] text-[13.5px] leading-[1.6] wght-450 kerning-tight text-[var(--color-fg-muted)]">
          글을 대신 써주는 기능은 빼고, 학생이 직접 완성할 수 있게 구조·순서·체크포인트만 잡아줘요.
        </p>
      </header>

      <SituationBoard className="mt-7 fade-up fade-up-1" wizards={urgent} />

      <Filters
        className="mt-9 fade-up fade-up-2"
        active={filter}
        onChange={setFilter}
      />

      <ToolList className="mt-5 fade-up fade-up-3" wizards={filtered} />

      <PageFooter>
        결과물은 학습 보조용이에요. 리포트·자기소개서 본문을 대신 쓰는 도구는 만들지 않아요.
      </PageFooter>
    </PageShell>
  );
}

function SituationBoard({
  wizards,
  className,
}: {
  wizards: Wizard[];
  className?: string;
}) {
  return (
    <section className={className}>
      <h2 className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
        이번 주 가장 많이 막히는 순간
      </h2>
      <ul className="mt-3 grid grid-cols-1 overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] sm:grid-cols-3">
        {wizards.map((wizard) => (
          <li key={wizard.slug} className="border-b border-[var(--color-line)] last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
            <SituationLink wizard={wizard} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function SituationLink({ wizard }: { wizard: Wizard }) {
  return (
    <Link
      href={wizardHref(wizard)}
      className="group flex h-full min-h-[118px] flex-col justify-between px-4 py-4 transition-colors hover:bg-[var(--color-bg)]"
    >
      <div>
        <span className="inline-flex items-center gap-1.5 text-[11px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
          <Dot color={CATEGORY[wizard.category]} size={5} />
          {wizard.category}
        </span>
        <p className="mt-2 text-[14.5px] leading-[1.35] wght-620 kerning-tight text-[var(--color-fg-strong)]">
          {wizard.title}
        </p>
      </div>
      <div className="mt-4 flex items-baseline justify-between gap-3">
        <span className="truncate text-[11.5px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
          {wizard.minutes}분 안에 틀 잡기
        </span>
        <Arrow className="text-[12px] text-[var(--color-fg-subtle)] transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
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
          const isActive = f === active;
          const count = f === "전체" ? WIZARDS.length : WIZARDS.filter((w) => w.category === f).length;
          return (
            <li key={f}>
              <button
                type="button"
                onClick={() => onChange(f)}
                aria-pressed={isActive}
                className={
                  isActive
                    ? "inline-flex items-baseline gap-1.5 rounded-full bg-[var(--color-fg-strong)] px-3 py-1.5 text-[12.5px] wght-560 kerning-tight text-white"
                    : "inline-flex items-baseline gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] wght-450 kerning-tight text-[var(--color-fg-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)]"
                }
              >
                {f}
                <span className={isActive ? "tabular-nums text-white/60" : "tabular-nums text-[var(--color-fg-subtle)]"}>
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

function ToolList({
  className,
  wizards,
}: {
  className?: string;
  wizards: Wizard[];
}) {
  return (
    <section className={className}>
      <ul className="border-t border-[var(--color-line)]">
        {wizards.map((wizard) => (
          <li key={wizard.slug}>
            <ToolRow wizard={wizard} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ToolRow({ wizard }: { wizard: Wizard }) {
  return (
    <Link
      href={wizardHref(wizard)}
      className="row-shift group flex items-baseline gap-3 border-b border-[var(--color-line)] py-3.5"
    >
      <Dot color={CATEGORY[wizard.category]} size={6} className="translate-y-[-1px]" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
        <span className="text-[10.5px] wght-560 kerning-tight text-[var(--color-fg-subtle)] sm:w-[66px] sm:shrink-0">
          {wizard.category}
        </span>
        <div className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] wght-620 kerning-tight text-[var(--color-fg-strong)] sm:text-[14px]">
            {wizard.title}
          </span>
          <span className="mt-0.5 block truncate text-[11.5px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
            {wizard.situation}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-baseline gap-2.5 self-baseline">
        <span className="hidden text-[10.5px] wght-450 kerning-tight tabular-nums text-[var(--color-fg-subtle)] sm:inline">
          {wizard.minutes}분
        </span>
        <span className="hidden max-w-[170px] truncate text-[10.5px] wght-450 kerning-tight text-[var(--color-fg-subtle)] md:inline">
          {wizard.output}
        </span>
        <Arrow className="reveal-right text-[12px] text-[var(--color-fg-subtle)]" />
      </div>
    </Link>
  );
}

function wizardHref(wizard: Wizard) {
  if (wizard.slug === "presentation") return "/dashboard/tools/presentation";
  return `/dashboard/chat?q=${encodeURIComponent(wizard.query)}`;
}
