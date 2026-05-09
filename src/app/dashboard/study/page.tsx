import Link from "next/link";
import { ACTIVITIES, type Activity } from "../history/data";
import { COURSE_COLOR, COURSES, type Course } from "./data";

type CourseSignal = {
  course: Course;
  total: number;
  done: number;
  correct: number;
  accuracy: number;
  remaining: number;
  fresh: number;
  topKeywords: string[];
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
  const topKeywords = course.keywords?.slice(0, 3).map((k) => k.name) ?? [];

  return {
    course,
    total,
    done,
    correct,
    accuracy,
    remaining,
    fresh,
    topKeywords,
  };
}

/** 이번 주 임박 — 마감 가까운 자료 + 미완료 자료 우선 */
function getThisWeekMaterials() {
  const items: {
    course: CourseSlug;
    materialId: string;
    title: string;
    unit?: string;
    keywords?: string[];
    progress: number;
    pages: number;
    href: string;
    badge: string;
    badgeTone: "urgent" | "info" | "neutral";
  }[] = [];

  // 우선순위 1: 미완료 자료 (done < total)
  COURSES.forEach((course) => {
    course.materials
      .filter((m) => m.problems.total > m.problems.done && m.problems.done > 0)
      .forEach((m) => {
        items.push({
          course: course.slug,
          materialId: m.id,
          title: m.title,
          unit: m.unit,
          keywords: m.keywords,
          progress: m.problems.done / m.problems.total,
          pages: m.pages,
          href: `/dashboard/study/${course.slug}/${m.id}`,
          badge: `${m.problems.total - m.problems.done}문제 남음`,
          badgeTone: "urgent" as const,
        });
      });
  });

  // 우선순위 2: 새 자료 (done === 0)
  COURSES.forEach((course) => {
    course.materials
      .filter((m) => m.problems.done === 0)
      .forEach((m) => {
        items.push({
          course: course.slug,
          materialId: m.id,
          title: m.title,
          unit: m.unit,
          keywords: m.keywords,
          progress: 0,
          pages: m.pages,
          href: `/dashboard/study/${course.slug}/${m.id}`,
          badge: "새 자료",
          badgeTone: "info" as const,
        });
      });
  });

  return items.slice(0, 4);
}

type CourseSlug = keyof typeof COURSE_COLOR;

export default function StudyIndexPage() {
  const signals = COURSES.map(getSignal);
  const thisWeek = getThisWeekMaterials();
  const totalMaterials = COURSES.reduce((acc, c) => acc + c.materials.length, 0);
  const totalDone = signals.reduce((acc, s) => acc + s.done, 0);
  const totalProblems = signals.reduce((acc, s) => acc + s.total, 0);
  const overallAccuracy =
    totalDone > 0
      ? Math.round((signals.reduce((acc, s) => acc + s.correct, 0) / totalDone) * 100)
      : 0;

  return (
    <div className="bg-[var(--color-apple-pearl)]">
      <div className="mx-auto w-full max-w-[1080px] px-6 pb-24 pt-8 sm:px-10 sm:pb-28 sm:pt-12 md:px-12">
        {/* ─── Top bar ─────────────── */}
        <header className="fade-up flex items-baseline justify-between gap-3">
          <p
            className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            공부
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

        {/* ─── Hero ─────────────── */}
        <header className="mt-10 fade-up fade-up-1 sm:mt-14">
          <h1
            className="max-w-[820px] text-[34px] leading-[1.07] wght-620 text-[var(--color-apple-ink)] sm:text-[48px] md:text-[56px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            이번 학기,{" "}
            <span className="text-[var(--color-apple-muted)]">{COURSES.length} 강의.</span>
          </h1>
          <p
            className="mt-4 max-w-[600px] text-[15px] leading-[1.55] wght-450 text-[var(--color-apple-muted)] sm:text-[17px] sm:leading-[1.5]"
            style={{ letterSpacing: "-0.022em" }}
          >
            자료 {totalMaterials}개 · 문제 {totalDone}/{totalProblems} 풀이
            {totalDone > 0 && ` · 정답률 ${overallAccuracy}%`}.
          </p>
        </header>

        {/* ─── 강의 Bento ─────────────── */}
        <CourseBento signals={signals} className="mt-10 fade-up fade-up-2 sm:mt-12" />

        {/* ─── 이번 주 임박 자료 ─────────────── */}
        <ThisWeekMaterials items={thisWeek} className="mt-16 fade-up fade-up-3 sm:mt-20" />

        {/* ─── 다시 보면 좋을 만한 ─────────────── */}
        <ReviewSuggest signals={signals} className="mt-14 fade-up fade-up-4 sm:mt-16" />

        {/* ─── 최근 활동 ─────────────── */}
        <RecentActivity className="mt-14 fade-up fade-up-5 sm:mt-16" />
      </div>
    </div>
  );
}

/* ──────────── Course Bento ──────────── */

function CourseBento({ signals, className }: { signals: CourseSignal[]; className?: string }) {
  return (
    <section className={className}>
      <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
        {signals.map((s) => (
          <CourseCard key={s.course.slug} signal={s} />
        ))}
      </div>
    </section>
  );
}

function CourseCard({ signal }: { signal: CourseSignal }) {
  const { course, total, done, accuracy, remaining, fresh, topKeywords } = signal;
  const progress = total > 0 ? done / total : 0;
  const dotColor = COURSE_COLOR[course.slug];

  return (
    <Link
      href={resumeHref(course)}
      className="group flex min-h-[280px] flex-col justify-between rounded-[18px] bg-white p-7 transition-transform duration-300 hover:-translate-y-0.5 sm:p-8"
    >
      <div>
        <div className="flex items-center gap-2.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dotColor }} />
          <span
            className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {course.professor}
          </span>
        </div>

        <h3
          className="mt-4 text-[28px] leading-[1.05] wght-620 text-[var(--color-apple-ink)] sm:text-[32px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {course.slug}
        </h3>

        {/* 키워드 */}
        {topKeywords.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {topKeywords.map((k) => (
              <span
                key={k}
                className="rounded-full bg-[var(--color-apple-pearl)] px-2.5 py-1 text-[11px] wght-450 text-[var(--color-apple-muted)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                {k}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 하단 통계 */}
      <div className="mt-6">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-1">
            <span
              className="text-[28px] leading-none wght-620 text-[var(--color-apple-ink)] tabular-nums"
              style={{ letterSpacing: "-0.024em" }}
            >
              {course.materials.length}
            </span>
            <span
              className="text-[13px] wght-450 text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              자료
            </span>
            {fresh > 0 && (
              <span className="ml-1 text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-action)]">
                · {fresh} new
              </span>
            )}
          </div>
          <div
            className="text-[13px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {done > 0 ? `${accuracy}%` : "—"}
          </div>
        </div>

        {/* 진행률 */}
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[var(--color-apple-hairline)]">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.max(2, progress * 100)}%`,
              backgroundColor: dotColor,
            }}
          />
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span
            className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {remaining > 0 ? `${remaining}문제 남음` : done > 0 ? "전부 풀었어요" : "시작 전"}
          </span>
          <span className="text-[14px] text-[var(--color-apple-muted)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--color-apple-action)]">
            ›
          </span>
        </div>
      </div>
    </Link>
  );
}

/* ──────────── 이번 주 임박 자료 ──────────── */

function ThisWeekMaterials({
  items,
  className,
}: {
  items: ReturnType<typeof getThisWeekMaterials>;
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2
          className="text-[24px] leading-[1.1] wght-620 text-[var(--color-apple-ink)] sm:text-[28px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          이번 주 자료.
        </h2>
        <Link
          href="/dashboard/calendar"
          className="group inline-flex items-baseline text-[14px] wght-450 text-[var(--color-apple-action)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          <span className="border-b border-transparent group-hover:border-[var(--color-apple-action)]">
            전체 일정
          </span>
          <span className="ml-1">›</span>
        </Link>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {items.map((item) => {
          const dotColor = COURSE_COLOR[item.course];
          return (
            <Link
              key={`${item.course}-${item.materialId}`}
              href={item.href}
              className="group flex flex-col rounded-[12px] bg-white p-6 transition-transform duration-200 hover:-translate-y-0.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} />
                  <span
                    className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
                    style={{ letterSpacing: "-0.012em" }}
                  >
                    {item.course}
                  </span>
                </div>
                <span
                  className={`text-[11px] wght-560 uppercase tracking-[0.06em] ${
                    item.badgeTone === "urgent"
                      ? "text-[var(--color-urgent)]"
                      : "text-[var(--color-apple-action)]"
                  }`}
                >
                  {item.badge}
                </span>
              </div>

              <h4
                className="mt-3 text-[16px] leading-[1.3] wght-560 text-[var(--color-apple-ink)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                {item.title}
              </h4>

              {item.unit && (
                <p
                  className="mt-1.5 text-[13px] wght-450 text-[var(--color-apple-muted)]"
                  style={{ letterSpacing: "-0.022em" }}
                >
                  {item.unit} · {item.pages}쪽
                </p>
              )}

              {item.keywords && item.keywords.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1">
                  {item.keywords.slice(0, 3).map((k) => (
                    <span
                      key={k}
                      className="rounded-full bg-[var(--color-apple-pearl)] px-2 py-0.5 text-[10.5px] wght-450 text-[var(--color-apple-muted)]"
                      style={{ letterSpacing: "-0.012em" }}
                    >
                      {k}
                    </span>
                  ))}
                </div>
              )}

              {/* 진행률 (있을 때만) */}
              {item.progress > 0 && (
                <div className="mt-4">
                  <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--color-apple-hairline)]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${item.progress * 100}%`,
                        backgroundColor: dotColor,
                      }}
                    />
                  </div>
                </div>
              )}

              <div className="mt-auto flex items-center pt-5">
                <span
                  className="text-[13px] wght-450 text-[var(--color-apple-action)] transition-transform group-hover:translate-x-0.5"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  자료 열기 ›
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/* ──────────── 다시 보면 좋을 만한 ──────────── */

function ReviewSuggest({ signals, className }: { signals: CourseSignal[]; className?: string }) {
  // 정답률이 가장 낮은 강의를 추출 (mock)
  const weakest = signals
    .filter((s) => s.done > 0 && s.accuracy < 80)
    .sort((a, b) => a.accuracy - b.accuracy)[0];

  if (!weakest) return null;

  const dotColor = COURSE_COLOR[weakest.course.slug];

  return (
    <section className={className}>
      <h2
        className="text-[24px] leading-[1.1] wght-620 text-[var(--color-apple-ink)] sm:text-[28px]"
        style={{ letterSpacing: "-0.012em" }}
      >
        다시 보면 좋을 만한.
      </h2>

      <Link
        href={resumeHref(weakest.course)}
        className="group mt-8 flex flex-col gap-6 rounded-[18px] bg-white p-7 transition-transform duration-300 hover:-translate-y-0.5 sm:flex-row sm:items-center sm:gap-8 sm:p-8"
      >
        {/* 좌 — 메시지 */}
        <div className="flex-1">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} />
            <span
              className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              {weakest.course.slug}
            </span>
          </div>
          <h3
            className="mt-3 text-[22px] leading-[1.2] wght-620 text-[var(--color-apple-ink)] sm:text-[26px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {weakest.course.topConcepts?.[0]?.name ?? "핵심 개념"}을(를)
            <br />한 번 더 보면 좋아요.
          </h3>
          <p
            className="mt-3 text-[14px] leading-[1.5] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.022em" }}
          >
            지금 정답률 {weakest.accuracy}%, 자료에서 가장 자주 나온 개념인데 약해요.
          </p>
        </div>

        {/* 우 — 큰 정답률 + CTA */}
        <div className="flex shrink-0 items-end gap-5 sm:flex-col sm:items-end sm:gap-3">
          <div className="flex items-baseline gap-1">
            <span
              className="text-[44px] leading-none wght-620 text-[var(--color-apple-ink)] tabular-nums sm:text-[56px]"
              style={{ letterSpacing: "-0.024em" }}
            >
              {weakest.accuracy}
            </span>
            <span
              className="text-[20px] wght-450 text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              %
            </span>
          </div>
          <span
            className="inline-flex h-[40px] items-center rounded-full bg-[var(--color-apple-action)] px-5 text-[14px] wght-560 text-white transition-colors duration-150 group-hover:bg-[var(--color-apple-action-hover)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            바로 풀어보기
            <span className="ml-1.5 transition-transform group-hover:translate-x-0.5">›</span>
          </span>
        </div>
      </Link>
    </section>
  );
}

/* ──────────── 최근 활동 ──────────── */

function RecentActivity({ className }: { className?: string }) {
  const recent = ACTIVITIES.slice(0, 6);

  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2
          className="text-[24px] leading-[1.1] wght-620 text-[var(--color-apple-ink)] sm:text-[28px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          최근 활동.
        </h2>
        <Link
          href="/dashboard/history"
          className="group inline-flex items-baseline text-[14px] wght-450 text-[var(--color-apple-action)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          <span className="border-b border-transparent group-hover:border-[var(--color-apple-action)]">
            전체 기록
          </span>
          <span className="ml-1">›</span>
        </Link>
      </div>

      <ul className="mt-8 overflow-hidden rounded-[12px] border border-[var(--color-apple-hairline)] bg-white">
        {recent.map((a, idx) => (
          <li
            key={a.id}
            className={
              idx !== recent.length - 1 ? "border-b border-[var(--color-apple-hairline-soft)]" : ""
            }
          >
            <ActivityRow activity={a} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ActivityRow({ activity }: { activity: Activity }) {
  const dotColor = activity.course
    ? COURSE_COLOR[activity.course as keyof typeof COURSE_COLOR]
    : undefined;

  return (
    <Link
      href={activity.href}
      className="group grid grid-cols-[60px_1fr_auto] items-center gap-4 px-5 py-[18px] transition-colors hover:bg-[var(--color-apple-pearl)] sm:grid-cols-[72px_1fr_auto] sm:gap-5 sm:px-7"
    >
      <span className="text-[11px] wght-450 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
        {activity.kind}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          {dotColor && (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: dotColor }}
            />
          )}
          <span
            className="truncate text-[14px] leading-[1.3] wght-560 text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {activity.title}
          </span>
        </span>
        {activity.result && (
          <span
            className={`mt-1 block truncate text-[12px] wght-450 ${
              activity.result.tone === "good"
                ? "text-[var(--color-apple-success)]"
                : activity.result.tone === "bad"
                  ? "text-[var(--color-urgent)]"
                  : "text-[var(--color-apple-muted)]"
            }`}
            style={{ letterSpacing: "-0.022em" }}
          >
            {activity.result.label}
          </span>
        )}
      </span>
      <span className="text-[15px] text-[var(--color-apple-muted)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--color-apple-action)]">
        ›
      </span>
    </Link>
  );
}
