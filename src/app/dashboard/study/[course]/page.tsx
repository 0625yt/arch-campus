import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tryGetOwnerId } from "@/lib/auth";
import { getCourseByName, listCoursesWithMaterialCount } from "@/lib/data/materials";
import { getCourseSafetyDetail, type RiskLevel } from "@/lib/data/semester-safety";
import { formatEventLabel } from "@/lib/format-event";
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
  const safety = await getCourseSafetyDetail(ownerId, course.id);

  const dotColor = course.color ?? "#7aa6d6";
  // 자료 이동 셀렉트용 — 현재 강의 제외
  const moveTargets = allCourses
    .filter((c) => c.id !== course.id)
    .map((c) => ({ id: c.id, name: c.name }));

  return (
    <div>
      <div className="mx-auto w-full max-w-[1200px] px-6 pb-24 pt-8 sm:px-10 sm:pb-28 sm:pt-12 md:px-12">
        <Breadcrumb courseName={course.name} dotColor={dotColor} />

        {/* 데스크톱: hero + safety panel 2-컬럼 한 화면. 모바일: 세로 적층 그대로. */}
        <div className="mt-10 grid gap-8 sm:mt-14 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
          <Hero course={course} dotColor={dotColor} safety={safety} />
          <CourseSafetyPanel
            course={course}
            safety={safety}
            className="fade-up fade-up-2"
          />
        </div>

        <Materials
          course={course}
          dotColor={dotColor}
          moveTargets={moveTargets}
          currentCourseId={course.id}
          className="mt-14 fade-up fade-up-3 sm:mt-16"
        />

        <section id="upload-zone" className="mt-14 fade-up fade-up-5 sm:mt-16">
          <h2
            className="text-[24px] leading-[1.1] wght-620 text-[var(--color-apple-ink)] sm:text-[28px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            새 자료 추가
          </h2>
          <p
            className="mt-3 text-[14px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.022em" }}
          >
            끌어다 놓거나 클릭해서 선택하면 60초 안에 요약과 첫 점검 문제가 준비됩니다.
          </p>
          <div className="mt-6">
            <UploadZone courseId={course.id} courseName={course.name} />
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
  safety,
}: {
  course: NonNullable<Awaited<ReturnType<typeof getCourseByName>>>;
  dotColor: string;
  safety: Awaited<ReturnType<typeof getCourseSafetyDetail>>;
}) {
  const tone = riskTone(safety.risk);
  return (
    <header className="fade-up fade-up-1">
      <p
        className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {course.professor ?? "교수 미정"}
        {course.location && ` · ${course.location}`}
      </p>
      <h1
        className="mt-3 text-[40px] leading-[1.05] wght-620 text-[var(--color-apple-ink)] sm:text-[56px] md:text-[60px]"
        style={{ letterSpacing: "-0.012em", color: dotColor }}
      >
        {course.name}
      </h1>

      <div
        className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-[14px] wght-450 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        <span
          className="rounded-full px-2.5 py-1 text-[11px] wght-700"
          style={{ backgroundColor: tone.bg, color: tone.fg, letterSpacing: "-0.012em" }}
        >
          {tone.label}
        </span>
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

function CourseSafetyPanel({
  course,
  safety,
  className,
}: {
  course: NonNullable<Awaited<ReturnType<typeof getCourseByName>>>;
  safety: Awaited<ReturnType<typeof getCourseSafetyDetail>>;
  className?: string;
}) {
  const tone = riskTone(safety.risk);
  const todayTask =
    safety.nextCritical != null
      ? `${formatEventLabel(safety.nextCritical)} 준비`
      : safety.unreadMaterials[0]
        ? `${safety.unreadMaterials[0].title} 정리`
        : safety.wrongCount > 0
          ? "오답만 다시 풀기"
          : "새 자료 넣기";

  return (
    <section className={className}>
      <div className="elev-1 h-full overflow-hidden rounded-[18px] bg-white">
        <div className="grid h-full gap-0 md:grid-cols-[0.9fr_1.1fr] lg:grid-cols-1 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="px-6 py-6 sm:px-7">
            <span
              className="inline-flex rounded-full px-2.5 py-1 text-[11px] wght-700"
              style={{ backgroundColor: tone.bg, color: tone.fg, letterSpacing: "-0.012em" }}
            >
              {tone.label}
            </span>
            <h2
              className="mt-4 text-[26px] leading-[1.12] wght-700 text-[var(--color-apple-ink)] sm:text-[34px]"
              style={{ letterSpacing: "-0.018em" }}
            >
              오늘은 {todayTask}
            </h2>
            <p
              className="mt-3 text-[13.5px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              이 과목에서 점수 손해로 이어질 수 있는 신호만 모았습니다.
            </p>
          </div>

          <div className="border-t border-[var(--color-apple-hairline-soft)] px-6 py-6 sm:px-7 md:border-l md:border-t-0 lg:border-l-0 lg:border-t xl:border-l xl:border-t-0">
            <ul className="grid gap-3 sm:grid-cols-3">
              <CourseMetric label="안 본 자료" value={safety.unreadMaterials.length} />
              <CourseMetric label="오답" value={safety.wrongCount} />
              <CourseMetric label="확인 필요" value={safety.unconfirmedCount} />
            </ul>
            <ul className="mt-5 flex flex-col gap-2">
              {safety.reasons.map((reason) => (
                <li
                  key={reason}
                  className="rounded-[10px] bg-[var(--color-apple-pearl)] px-4 py-3 text-[13px] wght-560 text-[var(--color-apple-ink)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  {reason}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href="#upload-zone"
                className="inline-flex h-[38px] items-center rounded-full bg-[var(--color-apple-ink)] px-4 text-[12.5px] wght-620 text-white"
                style={{ letterSpacing: "-0.012em" }}
              >
                자료 넣기
              </Link>
              <Link
                href="/dashboard/review"
                className="inline-flex h-[38px] items-center rounded-full bg-[var(--color-apple-pearl)] px-4 text-[12.5px] wght-620 text-[var(--color-apple-muted)] transition-colors hover:text-[var(--color-apple-ink)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                오답 보기
              </Link>
            </div>
          </div>
        </div>
      </div>
      {course.name && <span className="sr-only">{course.name} 과목 위험판</span>}
    </section>
  );
}

function CourseMetric({ label, value }: { label: string; value: number }) {
  return (
    <li className="rounded-[12px] bg-[var(--color-apple-pearl)] px-3 py-3">
      <p
        className="text-[10.5px] wght-620 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {label}
      </p>
      <p
        className="mt-1 text-[24px] wght-700 tabular-nums text-[var(--color-apple-ink)]"
        style={{ letterSpacing: "-0.022em" }}
      >
        {value}
      </p>
    </li>
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
          자료
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

function riskTone(risk: RiskLevel): { label: string; bg: string; fg: string } {
  if (risk === "danger") {
    return { label: "위험", bg: "var(--color-urgent-soft)", fg: "var(--color-urgent)" };
  }
  if (risk === "watch") {
    return { label: "주의", bg: "var(--color-tint-assign)", fg: "var(--color-tint-assign-ink)" };
  }
  return { label: "안전", bg: "var(--color-tint-class)", fg: "var(--color-tint-class-ink)" };
}
