import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tryGetOwnerId } from "@/lib/auth";
import { getCourseByName } from "@/lib/data/materials";
import { UploadZone } from "./upload-zone";

export const dynamic = "force-dynamic";

const TYPE_LABEL = {
  lecture: "강의",
  assignment: "과제",
  exam: "시험",
  team: "팀플",
  syllabus: "강의계획서",
  notice: "공지",
} as const;

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ course: string }>;
}) {
  const { course: courseParam } = await params;
  const courseName = decodeURIComponent(courseParam);

  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  const course = await getCourseByName({ ownerId, name: courseName });
  if (!course) notFound();

  const dotColor = course.color ?? "#7aa6d6";

  return (
    <div>
      <div className="mx-auto w-full max-w-[1080px] px-6 pb-24 pt-8 sm:px-10 sm:pb-28 sm:pt-12 md:px-12">
        <Breadcrumb courseName={course.name} dotColor={dotColor} />
        <Hero course={course} dotColor={dotColor} />

        <Materials course={course} dotColor={dotColor} className="mt-14 fade-up fade-up-3 sm:mt-16" />

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
}: {
  course: NonNullable<Awaited<ReturnType<typeof getCourseByName>>>;
  dotColor: string;
  className?: string;
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

      {course.materials.length === 0 ? (
        <div className="elev-1 mt-6 rounded-[18px] bg-white px-7 py-12 text-center sm:py-16">
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
            아래에서 PDF·HWPX·PPTX·이미지를 끌어다 놓으면 60초 안에 요약과 첫 문제가 만들어져요.
          </p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {course.materials.map((m) => (
            <li key={m.id}>
              <Link
                href={`/dashboard/study/${encodeURIComponent(course.name)}/${m.id}`}
                className="group flex h-full flex-col rounded-[12px] bg-white p-6 transition-transform duration-200 hover:-translate-y-0.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-[11px] wght-560 uppercase tracking-[0.06em]"
                    style={{ color: dotColor }}
                  >
                    {TYPE_LABEL[m.type]}
                    {m.hasSummary ? " · 요약 OK" : ""}
                  </span>
                  <span
                    className="text-[11px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
                    style={{ letterSpacing: "-0.012em" }}
                  >
                    {m.pageCount != null ? `${m.pageCount}쪽` : ""}
                  </span>
                </div>

                <h3
                  className="mt-3 text-[16px] leading-[1.3] wght-560 text-[var(--color-apple-ink)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  {m.title}
                </h3>

                <div className="mt-auto pt-5 flex items-center justify-between">
                  <span
                    className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
                    style={{ letterSpacing: "-0.012em" }}
                  >
                    {formatRelative(m.uploadedAt)}
                  </span>
                  <span className="text-[14px] text-[var(--color-apple-muted)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--color-apple-action)]">
                    ›
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const min = Math.round(diff / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}일 전`;
  const mon = Math.round(day / 30);
  return `${mon}개월 전`;
}
