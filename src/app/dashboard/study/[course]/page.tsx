import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tryGetOwnerId } from "@/lib/auth";
import { getCourseByName, listCoursesWithMaterialCount } from "@/lib/data/materials";
import { MaterialsGrid } from "./materials-grid";
import { UploadZone } from "./upload-zone";

export const dynamic = "force-dynamic";

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ course: string }>;
}) {
  const { course: courseParam } = await params;
  const courseName = decodeURIComponent(courseParam);

  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  const [course, allCourses] = await Promise.all([
    getCourseByName({ ownerId, name: courseName }),
    listCoursesWithMaterialCount({ ownerId }),
  ]);
  if (!course) notFound();

  const dotColor = course.color ?? "#7aa6d6";
  // 자료 이동 셀렉트용 — 현재 강의 제외
  const moveTargets = allCourses
    .filter((c) => c.id !== course.id)
    .map((c) => ({ id: c.id, name: c.name }));

  return (
    <div>
      <div className="mx-auto w-full max-w-[1080px] px-6 pb-24 pt-8 sm:px-10 sm:pb-28 sm:pt-12 md:px-12">
        <Breadcrumb courseName={course.name} dotColor={dotColor} />
        <Hero course={course} dotColor={dotColor} />

        <Materials course={course} dotColor={dotColor} moveTargets={moveTargets} currentCourseId={course.id} className="mt-14 fade-up fade-up-3 sm:mt-16" />

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

function Breadcrumb({ courseName, dotColor }: { courseName: string; dotColor: string }) {
  return (
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
      <span className="wght-560" style={{ color: dotColor }}>
        {courseName}
      </span>
    </nav>
  );
}

function Hero({
  course,
  dotColor,
}: {
  course: NonNullable<Awaited<ReturnType<typeof getCourseByName>>>;
  dotColor: string;
}) {
  return (
    <header className="mt-10 fade-up fade-up-1 sm:mt-14">
      <p
        className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {course.professor ?? "교수 미정"}
        {course.location && ` · ${course.location}`}
      </p>
      <h1
        className="mt-3 text-[40px] leading-[1.05] wght-620 text-[var(--color-apple-ink)] sm:text-[56px] md:text-[64px]"
        style={{ letterSpacing: "-0.012em", color: dotColor }}
      >
        {course.name}.
      </h1>

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
        {course.schedule && course.schedule.length > 0 && (
          <>
            <span className="text-[var(--color-apple-hairline)]">·</span>
            <span>{course.schedule.join(", ")}</span>
          </>
        )}
      </div>
    </header>
  );
}

function Materials({
  course,
  dotColor,
  className,
  moveTargets,
  currentCourseId,
}: {
  course: NonNullable<Awaited<ReturnType<typeof getCourseByName>>>;
  dotColor: string;
  className?: string;
  moveTargets: { id: string; name: string }[];
  currentCourseId: string;
}) {
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

      <MaterialsGrid
        courseName={course.name}
        materials={course.materials.map((m) => ({
          id: m.id,
          title: m.title,
          type: m.type,
          pageCount: m.pageCount,
          uploadedAt: m.uploadedAt,
          hasSummary: m.hasSummary,
        }))}
        dotColor={dotColor}
        moveTargets={moveTargets}
        currentCourseId={currentCourseId}
      />
    </section>
  );
}

