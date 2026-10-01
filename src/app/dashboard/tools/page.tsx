"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback } from "react";
import { AppleShell } from "@/components/apple-shell";
import { hexTintDark } from "@/lib/course-palette";
import { useIsDark } from "../use-mobile";
import { ToolsEntryCard } from "./tools-entry-card";

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
  /**
   * 별도 위저드 페이지가 없지만 다른 진짜 기능으로 라우팅하는 경우.
   * 예: exam-questions는 자료 페이지의 generate-form이 처리 → /dashboard/study
   *     exam-wrong은 quiz wrong 페이지 → /dashboard/review
   * 설정되면 ready=true 취급되고 클릭 시 이 경로로.
   */
  redirectTo?: string;
  redirectHint?: string;
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
    redirectTo: "/dashboard/tools/presentation",
    redirectHint: "발표 흐름에서 Q&A 5개도 같이 잡아줘요",
  },
  {
    slug: "report-structure",
    category: "과제",
    title: "리포트 구조 설계",
    situation: "본문을 쓰기 전에 목차가 안 잡힐 때",
    output: "목차 + 섹션별 작성 가이드",
    minutes: 4,
    ready: true,
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
    title: "기출형 문제 점검",
    situation: "노트를 다시 읽기 싫고 바로 점검하고 싶을 때",
    output: "객관식·주관식·서술형 문제",
    minutes: 4,
    query: "업로드한 강의자료에서 시험에 나올 만한 문제를 만들어줘",
    redirectTo: "/dashboard/study",
    redirectHint: "자료 페이지에서 '문제 만들기' 누르면 바로 동작해요",
  },
  {
    slug: "exam-wrong",
    category: "시험",
    title: "오답 원인 분석",
    situation: "틀린 건 아는데 왜 틀렸는지 애매할 때",
    output: "오답 유형 + 보완 개념",
    minutes: 3,
    query: "내 오답을 보고 왜 틀렸는지와 다시 볼 개념을 정리해줘",
    redirectTo: "/dashboard/review",
    redirectHint: "복습 페이지에서 최근 오답을 모아 봐요",
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
    slug: "book-review",
    category: "과제",
    title: "독후감 초안",
    situation: "책은 읽었는데 첫 문단부터 안 써질 때",
    output: "서론·본론·결론 + 내 메모 인용 + 다시 쓰기",
    minutes: 3,
    ready: true,
    query: "책과 내 메모를 바탕으로 독후감 초안을 만들어줘",
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

const LIVE_WIZARDS = WIZARDS.filter((w) => wizardHref(w));
const FILTERS: ("전체" | Category)[] = ["전체", "발표", "과제", "시험"];

type FilterId = "전체" | Category;

function parseFilter(value: string | null): FilterId {
  if (value === "발표" || value === "과제" || value === "시험") return value;
  return "전체";
}

export default function ToolsPage() {
  return (
    <Suspense fallback={null}>
      <ToolsPageInner />
    </Suspense>
  );
}

function ToolsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filter = parseFilter(searchParams.get("filter"));

  // URL ?filter=... 로 유지 → 뒤로가기·딥링크·다른 페이지 다녀와도 필터 보존.
  const setFilter = useCallback(
    (next: FilterId) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "전체") params.delete("filter");
      else params.set("filter", next);
      const qs = params.toString();
      router.replace(qs ? `/dashboard/tools?${qs}` : "/dashboard/tools", { scroll: false });
    },
    [router, searchParams],
  );

  const filtered =
    filter === "전체" ? LIVE_WIZARDS : LIVE_WIZARDS.filter((w) => w.category === filter);
  const urgent = LIVE_WIZARDS.filter((w) =>
    ["exam-cram", "report-checklist", "presentation"].includes(w.slug),
  );

  return (
    <div>
      <AppleShell>
        <header className="fade-up flex items-baseline justify-between gap-3">
          <p className="page-kicker">도구</p>
          <Link href="/dashboard" className="page-rail-link group">
            <span className="border-b border-transparent group-hover:border-[var(--color-apple-action)]">
              내 캠퍼스
            </span>
            <span className="ml-0.5">›</span>
          </Link>
        </header>

        <header className="native-hero mt-6 px-5 py-5 fade-up fade-up-1 sm:mt-8 sm:px-7 sm:py-7">
          <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="page-kicker">학업 도구</p>
              <h1
                className="mt-2 max-w-[760px] text-[30px] leading-[1.04] wght-700 text-[var(--color-apple-ink)] sm:text-[42px] md:text-[48px]"
                style={{ letterSpacing: "-0.028em" }}
              >
                지금 필요한 도구
              </h1>
            </div>
            <div className="native-metric w-fit px-3.5 py-2.5">
              <p className="text-[10.5px] wght-560 text-[var(--color-apple-muted)]">사용 가능</p>
              <p className="mt-1 text-[24px] leading-none wght-700 tabular-nums text-[var(--color-apple-ink)]">
                {LIVE_WIZARDS.length}
                <span className="ml-0.5 text-[12px] wght-450 text-[var(--color-apple-muted)]">
                  개
                </span>
              </p>
            </div>
          </div>
        </header>

        <div className="mt-5 max-w-[760px] fade-up fade-up-2">
          <ToolsEntryCard />
        </div>

        <UrgentBoard wizards={urgent} className="mt-8 fade-up fade-up-3 sm:mt-10" />

        <section className="mt-10 fade-up fade-up-4 sm:mt-12">
          <div className="flex items-baseline justify-between gap-3">
            <h2
              className="text-[17px] leading-[1.2] wght-700 text-[var(--color-apple-ink)] sm:text-[19px]"
              style={{ letterSpacing: "-0.012em" }}
            >
              바로 쓰는 도구{" "}
              <span className="ml-1 text-[12px] wght-450 text-[var(--color-apple-muted)]">
                · {filtered.length}개
              </span>
            </h2>
          </div>

          <Filters active={filter} onChange={setFilter} className="mt-4" />

          <ToolList wizards={filtered} className="mt-4" />
        </section>
      </AppleShell>
    </div>
  );
}

/* ──────────── 바로 시작하기 ──────────── */

function UrgentBoard({ wizards, className }: { wizards: Wizard[]; className?: string }) {
  return (
    <section className={className}>
      <h2 className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
        바로 시작하기
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
  const isDark = useIsDark();
  // 라이트 카테고리 hex는 다크 배경에서 어두워 라벨이 묻힘 → hue 밝은 톤으로.
  const dotColor = isDark
    ? hexTintDark(CATEGORY[wizard.category], false)
    : CATEGORY[wizard.category];

  return (
    <WizardLinkWrap
      wizard={wizard}
      className="native-card group flex min-h-[188px] flex-col justify-between p-6"
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <span
            className="text-[12px] wght-560 uppercase tracking-[0.06em]"
            style={{ color: dotColor, letterSpacing: "0.06em" }}
          >
            {wizard.category}
          </span>
          <ReadyBadge wizard={wizard} />
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
    </WizardLinkWrap>
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
            f === "전체"
              ? LIVE_WIZARDS.length
              : LIVE_WIZARDS.filter((w) => w.category === f).length;
          return (
            <li key={f}>
              <button
                type="button"
                onClick={() => onChange(f)}
                aria-pressed={isActive}
                className={
                  "native-chip inline-flex h-[32px] items-center gap-1.5 px-3.5 text-[13px] " +
                  (isActive ? "wght-560" : "wght-450")
                }
                data-active={isActive ? "true" : "false"}
                style={{ letterSpacing: "-0.012em" }}
              >
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
  const isDark = useIsDark();
  const dotColor = isDark
    ? hexTintDark(CATEGORY[wizard.category], false)
    : CATEGORY[wizard.category];
  const tint = categoryTint(wizard.category);

  return (
    <WizardLinkWrap
      wizard={wizard}
      className="native-card group relative flex h-full flex-col p-5 sm:p-6"
    >
      {/* hover 시 우상단 미세한 컬러 워시 */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(140px at 100% 0%, ${tint} 0%, transparent 70%)`,
        }}
      />

      <div className="relative flex items-center justify-between gap-2">
        {/* 좌측 ribbon이 이미 카테고리 색 표시. 라벨 옆 도트는 DESIGN §10 위반·중복. */}
        <span
          className="inline-flex items-center text-[11px] wght-700 uppercase tracking-[0.06em]"
          style={{ color: dotColor, letterSpacing: "0.06em" }}
        >
          {wizard.category}
        </span>
        <span className="inline-flex items-center gap-2">
          <ReadyBadge wizard={wizard} />
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
    </WizardLinkWrap>
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

function wizardHref(wizard: Wizard): string | null {
  // redirectTo가 있으면 그쪽으로 (기존 진짜 동작이 다른 페이지에 있는 경우)
  if (wizard.redirectTo) return wizard.redirectTo;
  if (wizard.slug === "presentation") return "/dashboard/tools/presentation";
  if (wizard.slug === "exam-cram") return "/dashboard/tools/exam-cram";
  if (wizard.slug === "report-checklist") return "/dashboard/tools/report-checklist";
  if (wizard.slug === "report-structure") return "/dashboard/tools/report-structure";
  if (wizard.slug === "book-review") return "/dashboard/tools/book-review";
  return null;
}

/**
 * 클릭 가능 여부:
 *   - ready 또는 redirectTo가 있으면 → Link
 *   - 그 외(준비 중인 미구현 위저드) → div + 비활성
 */
function WizardLinkWrap({
  wizard,
  className,
  children,
}: {
  wizard: Wizard;
  className: string;
  children: React.ReactNode;
}) {
  const href = wizardHref(wizard);
  if (href) {
    return (
      <Link href={href} className={className} title={wizard.redirectHint}>
        {children}
      </Link>
    );
  }
  return (
    <div
      className={`${className} cursor-not-allowed opacity-60`}
      aria-disabled="true"
      title="준비 중인 흐름이에요"
    >
      {children}
    </div>
  );
}

/**
 * 위저드가 진짜 단계별 위저드 페이지로 가는지(ready),
 * 아니면 채팅창에 질문이 자동 입력되어 가는지(채팅) 시각적으로 구분.
 *
 * 라벨 없이 카드만 똑같이 생기면 "발표 위저드" 클릭했는데 채팅창 떠서 사용자 혼란.
 */
function ReadyBadge({ wizard }: { wizard: Wizard }) {
  if (wizard.ready) {
    return (
      <span
        className="native-chip inline-flex items-center gap-1 px-2 py-0.5 text-[10px] wght-620 text-[var(--color-tint-class-ink)]"
        style={{ letterSpacing: "0.02em" }}
      >
        5분 흐름
      </span>
    );
  }
  if (wizard.redirectTo) {
    return (
      <span
        className="native-chip inline-flex items-center gap-1 px-2 py-0.5 text-[10px] wght-560"
        style={{ letterSpacing: "0.02em" }}
      >
        연결
      </span>
    );
  }
  return (
    <span
      className="native-chip inline-flex items-center gap-1 px-2 py-0.5 text-[10px] wght-560"
      style={{ letterSpacing: "0.02em" }}
    >
      준비 중
    </span>
  );
}
