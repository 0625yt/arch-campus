import Link from "next/link";
import { BookOpenCheck, ShieldCheck, TimerReset } from "lucide-react";
import { Arrow, Dot, ProgressLine } from "@/components/primitives";
import { PageShell, PageFooter, EmptyState } from "@/components/page-shell";
import { COURSES, COURSE_COLOR, type Course } from "./data";

type CourseSignal = {
  course: Course;
  total: number;
  done: number;
  correct: number;
  accuracy: number;
  remaining: number;
  fresh: number;
  risk: "high" | "medium" | "low";
  nextLabel: string;
  nextHref: string;
};

function courseHref(course: Course) {
  return `/dashboard/study/${course.slug}`;
}

function resumeHref(course: Course) {
  const unfinished = course.materials.find((m) => m.problems.total > m.problems.done);
  const fresh = course.materials.find((m) => m.problems.done === 0);
  const target = unfinished ?? fresh ?? course.materials[0];
  return target ? `${courseHref(course)}/${target.id}` : courseHref(course);
}

function getSignal(course: Course): CourseSignal {
  const total = course.materials.reduce((sum, m) => sum + m.problems.total, 0);
  const done = course.materials.reduce((sum, m) => sum + m.problems.done, 0);
  const correct = course.materials.reduce((sum, m) => sum + m.problems.correct, 0);
  const fresh = course.materials.filter((m) => m.problems.done === 0).length;
  const remaining = Math.max(0, total - done);
  const accuracy = done > 0 ? Math.round((correct / done) * 100) : 0;
  const weak = done > 0 && accuracy < 75;
  const risk: CourseSignal["risk"] =
    remaining >= 10 || weak ? "high" : remaining >= 4 || fresh > 0 ? "medium" : "low";

  let nextLabel = "요약 다시 보기";
  if (remaining > 0) nextLabel = `${remaining}문제 풀기`;
  if (fresh > 0) nextLabel = "새 자료 정리";

  return {
    course,
    total,
    done,
    correct,
    accuracy,
    remaining,
    fresh,
    risk,
    nextLabel,
    nextHref: resumeHref(course),
  };
}

export default function StudyIndexPage() {
  const signals = COURSES.map(getSignal).sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.risk] - order[b.risk] || b.remaining - a.remaining;
  });
  const totalMaterials = COURSES.reduce((acc, c) => acc + c.materials.length, 0);
  const totalRemaining = signals.reduce((acc, s) => acc + s.remaining, 0);
  const primary = signals[0];

  return (
    <PageShell width="md">
      <header className="fade-up">
        <p className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
          시험 준비실
        </p>
        <h1 className="mt-3 text-[27px] leading-[1.23] wght-700 kerning-tight text-[var(--color-fg-strong)] sm:text-[32px]">
          자료를 모아두는 곳이 아니라, 시험 전까지 뭘 풀지 정하는 곳
        </h1>
        <p className="mt-3 max-w-[560px] text-[13.5px] leading-[1.6] wght-450 kerning-tight text-[var(--color-fg-muted)]">
          과목별 자료·문제·정답률을 한 줄로 보고, 밀린 과목부터 바로 이어서 시작해요.
        </p>
      </header>

      {COURSES.length === 0 ? (
        <EmptyState
          className="mt-10 fade-up fade-up-1"
          title="아직 등록된 강의가 없어요"
          hint="강의계획서 PDF를 올리면 시험·과제 일정과 과목이 함께 정리돼요."
          action={
            <Link
              href="/dashboard/calendar"
              className="group inline-flex items-baseline gap-1.5 text-[14px] wght-560 kerning-tight text-[var(--color-accent)] hover:text-[var(--color-accent-strong)]"
            >
              강의계획서 올리기
              <Arrow className="text-[13px] transition-transform group-hover:translate-x-0.5" />
            </Link>
          }
        />
      ) : (
        <>
          <StudyBrief
            className="mt-7 fade-up fade-up-1"
            courseCount={COURSES.length}
            materialCount={totalMaterials}
            remaining={totalRemaining}
          />

          {primary && <PriorityBlock className="mt-8 fade-up fade-up-2" signal={primary} />}

          <ExamMode className="mt-8 fade-up fade-up-3" />

          <section className="mt-10 fade-up fade-up-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
                과목별 준비 상태
              </h2>
              <Link
                href="/dashboard/calendar"
                className="group inline-flex items-baseline gap-1 text-[11.5px] wght-500 kerning-tight text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]"
              >
                레이더 보기
                <Arrow className="text-[11px]" />
              </Link>
            </div>
            <ul className="mt-3 border-t border-[var(--color-line)]">
              {signals.map((signal) => (
                <li key={signal.course.slug}>
                  <CourseRow signal={signal} />
                </li>
              ))}
            </ul>
          </section>

          <AddCourseNudge className="mt-8 fade-up fade-up-5" />
        </>
      )}

      <PageFooter>
        문제는 업로드한 자료에서 만들고, 출처 근거와 함께 확인하는 흐름으로 설계돼요.
      </PageFooter>
    </PageShell>
  );
}

function StudyBrief({
  courseCount,
  materialCount,
  remaining,
  className,
}: {
  courseCount: number;
  materialCount: number;
  remaining: number;
  className?: string;
}) {
  return (
    <section className={className}>
      <dl className="grid grid-cols-3 overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]">
        <BriefItem label="과목" value={courseCount} />
        <BriefItem label="자료" value={materialCount} />
        <BriefItem label="남은 문제" value={remaining} urgent={remaining > 0} />
      </dl>
    </section>
  );
}

function BriefItem({
  label,
  value,
  urgent,
}: {
  label: string;
  value: number;
  urgent?: boolean;
}) {
  return (
    <div className="border-r border-[var(--color-line)] px-4 py-3 last:border-r-0">
      <dt className="text-[11px] wght-500 kerning-tight text-[var(--color-fg-subtle)]">
        {label}
      </dt>
      <dd
        className={
          urgent
            ? "mt-1 text-[20px] wght-700 kerning-tight tabular-nums text-[var(--color-urgent)]"
            : "mt-1 text-[20px] wght-700 kerning-tight tabular-nums text-[var(--color-fg-strong)]"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function PriorityBlock({
  signal,
  className,
}: {
  signal: CourseSignal;
  className?: string;
}) {
  return (
    <section className={className}>
      <h2 className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
        지금 밀리기 쉬운 과목
      </h2>
      <div className="mt-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-bg)] p-5 shadow-[var(--shadow-soft)] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Dot color={COURSE_COLOR[signal.course.slug]} size={7} />
            <span className="text-[13px] wght-560 kerning-tight text-[var(--color-fg-muted)]">
              {signal.course.slug}
            </span>
          </div>
          <RiskLabel risk={signal.risk} />
        </div>
        <h3 className="mt-4 text-[22px] leading-[1.28] wght-700 kerning-tight text-[var(--color-fg-strong)]">
          {signal.remaining > 0
            ? `아직 ${signal.remaining}문제가 남아 있어요`
            : "이번 주는 복습만 유지하면 돼요"}
        </h3>
        <p className="mt-2 text-[13px] leading-[1.6] wght-450 kerning-tight text-[var(--color-fg-muted)]">
          {signal.course.professor} · 정답률{" "}
          <span className="tabular-nums text-[var(--color-fg)]">{signal.accuracy || 0}%</span>
          {signal.fresh > 0 && (
            <>
              <span className="mx-1.5 text-[var(--color-line-strong)]">·</span>
              새 자료 {signal.fresh}개
            </>
          )}
        </p>
        <ProgressLine
          value={signal.total ? signal.done / signal.total : 0}
          className="mt-5 max-w-[360px]"
        />
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link
            href={signal.nextHref}
            className="inline-flex min-h-[44px] items-center rounded-lg bg-[var(--color-fg-strong)] px-4 text-[13.5px] wght-560 kerning-tight text-white hover:bg-[var(--color-fg)]"
          >
            {signal.nextLabel}
          </Link>
          <Link
            href={courseHref(signal.course)}
            className="group inline-flex min-h-[44px] items-center gap-1.5 text-[13px] wght-500 kerning-tight text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
          >
            과목 전체 보기
            <Arrow className="text-[12px] transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function ExamMode({ className }: { className?: string }) {
  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
          시험 12분 모드
        </h2>
        <span className="text-[11px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
          D-4 · 운영체제 30%
        </span>
      </div>
      <div className="mt-3 rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-bg)] p-5 shadow-[var(--shadow-soft)] sm:p-6">
        <div className="grid gap-5 md:grid-cols-[1fr_220px] md:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                <BookOpenCheck size={17} strokeWidth={2.1} />
              </span>
              <span className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-muted)]">
                교수님 강조 + 내 오답 합산
              </span>
            </div>
            <h3 className="mt-4 max-w-[520px] text-[21px] leading-[1.28] wght-700 kerning-tight text-[var(--color-fg-strong)]">
              시험 범위 전체 말고, 틀리면 크게 흔들리는 7문제만 먼저 풀어요
            </h3>
            <div className="mt-4 flex flex-wrap gap-2">
              <ConceptChip label="Peterson 한계" urgent />
              <ConceptChip label="세마포어 wait/signal" />
              <ConceptChip label="교착 상태 4조건" />
            </div>
          </div>

          <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
            <div className="flex items-baseline justify-between gap-3 text-[11.5px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
              <span>예상 회복</span>
              <span className="tabular-nums text-[var(--color-fg)]">+18%</span>
            </div>
            <ProgressLine value={0.62} className="mt-3" />
            <Link
              href="/dashboard/study/%EC%9A%B4%EC%98%81%EC%B2%B4%EC%A0%9C/process-sync"
              className="mt-4 inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-fg-strong)] px-4 text-[13px] wght-560 kerning-tight text-white transition-colors hover:bg-[var(--color-fg)]"
            >
              <TimerReset size={15} strokeWidth={2.1} />
              12분 시작
            </Link>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-2 border-t border-[var(--color-line)] pt-4 text-[11.5px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck size={13} strokeWidth={2} />
            시험 직전에는 오답만 다시 보여줌
          </span>
          <span>자료 출처: 5주차 프로세스 동기화</span>
        </div>
      </div>
    </section>
  );
}

function ConceptChip({ label, urgent }: { label: string; urgent?: boolean }) {
  return (
    <span
      className={
        urgent
          ? "rounded-full bg-[var(--color-urgent-soft)] px-3 py-1.5 text-[11.5px] wght-700 kerning-tight text-[var(--color-urgent)]"
          : "rounded-full bg-[var(--color-surface)] px-3 py-1.5 text-[11.5px] wght-560 kerning-tight text-[var(--color-fg-muted)]"
      }
    >
      {label}
    </span>
  );
}

function CourseRow({ signal }: { signal: CourseSignal }) {
  return (
    <Link
      href={signal.nextHref}
      className="row-shift group flex items-baseline gap-3 border-b border-[var(--color-line)] py-3.5 text-[var(--color-fg)] hover:text-[var(--color-fg-strong)]"
    >
      <Dot color={COURSE_COLOR[signal.course.slug]} size={6} className="translate-y-[-1px]" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
        <span className="text-[13.5px] wght-620 kerning-tight text-[var(--color-fg-strong)] sm:w-[92px] sm:shrink-0">
          {signal.course.slug}
        </span>
        <span className="min-w-0 truncate text-[13px] wght-450 kerning-tight text-[var(--color-fg-muted)]">
          {signal.nextLabel}
        </span>
      </div>
      <div className="flex shrink-0 items-baseline gap-2.5 self-baseline">
        <span className="hidden text-[10.5px] wght-450 kerning-tight tabular-nums text-[var(--color-fg-subtle)] sm:inline">
          {signal.done}/{signal.total || 0}
        </span>
        <RiskLabel risk={signal.risk} compact />
        <Arrow className="reveal-right text-[12px] text-[var(--color-fg-subtle)]" />
      </div>
    </Link>
  );
}

function RiskLabel({
  risk,
  compact,
}: {
  risk: CourseSignal["risk"];
  compact?: boolean;
}) {
  const label = risk === "high" ? "위험" : risk === "medium" ? "주의" : "안정";
  return (
    <span
      className={
        risk === "high"
          ? "text-[11px] wght-700 kerning-tight text-[var(--color-urgent)]"
          : risk === "medium"
            ? "text-[11px] wght-700 kerning-tight text-[var(--color-warn)]"
            : "text-[11px] wght-560 kerning-tight text-[var(--color-success)]"
      }
    >
      {compact ? label : `${label} 과목`}
    </span>
  );
}

function AddCourseNudge({ className }: { className?: string }) {
  return (
    <Link
      href="/dashboard/calendar"
      className={`group flex items-baseline justify-between gap-3 border-y border-[var(--color-line)] py-3.5 ${className ?? ""}`}
    >
      <span className="text-[13px] wght-500 kerning-tight text-[var(--color-fg-muted)] group-hover:text-[var(--color-fg)]">
        새 강의는 강의계획서로 추가하는 게 제일 빨라요
      </span>
      <Arrow className="text-[12px] text-[var(--color-fg-subtle)] transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
