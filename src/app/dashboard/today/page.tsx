import Link from "next/link";
import { cn } from "@/lib/utils";
import { Arrow, Dot, ProgressLine, HighlightText } from "@/components/primitives";
import { Countdown } from "@/components/countdown";
import { PageShell } from "@/components/page-shell";
import { COURSE_COLOR, type CourseSlug } from "@/app/dashboard/study/data";

/* ─────────── helpers ─────────── */

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

/* ─────────── data (mock) ─────────── */

interface Item {
  course: CourseSlug;
  title: string;
  due: Date;
  dueLabel: string;
  daysAway: number; // 0=today, 1=tomorrow
  href: string;
}

const TODAY_END = new Date();
TODAY_END.setHours(23, 59, 0, 0);

const FIVE = new Date(TODAY_END); FIVE.setDate(FIVE.getDate() + 5);
const NEXT_WED = new Date(TODAY_END); NEXT_WED.setDate(NEXT_WED.getDate() + ((3 - NEXT_WED.getDay() + 7) % 7 || 7));
const NEXT_TUE = new Date(TODAY_END); NEXT_TUE.setDate(NEXT_TUE.getDate() + ((2 - NEXT_TUE.getDay() + 7) % 7 || 7));

const HERO: Item = {
  course: "자료구조",
  title: "과제 3 — 이진 탐색 트리 구현",
  due: TODAY_END,
  dueLabel: "오늘 자정",
  daysAway: 0,
  href: "/dashboard/study/%EC%9E%90%EB%A3%8C%EA%B5%AC%EC%A1%B0/bst",
};

const REST: Item[] = [
  {
    course: "데이터베이스",
    title: "중간 발표 — 정규화 사례 분석",
    due: FIVE,
    dueLabel: "5일 뒤",
    daysAway: 5,
    href: "/dashboard/study/%EB%8D%B0%EC%9D%B4%ED%84%B0%EB%B2%A0%EC%9D%B4%EC%8A%A4/norm",
  },
  {
    course: "알고리즘",
    title: "퀴즈 2 — 동적 계획법",
    due: NEXT_WED,
    dueLabel: "수요일",
    daysAway: 5,
    href: "/dashboard/study/%EC%95%8C%EA%B3%A0%EB%A6%AC%EC%A6%98/dp",
  },
  {
    course: "운영체제",
    title: "중간고사",
    due: NEXT_TUE,
    dueLabel: "다음 주 화 · 8:30",
    daysAway: 4,
    href: "/dashboard/study/%EC%9A%B4%EC%98%81%EC%B2%B4%EC%A0%9C",
  },
  {
    course: "자료구조",
    title: "5장 균형 트리 읽기",
    due: FIVE,
    dueLabel: "이번 주",
    daysAway: 5,
    href: "/dashboard/study/%EC%9E%90%EB%A3%8C%EA%B5%AC%EC%A1%B0/balanced",
  },
];

/* ─────────── page ─────────── */

export default function TodayPage() {
  const now = new Date();

  return (
    <PageShell width="narrow">
      {/* Header — 한 줄, 가볍게 */}
      <header className="fade-up flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[12px] wght-450 kerning-tight">
        <span className="wght-560 text-[var(--color-fg-strong)]">
          {dateLabel(now)}
        </span>
        <span className="text-[var(--color-line-strong)]">·</span>
        <span className="tabular-nums text-[var(--color-fg-muted)]">
          {timeLabel(now)}
        </span>
        <span className="text-[var(--color-line-strong)]">·</span>
        <span className="text-[var(--color-fg-muted)]">윤태경</span>
      </header>

      {/* Hero — 단일 큰 타이포 */}
      <Hero className="mt-12 fade-up fade-up-1 sm:mt-16 md:mt-20" />

      {/* 5분 액션 — Hero 다음 바로 */}
      <FiveMin className="mt-14 fade-up fade-up-2 sm:mt-16 md:mt-20" />

      {/* 리스트 */}
      <ListBlock className="mt-14 fade-up fade-up-3 sm:mt-16" />

      {/* Suggest */}
      <Suggest className="mt-14 fade-up fade-up-4 sm:mt-16" />

      <p className="mt-20 text-[11px] wght-380 kerning-tight text-[var(--color-fg-subtle)]">
        모든 결과물은 학습 보조용이에요. 본인이 한 번 검토하고 다듬어 주세요.
      </p>
    </PageShell>
  );
}

/* ─────────── HERO — 박스 X, 타이포만 ─────────── */

function Hero({ className }: { className?: string }) {
  const taskNoun = HERO.title.replace(/^.*?— /, "");
  return (
    <section className={className}>
      {/* eyebrow — 트렌디 코랄 + ! */}
      <div className="flex flex-wrap items-center gap-2 text-[11.5px] wght-700 kerning-mono uppercase">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-urgent-soft)] px-2.5 py-1 text-[var(--color-urgent)]">
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-[var(--color-urgent)] pulse-dot"
          />
          오늘 자정 마감!
        </span>
        <Dot color={COURSE_COLOR[HERO.course]} size={6} />
        <span className="wght-560 text-[var(--color-fg-muted)]">
          {HERO.course}
        </span>
      </div>

      {/* 거대 헤드라인 — 핵심 명사에 하이라이트 */}
      <h1 className="mt-5 text-[34px] leading-[1.22] kerning-tight break-keep sm:mt-6 sm:text-[40px] md:text-[46px]">
        <span className="wght-700 text-[var(--color-fg-strong)]">
          오늘 자정까지
        </span>
        <br />
        <HighlightText>{taskNoun}</HighlightText>
        <span className="wght-380 text-[var(--color-fg-muted)]">,</span>
        <br />
        <span className="wght-560 text-[var(--color-fg)]">
          지금 시작하면 끝낼 수 있어요
        </span>
      </h1>

      {/* 카운트다운 */}
      <p className="mt-5 text-[13px] wght-450 kerning-tight text-[var(--color-fg-muted)] sm:text-[14px]">
        <Countdown
          target={HERO.due}
          className="wght-700 text-[var(--color-urgent)] tabular-nums"
        />
        <span className="mx-2 text-[var(--color-line-strong)]">·</span>
        <span>아직 0%</span>
      </p>

      {/* 단일 액션 라인 — 박스 X */}
      <div className="mt-7 flex flex-wrap items-baseline gap-x-5 gap-y-2 sm:mt-8">
        <Link
          href={HERO.href}
          className="group inline-flex items-baseline gap-1.5 text-[15px] wght-560 kerning-tight text-[var(--color-accent)] hover:text-[var(--color-accent-strong)]"
        >
          <span className="border-b border-[var(--color-accent)]/40 pb-px group-hover:border-[var(--color-accent-strong)]">
            바로 시작하기
          </span>
          <Arrow className="text-[15px] transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link
          href={`/dashboard/chat?q=${encodeURIComponent(HERO.title + " 5단계로 정리해줘")}`}
          className="group inline-flex items-baseline gap-1 text-[13px] wght-450 kerning-tight text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
        >
          5단계로 끝내기
          <Arrow className="text-[12px] opacity-50 group-hover:opacity-100" />
        </Link>
      </div>
    </section>
  );
}

/* ─────────── 리스트 ─────────── */

function ListBlock({ className }: { className?: string }) {
  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[12px] wght-560 kerning-mono uppercase text-[var(--color-fg-subtle)]">
          이번 주 · {REST.length}건
        </h2>
        <Link
          href="/dashboard/calendar"
          className="group inline-flex items-baseline gap-1 text-[11.5px] wght-500 kerning-tight text-[var(--color-fg-subtle)] transition-colors hover:text-[var(--color-fg)]"
        >
          모두 보기
          <Arrow className="text-[11px]" />
        </Link>
      </div>

      <ul className="mt-3 border-t border-[var(--color-line)]">
        {REST.map((item, i) => (
          <li key={i}>
            <Row item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({ item }: { item: Item }) {
  const isUrgent = item.daysAway <= 3;
  return (
    <Link
      href={item.href}
      className={cn(
        "row-shift group flex items-baseline gap-3 border-b border-[var(--color-line)] py-3 sm:py-3.5",
        "text-[var(--color-fg)] hover:text-[var(--color-fg-strong)]"
      )}
    >
      <Dot color={COURSE_COLOR[item.course]} size={6} className="translate-y-[-1px]" />
      <div className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:gap-3">
        <span className="text-[10.5px] wght-560 kerning-mono uppercase text-[var(--color-fg-subtle)] sm:w-[88px] sm:shrink-0">
          {item.course}
        </span>
        <span
          className={cn(
            "truncate kerning-tight text-[13.5px] sm:text-[14px]",
            isUrgent
              ? "wght-560 text-[var(--color-fg-strong)]"
              : "wght-450 text-[var(--color-fg)]"
          )}
        >
          {item.title}
        </span>
      </div>
      <div className="flex items-baseline gap-2.5 self-baseline">
        <span
          className={cn(
            "text-[11.5px] kerning-tight tabular-nums",
            isUrgent
              ? "wght-560 text-[var(--color-accent)]"
              : "wght-450 text-[var(--color-fg-subtle)]"
          )}
        >
          {item.dueLabel}
        </span>
        <Arrow className="reveal-right text-[12px] text-[var(--color-fg-subtle)]" />
      </div>
    </Link>
  );
}

/* ─────────── 5분 ─────────── */

function FiveMin({ className }: { className?: string }) {
  const total = 12;
  const done = 5;
  const remaining = total - done;
  return (
    <section className={className}>
      {/* eyebrow */}
      <h2 className="text-[12px] wght-560 kerning-mono uppercase text-[var(--color-fg-subtle)]">
        시간이 5분뿐이라면
      </h2>

      {/* 박스 — 옅은 surface 배경 + 라운드 + 보더 X. Hero보다 약함 */}
      <Link
        href="/dashboard/study/%EC%9A%B4%EC%98%81%EC%B2%B4%EC%A0%9C/process-sync"
        className="group mt-3 block rounded-2xl bg-[var(--color-surface)] p-5 transition-colors duration-[var(--duration-base)] hover:bg-[var(--color-surface-strong)] sm:p-6"
      >
        <p className="text-[17px] leading-[1.4] kerning-tight wght-560 text-[var(--color-fg-strong)] sm:text-[18px]">
          시험에 나올 {remaining}문제만 골라뒀어요
        </p>

        <p className="mt-1.5 text-[13px] wght-450 kerning-tight text-[var(--color-fg-muted)]">
          지난주 자주 틀린{" "}
          <span className="text-[var(--color-fg)]">
            프로세스 동기화 · 교착 상태
          </span>
        </p>

        <ProgressLine value={done / total} className="mt-4 max-w-[300px]" />
        <p className="mt-2 text-[11.5px] wght-450 kerning-tight tabular-nums text-[var(--color-fg-subtle)]">
          {done}/{total} 푼 상태
        </p>

        <span className="mt-5 inline-flex items-baseline gap-1.5 text-[13.5px] wght-500 kerning-tight text-[var(--color-fg)] group-hover:text-[var(--color-fg-strong)]">
          5분 시작하기
          <Arrow className="text-[13px] text-[var(--color-fg-subtle)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--color-fg)]" />
        </span>
      </Link>
    </section>
  );
}

/* ─────────── Suggest ─────────── */

function Suggest({ className }: { className?: string }) {
  return (
    <section className={className}>
      <h2 className="text-[12px] wght-560 kerning-mono uppercase text-[var(--color-fg-subtle)]">
        막막할 때
      </h2>
      <ul className="mt-3 border-t border-[var(--color-line)]">
        <SuggestRow
          context="발표 5일 뒤"
          label="5단계로 발표 자료 만들기"
          href="/dashboard/tools/presentation"
        />
        <SuggestRow
          context="시험 다음 주"
          label="범위별 벼락치기 계획 짜기"
          href={`/dashboard/chat?q=${encodeURIComponent("운영체제 중간고사 범위별 벼락치기 계획 짜줘")}`}
        />
        <SuggestRow
          context="새 강의"
          label="강의계획서로 일정 자동 정리"
          href="/dashboard/calendar"
        />
      </ul>
    </section>
  );
}

function SuggestRow({
  context,
  label,
  href,
}: {
  context: string;
  label: string;
  href: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="row-shift group flex items-baseline justify-between gap-4 border-b border-[var(--color-line)] py-3 sm:py-3.5"
      >
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="text-[10.5px] wght-560 kerning-mono uppercase text-[var(--color-fg-subtle)] sm:w-[88px] sm:shrink-0">
            {context}
          </span>
          <span className="truncate text-[13.5px] wght-500 kerning-tight text-[var(--color-fg)] group-hover:text-[var(--color-fg-strong)] sm:text-[14px]">
            {label}
          </span>
        </div>
        <Arrow className="text-[12px] text-[var(--color-fg-subtle)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--color-fg)]" />
      </Link>
    </li>
  );
}
