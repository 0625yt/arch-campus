import Link from "next/link";
import { notFound } from "next/navigation";
import { ACTIVITIES, type Activity } from "../../history/data";
import { COURSE_COLOR, type Course, getCourse, type Material } from "../data";
import { UploadZone } from "./upload-zone";

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ course: string }>;
}) {
  const { course: courseSlug } = await params;
  const decoded = decodeURIComponent(courseSlug);
  const course = getCourse(decoded);
  if (!course) notFound();

  const dotColor = COURSE_COLOR[course.slug];
  const total = course.materials.reduce((sum, m) => sum + m.problems.total, 0);
  const done = course.materials.reduce((sum, m) => sum + m.problems.done, 0);
  const correct = course.materials.reduce((sum, m) => sum + m.problems.correct, 0);
  const acc = done > 0 ? Math.round((correct / done) * 100) : 0;
  const pct = total > 0 ? done / total : 0;
  const activities = ACTIVITIES.filter((a) => a.course === course.slug).slice(0, 4);

  return (
    <div className="bg-[var(--color-apple-pearl)]">
      <div className="mx-auto w-full max-w-[1080px] px-6 pb-24 pt-8 sm:px-10 sm:pb-28 sm:pt-12 md:px-12">
        {/* Breadcrumb */}
        <nav
          className="fade-up flex min-w-0 items-center gap-1.5 text-[12px] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          <Link href="/dashboard/study" className="shrink-0 hover:text-[var(--color-apple-ink)]">
            공부
          </Link>
          <span aria-hidden className="shrink-0 text-[var(--color-apple-hairline)]">
            ›
          </span>
          <span className="inline-flex items-center gap-1.5 wght-560 text-[var(--color-apple-ink)]">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dotColor }} />
            {course.slug}
          </span>
        </nav>

        {/* Hero */}
        <header className="mt-10 fade-up fade-up-1 sm:mt-14">
          <p
            className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {course.professor} · {course.semester}
          </p>
          <h1
            className="mt-3 text-[40px] leading-[1.05] wght-620 text-[var(--color-apple-ink)] sm:text-[56px] md:text-[64px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {course.slug}.
          </h1>

          {/* 메타 + 진행률 */}
          <div
            className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[14px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            <span>
              자료{" "}
              <span className="tabular-nums wght-560 text-[var(--color-apple-ink)]">
                {course.materials.length}
              </span>
            </span>
            <span className="text-[var(--color-apple-hairline)]">·</span>
            <span>
              문제{" "}
              <span className="tabular-nums wght-560 text-[var(--color-apple-ink)]">
                {done}/{total}
              </span>
            </span>
            {acc > 0 && (
              <>
                <span className="text-[var(--color-apple-hairline)]">·</span>
                <span>
                  정답률{" "}
                  <span
                    className={`tabular-nums wght-560 ${
                      acc >= 80
                        ? "text-[var(--color-apple-success)]"
                        : acc >= 60
                          ? "text-[var(--color-apple-ink)]"
                          : "text-[var(--color-urgent)]"
                    }`}
                  >
                    {acc}%
                  </span>
                </span>
              </>
            )}
          </div>

          {total > 0 && (
            <div className="mt-4 h-1 w-full max-w-[360px] overflow-hidden rounded-full bg-[var(--color-apple-hairline)]">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.max(2, pct * 100)}%`,
                  backgroundColor: dotColor,
                }}
              />
            </div>
          )}
        </header>

        {/* 이번 학기 한눈에 — Overview Bento */}
        <Overview course={course} className="mt-14 fade-up fade-up-2 sm:mt-16" />

        {/* 자료 그리드 */}
        <Materials course={course} className="mt-14 fade-up fade-up-3 sm:mt-16" />

        {/* 활동 */}
        {activities.length > 0 && (
          <CourseHistory
            activities={activities}
            course={course}
            className="mt-14 fade-up fade-up-4 sm:mt-16"
          />
        )}

        {/* 새 자료 업로드 */}
        <section className="mt-14 fade-up fade-up-5 sm:mt-16">
          <h2
            className="text-[24px] leading-[1.1] wght-620 text-[var(--color-apple-ink)] sm:text-[28px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            새 자료 추가.
          </h2>
          <p
            className="mt-3 text-[14px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.022em" }}
          >
            끌어다 놓거나 클릭해서 선택하면 60초 안에 요약과 첫 문제가 만들어져요.
          </p>
          <div className="mt-6">
            <UploadZone />
          </div>
        </section>
      </div>
    </div>
  );
}

/* ──────────── Overview — 키워드 + Top 개념 + 약점 ──────────── */

function Overview({ course, className }: { course: Course; className?: string }) {
  const hasKeywords = course.keywords && course.keywords.length > 0;
  const hasConcepts = course.topConcepts && course.topConcepts.length > 0;

  const weak = course.materials
    .filter((m) => m.problems.done > 0)
    .map((m) => ({
      m,
      acc: m.problems.correct / m.problems.done,
    }))
    .filter((x) => x.acc < 0.6)
    .sort((a, b) => a.acc - b.acc)
    .slice(0, 2);

  if (!hasKeywords && !hasConcepts && weak.length === 0) return null;

  return (
    <section className={className}>
      <h2
        className="text-[24px] leading-[1.1] wght-620 text-[var(--color-apple-ink)] sm:text-[28px]"
        style={{ letterSpacing: "-0.012em" }}
      >
        이번 학기 한눈에.
      </h2>

      <div className="mt-6 grid gap-4 md:grid-cols-2 md:gap-5">
        {/* 키워드 */}
        {hasKeywords && (
          <div className="rounded-[18px] bg-white p-7 sm:p-8">
            <p className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
              자주 나온 키워드
            </p>
            <ul className="mt-5 flex flex-wrap gap-1.5">
              {course.keywords!.slice(0, 12).map((k) => (
                <li key={k.name}>
                  <Keyword name={k.name} count={k.count} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Top 개념 */}
        {hasConcepts && (
          <div className="rounded-[18px] bg-white p-7 sm:p-8">
            <p className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
              교수님이 강조한 개념
            </p>
            <ul className="mt-5 flex flex-col gap-4">
              {course.topConcepts!.slice(0, 4).map((c) => (
                <li key={c.name}>
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className="truncate text-[15px] wght-560 text-[var(--color-apple-ink)]"
                      style={{ letterSpacing: "-0.012em" }}
                    >
                      {c.name}
                    </span>
                    <span
                      className="shrink-0 text-[11px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
                      style={{ letterSpacing: "-0.012em" }}
                    >
                      {c.mentions}회 · 자료 {c.materials}개
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 한 번 더 볼 만한 */}
      {weak.length > 0 && (
        <div className="mt-4 rounded-[18px] bg-white p-7 sm:p-8 md:mt-5">
          <p className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-urgent)]">
            한 번 더 볼 만한
          </p>
          <ul className="mt-5 flex flex-col gap-3">
            {weak.map(({ m, acc }) => (
              <li key={m.id}>
                <Link
                  href={`/dashboard/study/${course.slug}/${m.id}`}
                  className="group flex items-center justify-between gap-3 rounded-[10px] px-3 py-2.5 transition-colors hover:bg-[var(--color-apple-pearl)]"
                >
                  <span
                    className="truncate text-[14px] wght-560 text-[var(--color-apple-ink)]"
                    style={{ letterSpacing: "-0.012em" }}
                  >
                    {m.title}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span
                      className="text-[12px] wght-560 tabular-nums text-[var(--color-urgent)]"
                      style={{ letterSpacing: "-0.012em" }}
                    >
                      {Math.round(acc * 100)}%
                    </span>
                    <span className="text-[14px] text-[var(--color-apple-muted)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--color-apple-action)]">
                      ›
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Keyword({ name, count }: { name: string; count: number }) {
  const tier = count >= 18 ? "lg" : count >= 12 ? "md" : "sm";
  const cls =
    tier === "lg"
      ? "text-[14px] wght-620 text-[var(--color-apple-ink)] bg-[var(--color-apple-pearl)]"
      : tier === "md"
        ? "text-[13px] wght-560 text-[var(--color-apple-ink)] bg-[var(--color-apple-pearl)]"
        : "text-[12.5px] wght-450 text-[var(--color-apple-muted)] bg-[var(--color-apple-pearl)]";
  return (
    <span
      className={`inline-flex items-baseline gap-1 rounded-full px-3 py-1.5 ${cls}`}
      style={{ letterSpacing: "-0.012em" }}
    >
      {name}
      <span className="text-[10.5px] wght-450 tabular-nums text-[var(--color-apple-muted)]">
        {count}
      </span>
    </span>
  );
}

/* ──────────── Materials Grid ──────────── */

function Materials({ course, className }: { course: Course; className?: string }) {
  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2
          className="text-[24px] leading-[1.1] wght-620 text-[var(--color-apple-ink)] sm:text-[28px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          자료.
        </h2>
        <span
          className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {course.materials.length}개
        </span>
      </div>

      {course.materials.length === 0 ? (
        <div className="mt-6 rounded-[18px] bg-white px-7 py-12 text-center sm:py-16">
          <p
            className="text-[16px] wght-560 text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            아직 자료가 없어요
          </p>
          <p
            className="mt-2 text-[13px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.022em" }}
          >
            PDF·HWPX·PPTX를 끌어다 놓으면 60초 안에 요약과 첫 문제가 만들어져요.
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {course.materials.map((m) => (
            <li key={m.id}>
              <MaterialCard
                courseSlug={course.slug}
                courseColor={COURSE_COLOR[course.slug]}
                material={m}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MaterialCard({
  courseSlug,
  courseColor,
  material,
}: {
  courseSlug: string;
  courseColor: string;
  material: Material;
}) {
  const fresh = material.problems.done === 0;
  const finished =
    material.problems.total > 0 && material.problems.done === material.problems.total;
  const acc =
    material.problems.done > 0
      ? Math.round((material.problems.correct / material.problems.done) * 100)
      : 0;
  const progress =
    material.problems.total > 0 ? material.problems.done / material.problems.total : 0;

  return (
    <Link
      href={`/dashboard/study/${courseSlug}/${material.id}`}
      className="group flex h-full flex-col rounded-[12px] bg-white p-6 transition-transform duration-200 hover:-translate-y-0.5"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {fresh && (
            <span className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-action)]">
              새 자료
            </span>
          )}
          {finished && (
            <span className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-success)]">
              ✓ 완료
            </span>
          )}
          {!fresh && !finished && (
            <span className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
              {material.unit ?? "진행 중"}
            </span>
          )}
        </div>
        <span
          className="text-[11px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {material.pages}쪽 · {material.uploaded}
        </span>
      </div>

      <h3
        className="mt-3 text-[16px] leading-[1.3] wght-560 text-[var(--color-apple-ink)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {material.title}
      </h3>

      {material.oneLine && (
        <p
          className="mt-2 line-clamp-2 text-[13px] leading-[1.5] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.022em" }}
        >
          {material.oneLine}
        </p>
      )}

      <div className="mt-auto pt-5">
        {/* 진행률 + 메타 */}
        {material.problems.total > 0 && (
          <>
            <div className="flex items-center justify-between gap-2">
              <span
                className="text-[12px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                {material.problems.done}/{material.problems.total} 풂{acc > 0 && ` · ${acc}%`}
              </span>
              <span className="text-[14px] text-[var(--color-apple-muted)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--color-apple-action)]">
                ›
              </span>
            </div>
            {progress > 0 && (
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--color-apple-hairline)]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${progress * 100}%`,
                    backgroundColor: courseColor,
                  }}
                />
              </div>
            )}
          </>
        )}
        {material.problems.total === 0 && (
          <div className="flex justify-end">
            <span className="text-[14px] text-[var(--color-apple-muted)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--color-apple-action)]">
              ›
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}

/* ──────────── Course History ──────────── */

function CourseHistory({
  activities,
  course,
  className,
}: {
  activities: Activity[];
  course: Course;
  className?: string;
}) {
  const dotColor = COURSE_COLOR[course.slug];

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

      <ul className="mt-6 overflow-hidden rounded-[12px] border border-[var(--color-apple-hairline)] bg-white">
        {activities.map((activity, idx) => (
          <li
            key={activity.id}
            className={
              idx !== activities.length - 1
                ? "border-b border-[var(--color-apple-hairline-soft)]"
                : ""
            }
          >
            <Link
              href={activity.href}
              className="group grid grid-cols-[60px_1fr_auto] items-center gap-4 px-5 py-[18px] transition-colors hover:bg-[var(--color-apple-pearl)] sm:grid-cols-[72px_1fr_auto] sm:gap-5 sm:px-7"
            >
              <span className="text-[11px] wght-450 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
                {activity.kind}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: dotColor }}
                  />
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
          </li>
        ))}
      </ul>
    </section>
  );
}
