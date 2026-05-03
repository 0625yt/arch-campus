import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "@/lib/utils";
import { Arrow, Dot, ProgressLine } from "@/components/primitives";
import { PageShell, PageFooter } from "@/components/page-shell";
import { COURSE_COLOR, getCourse, type Course, type Material } from "../data";
import { ACTIVITIES, type Activity } from "../../history/data";
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

  const total = course.materials.reduce((sum, m) => sum + m.problems.total, 0);
  const done = course.materials.reduce((sum, m) => sum + m.problems.done, 0);
  const correct = course.materials.reduce((sum, m) => sum + m.problems.correct, 0);
  const acc = done > 0 ? Math.round((correct / done) * 100) : 0;
  const activities = ACTIVITIES.filter((a) => a.course === course.slug).slice(0, 4);

  return (
    <PageShell width="md">
      {/* breadcrumb */}
      <nav className="fade-up flex items-baseline gap-2 text-[12px] wght-450 kerning-tight">
        <Link
          href="/dashboard/study"
          className="group inline-flex items-baseline gap-1.5 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
        >
          <Arrow
            className="rotate-180 text-[12px] transition-transform group-hover:-translate-x-0.5"
          />
          강의
        </Link>
        <span className="text-[var(--color-line-strong)]">/</span>
        <span className="wght-560 text-[var(--color-fg-strong)]">
          {course.slug}
        </span>
      </nav>

      {/* 한 줄 hint */}
      <p className="mt-8 fade-up fade-up-1 text-[12.5px] wght-450 kerning-tight text-[var(--color-fg-muted)]">
        자료를 올리면 60초 안에 요약과 첫 문제가 만들어져요
      </p>

      {/* 강의 헤더 */}
      <header className="mt-3 fade-up fade-up-1">
        <div className="flex items-baseline gap-3">
          <Dot color={COURSE_COLOR[course.slug]} size={8} />
          <h1 className="text-[26px] leading-[1.2] kerning-tight wght-700 text-[var(--color-fg-strong)] sm:text-[30px] md:text-[34px]">
            {course.slug}
          </h1>
        </div>
        <p className="mt-2 ml-[20px] text-[12.5px] wght-450 kerning-tight text-[var(--color-fg-muted)]">
          {course.professor} · {course.semester}
        </p>
      </header>

      {/* 메타 + 진행률 */}
      <section className="mt-8 fade-up fade-up-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11.5px] wght-500 kerning-tight">
          <span className="text-[var(--color-fg-subtle)]">
            자료{" "}
            <span className="tabular-nums text-[var(--color-fg)]">
              {course.materials.length}
            </span>
          </span>
          <span className="text-[var(--color-line-strong)]">·</span>
          <span className="text-[var(--color-fg-subtle)]">
            문제{" "}
            <span className="tabular-nums text-[var(--color-fg)]">
              {done}/{total}
            </span>
          </span>
          {acc > 0 && (
            <>
              <span className="text-[var(--color-line-strong)]">·</span>
              <span className="text-[var(--color-fg-subtle)]">
                정답률{" "}
                <span className="tabular-nums text-[var(--color-fg)]">{acc}%</span>
              </span>
            </>
          )}
        </div>
        {total > 0 && (
          <ProgressLine value={done / total} className="mt-2 max-w-[300px]" />
        )}
      </section>

      {/* 이번 학기 — 한눈에 */}
      <Overview
        course={course}
        className="mt-12 fade-up fade-up-3"
      />

      <CourseHistory
        activities={activities}
        course={course}
        className="mt-12 fade-up fade-up-4"
      />

      {/* 자료 리스트 */}
      <section className="mt-12 fade-up fade-up-5">
        <h2 className="text-[12px] wght-560 kerning-mono uppercase text-[var(--color-fg-subtle)]">
          자료 · {course.materials.length}건
        </h2>

        {course.materials.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-[var(--color-line-strong)] bg-[var(--color-surface)] px-6 py-10 sm:py-12">
            <p className="text-[15px] wght-700 kerning-tight text-[var(--color-fg-strong)] sm:text-[15.5px]">
              아직 자료가 없어요
            </p>
            <p className="mt-1.5 max-w-[440px] text-[13px] leading-[1.6] wght-450 kerning-tight text-[var(--color-fg-muted)]">
              PDF·HWPX·PPTX를 끌어다 놓으면 60초 안에 요약과 첫 문제가
              만들어져요.
            </p>
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {course.materials.map((m) => (
              <li key={m.id}>
                <MaterialCard courseSlug={course.slug} material={m} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 업로드 */}
      <section className="mt-10 fade-up fade-up-5">
        <h2 className="text-[12px] wght-560 kerning-mono uppercase text-[var(--color-fg-subtle)]">
          새 자료
        </h2>
        <div className="mt-3">
          <UploadZone />
        </div>
      </section>

      <PageFooter>
        모든 문제는 업로드한 자료에서 추출되고, 출처 페이지·문단을 함께 보여줘요.
      </PageFooter>
    </PageShell>
  );
}

function CourseHistory({
  activities,
  course,
  className,
}: {
  activities: Activity[];
  course: Course;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[12px] wght-560 kerning-mono uppercase text-[var(--color-fg-subtle)]">
          이 과목 히스토리
        </h2>
        <Link
          href="/dashboard/history"
          className="group inline-flex items-baseline gap-1 text-[11.5px] wght-500 kerning-tight text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]"
        >
          전체 보기
          <Arrow className="text-[11px] transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      {activities.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-[var(--color-line-strong)] bg-[var(--color-surface)] px-5 py-6">
          <p className="text-[13px] wght-450 kerning-tight text-[var(--color-fg-muted)]">
            아직 {course.slug} 활동이 없어요. 자료를 열거나 문제를 만들면 여기에 쌓여요.
          </p>
        </div>
      ) : (
        <ul className="mt-3 border-t border-[var(--color-line)]">
          {activities.map((activity) => (
            <li key={activity.id}>
              <CourseActivityRow activity={activity} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CourseActivityRow({ activity }: { activity: Activity }) {
  return (
    <Link
      href={activity.href}
      className="row-shift group flex items-baseline gap-3 border-b border-[var(--color-line)] py-3.5"
    >
      <span className="shrink-0 text-[10px] wght-700 kerning-mono uppercase text-[var(--color-fg-subtle)]">
        {activity.kind}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] wght-560 kerning-tight text-[var(--color-fg-strong)]">
          {activity.title}
        </span>
        {activity.meta && (
          <span className="mt-0.5 block truncate text-[11.5px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
            {activity.meta}
          </span>
        )}
      </span>
      {activity.result && (
        <span
          className={cn(
            "hidden shrink-0 text-[11px] wght-560 kerning-tight sm:inline",
            activity.result.tone === "good" && "text-[var(--color-success)]",
            activity.result.tone === "bad" && "text-[var(--color-urgent)]",
            activity.result.tone === "neutral" && "text-[var(--color-fg-subtle)]",
          )}
        >
          {activity.result.label}
        </span>
      )}
      <Arrow className="reveal-right shrink-0 text-[12px] text-[var(--color-fg-subtle)]" />
    </Link>
  );
}

function MaterialCard({
  courseSlug,
  material,
}: {
  courseSlug: string;
  material: Material;
}) {
  const fresh = material.problems.done === 0;
  const finished =
    material.problems.total > 0 &&
    material.problems.done === material.problems.total;
  const acc =
    material.problems.done > 0
      ? Math.round((material.problems.correct / material.problems.done) * 100)
      : 0;

  return (
    <Link
      href={`/dashboard/study/${courseSlug}/${material.id}`}
      className="group flex items-baseline gap-4 rounded-xl border border-[var(--color-line)] px-5 py-4 transition-all duration-[var(--duration-base)] hover:-translate-y-px hover:border-[var(--color-line-strong)] hover:shadow-[var(--shadow-soft)]"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h3 className="truncate text-[14.5px] wght-560 kerning-tight text-[var(--color-fg-strong)] sm:text-[15px]">
            {material.title}
          </h3>
          {fresh && (
            <span className="shrink-0 text-[9.5px] wght-700 kerning-mono uppercase text-[var(--color-accent)]">
              아직 안 풂
            </span>
          )}
          {finished && (
            <span className="shrink-0 text-[9.5px] wght-700 kerning-mono uppercase text-[var(--color-success)]">
              완료
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11.5px] wght-450 kerning-tight tabular-nums text-[var(--color-fg-subtle)]">
          <span>{material.pages}p</span>
          <span className="text-[var(--color-line-strong)]">·</span>
          <span>{material.uploaded}</span>
          {material.problems.total > 0 && (
            <>
              <span className="text-[var(--color-line-strong)]">·</span>
              <span>
                {material.problems.done}/{material.problems.total} 풂
              </span>
              {acc > 0 && (
                <>
                  <span className="text-[var(--color-line-strong)]">·</span>
                  <span>정답률 {acc}%</span>
                </>
              )}
            </>
          )}
        </div>
        {material.oneLine && (
          <p className="mt-1 line-clamp-2 text-[12.5px] leading-[1.55] kerning-tight wght-450 text-[var(--color-fg-muted)] sm:text-[13px]">
            {material.oneLine}
          </p>
        )}
      </div>

      <Arrow className="reveal-right shrink-0 self-baseline text-[12px] text-[var(--color-fg-subtle)]" />
    </Link>
  );
}

/* ─────────── Overview — 이번 학기 한눈에 ─────────── */

function Overview({ course, className }: { course: Course; className?: string }) {
  const hasKeywords = course.keywords && course.keywords.length > 0;
  const hasConcepts = course.topConcepts && course.topConcepts.length > 0;

  // "한 번 더 볼만해요" — 정답률 낮은 자료 1~2개. 풀이 없거나 정답률 50% 미만
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
      <h2 className="text-[12px] wght-560 kerning-mono uppercase text-[var(--color-fg-subtle)]">
        이번 학기 · 한눈에
      </h2>

      <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-7 md:grid-cols-2">
        {/* 키워드 */}
        {hasKeywords && (
          <div>
            <h3 className="text-[10.5px] wght-700 kerning-mono uppercase text-[var(--color-fg-subtle)]">
              자주 나온 키워드
            </h3>
            <ul className="mt-3 flex flex-wrap gap-x-1.5 gap-y-1.5">
              {course.keywords!.slice(0, 10).map((k) => (
                <li key={k.name}>
                  <Keyword name={k.name} count={k.count} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Top 개념 */}
        {hasConcepts && (
          <div>
            <h3 className="text-[10.5px] wght-700 kerning-mono uppercase text-[var(--color-fg-subtle)]">
              교수님이 강조한 개념
            </h3>
            <ul className="mt-3 flex flex-col gap-2.5">
              {course.topConcepts!.map((c) => (
                <li key={c.name}>
                  <Concept name={c.name} mentions={c.mentions} materials={c.materials} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 한 번 더 볼만해요 — 격려형 */}
      {weak.length > 0 && (
        <div className="mt-7 rounded-xl bg-[var(--color-surface)] p-4 sm:p-5">
          <h3 className="text-[10.5px] wght-700 kerning-mono uppercase text-[var(--color-fg-subtle)]">
            한 번 더 볼만해요
          </h3>
          <ul className="mt-3 flex flex-col gap-2">
            {weak.map(({ m, acc }) => (
              <li key={m.id}>
                <Link
                  href={`/dashboard/study/${course.slug}/${m.id}`}
                  className="group flex items-baseline justify-between gap-3 rounded-md px-1 py-1 transition-colors hover:bg-[var(--color-surface-strong)]"
                >
                  <span className="truncate text-[13px] wght-500 kerning-tight text-[var(--color-fg)] group-hover:text-[var(--color-fg-strong)]">
                    {m.title}
                  </span>
                  <span className="shrink-0 text-[11px] wght-450 kerning-tight tabular-nums text-[var(--color-fg-muted)]">
                    정답률 {Math.round(acc * 100)}%{" "}
                    <span className="ml-1 text-[var(--color-fg-subtle)] transition-transform group-hover:translate-x-0.5">
                      →
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
  // 빈도에 따라 글자 굵기·크기 살짝 변동 — 클라우드 느낌
  const tier = count >= 18 ? "lg" : count >= 12 ? "md" : "sm";
  const cls =
    tier === "lg"
      ? "text-[13.5px] wght-700 text-[var(--color-fg-strong)]"
      : tier === "md"
        ? "text-[13px] wght-560 text-[var(--color-fg)]"
        : "text-[12.5px] wght-500 text-[var(--color-fg-muted)]";
  return (
    <span
      className={`inline-flex items-baseline gap-1 rounded-full border border-[var(--color-line)] px-2.5 py-1 kerning-tight ${cls}`}
    >
      {name}
      <span className="text-[10px] wght-450 kerning-mono tabular-nums text-[var(--color-fg-subtle)]">
        {count}
      </span>
    </span>
  );
}

function Concept({
  name,
  mentions,
  materials,
}: {
  name: string;
  mentions: number;
  materials: number;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span aria-hidden className="shrink-0 text-[14px] wght-700 text-[var(--color-fg-disabled)]">
        ·
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] wght-500 kerning-tight text-[var(--color-fg)] sm:text-[13.5px]">
          {name}
        </span>
        <span className="text-[10.5px] wght-450 kerning-tight tabular-nums text-[var(--color-fg-subtle)]">
          {mentions}회 언급 · 자료 {materials}개
        </span>
      </div>
    </div>
  );
}
