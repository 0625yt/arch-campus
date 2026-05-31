import Link from "next/link";
import { redirect } from "next/navigation";
import { AppleShell } from "@/components/apple-shell";
import { activityColor } from "@/lib/activity-color";
import { tryGetOwnerId } from "@/lib/auth";
import { courseGradient, courseTint } from "@/lib/course-palette";
import { type Activity, getRecentActivities } from "@/lib/data/activity";
import { type CourseListItem, listCoursesGrouped } from "@/lib/data/materials";
import { AddPersonalButton } from "./add-personal-button";
import { CourseActionsMenu } from "./course-actions-menu";
import { CourseContextWrapper } from "./course-context-wrapper";

export const dynamic = "force-dynamic";

export default async function StudyIndexPage() {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  const [grouped, recent] = await Promise.all([
    listCoursesGrouped({ ownerId }),
    getRecentActivities({ ownerId, limit: 6 }),
  ]);
  const totalCount = grouped.semester.length + grouped.personal.length;
  const totalMaterials =
    grouped.semester.reduce((a, c) => a + c.materialCount, 0) +
    grouped.personal.reduce((a, c) => a + c.materialCount, 0);

  return (
    <div>
      <AppleShell>
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
          >
            <span className="border-b border-transparent group-hover:border-[var(--color-apple-action)]">
              내 캠퍼스
            </span>
            <span className="ml-0.5">›</span>
          </Link>
        </header>

        {totalCount === 0 ? (
          <EmptyCourses className="mt-10 fade-up fade-up-1 sm:mt-14" />
        ) : (
          <>
            <Hero courseCount={totalCount} totalMaterials={totalMaterials} />

            <SemesterSection
              courses={grouped.semester}
              className="mt-6 fade-up fade-up-2 sm:mt-8"
            />

            <PersonalSection
              courses={grouped.personal}
              className="mt-6 fade-up fade-up-3 sm:mt-8"
            />
          </>
        )}

        {recent.length > 0 && (
          <RecentActivity activities={recent} className="mt-6 fade-up fade-up-4 sm:mt-8" />
        )}
      </AppleShell>
    </div>
  );
}

function Hero({ courseCount, totalMaterials }: { courseCount: number; totalMaterials: number }) {
  return (
    <header className="mt-6 fade-up fade-up-1 sm:mt-8">
      <h1
        className="max-w-[820px] text-[28px] leading-[1.08] wght-700 text-[var(--color-apple-ink)] sm:text-[36px] md:text-[42px]"
        style={{ letterSpacing: "-0.022em" }}
      >
        이번 학기, <span className="text-[var(--color-apple-muted)]">{courseCount}개 강의</span>
      </h1>
      <p
        className="mt-2 max-w-[600px] text-[13.5px] leading-[1.55] wght-450 text-[var(--color-apple-muted)] sm:text-[14.5px]"
        style={{ letterSpacing: "-0.012em" }}
      >
        자료 {totalMaterials}개 등록
      </p>
    </header>
  );
}

function EmptyCourses({ className }: { className?: string }) {
  return (
    <section className={className}>
      <div className="elev-1 rounded-[18px] bg-white px-7 py-16 text-center sm:py-20">
        <p
          className="text-[24px] wght-620 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          아직 공부 주제가 없어요
        </p>
        <p className="mx-auto mt-3 max-w-[460px] text-[14px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]">
          시간표 한 장이면 한 학기 정규 강의가 한 번에 등록. 자격증·시험 같은 개인 공부는 따로
          주제를 만들어 같은 흐름으로 진행 가능.
        </p>
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/dashboard/calendar/import"
            className="inline-flex h-[44px] items-center rounded-full bg-[var(--color-apple-action)] px-6 text-[14px] wght-560 text-white transition-all hover:bg-[var(--color-apple-action-hover)]"
          >
            시간표 등록 →
          </Link>
          <AddPersonalButton variant="ghost" />
        </div>
      </div>
    </section>
  );
}

function SemesterSection({
  courses,
  className,
}: {
  courses: CourseListItem[];
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2
          className="text-[17px] leading-[1.2] wght-700 text-[var(--color-apple-ink)] sm:text-[19px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          과목 폴더{" "}
          <span className="ml-1 text-[12px] wght-450 text-[var(--color-apple-muted)]">
            {courses.length > 0 ? `· ${courses.length}개 정규 강의` : "· 이번 학기"}
          </span>
        </h2>
        <Link
          href="/dashboard/calendar/import"
          className="text-[12px] wght-560 text-[var(--color-apple-action)] hover:underline"
          style={{ letterSpacing: "-0.012em" }}
        >
          시간표 다시 올리기 ›
        </Link>
      </div>

      {courses.length === 0 ? (
        <SemesterEmpty className="mt-4" />
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:gap-3.5">
          {courses.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
      )}
    </section>
  );
}

function SemesterEmpty({ className }: { className?: string }) {
  return (
    <div
      className={`rounded-[18px] border border-dashed border-[var(--color-apple-hairline)] bg-white px-6 py-8 text-center ${className ?? ""}`}
    >
      <p className="text-[14px] wght-560 text-[var(--color-apple-ink)]">
        이번 학기 강의가 비어있어요
      </p>
      <p className="mx-auto mt-2 max-w-[400px] text-[12.5px] wght-450 leading-[1.6] text-[var(--color-apple-muted)]">
        시간표 한 장 올리면 강의가 한 번에 들어가요.
      </p>
      <Link
        href="/dashboard/calendar/import"
        className="mt-5 inline-flex h-[36px] items-center rounded-full bg-[var(--color-apple-ink)] px-4 text-[12.5px] wght-560 text-white hover:opacity-90"
      >
        시간표 등록 →
      </Link>
    </div>
  );
}

function PersonalSection({
  courses,
  className,
}: {
  courses: CourseListItem[];
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2
          className="text-[17px] leading-[1.2] wght-700 text-[var(--color-apple-ink)] sm:text-[19px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          자격증·시험·개인 공부{" "}
          {courses.length > 0 && (
            <span className="ml-1 text-[12px] wght-450 text-[var(--color-apple-muted)]">
              · {courses.length}개
            </span>
          )}
        </h2>
        <AddPersonalButton variant="ghost" />
      </div>

      {courses.length === 0 ? (
        <PersonalEmpty className="mt-4" />
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:gap-3.5">
          {courses.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
      )}
    </section>
  );
}

function PersonalEmpty({ className }: { className?: string }) {
  return (
    <div
      className={`rounded-[18px] border border-dashed border-[var(--color-apple-hairline)] bg-white px-6 py-8 text-center ${className ?? ""}`}
    >
      <p className="text-[14px] wght-560 text-[var(--color-apple-ink)]">
        시간표에 없는 공부를 따로 관리해요
      </p>
      <p className="mx-auto mt-2 max-w-[420px] text-[12.5px] wght-450 leading-[1.6] text-[var(--color-apple-muted)]">
        정보처리기사·TOEIC·공무원·개인 프로젝트 — 무엇이든 주제로 만들면 자료 업로드·문제·복습이
        같은 방식으로 동작해요.
      </p>
      <div className="mt-5 inline-block">
        <AddPersonalButton />
      </div>
    </div>
  );
}

function CourseCard({ course }: { course: CourseListItem }) {
  const isPersonal = course.category === "personal";
  // 시간표 셀과 동일한 파스텔 팔레트 — 강의명 해시로 안정 매핑.
  // 라이트 톤 RGB라 alpha 0.42여도 산뜻 (애플 Calendar 톤).
  const cardTint = courseTint(course.name, course.color);
  const hoverGrad = courseGradient(course.name, course.color);

  return (
    <CourseContextWrapper
      courseId={course.id}
      initialName={course.name}
      initialProfessor={course.professor}
      initialColor={course.color}
      isPersonal={isPersonal}
    >
      <div className="relative">
        <div className="absolute right-3 top-3 z-20">
          <CourseActionsMenu
            courseId={course.id}
            initialName={course.name}
            initialProfessor={course.professor}
            initialColor={course.color}
            isPersonal={isPersonal}
          />
        </div>
        <Link
          href={`/dashboard/study/${encodeURIComponent(course.name)}`}
          className="group card-glow-ribbon dark-surface-card elev-hover-2 spring-press relative flex min-h-[140px] flex-col justify-between overflow-hidden rounded-[14px] bg-white p-5 sm:p-5"
          style={{ backgroundColor: cardTint }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{ background: hoverGrad }}
          />

          <div className="relative pr-8">
            <span
              className="text-[11px] wght-620 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]"
            >
              {isPersonal ? "개인 공부" : (course.professor ?? "교수 미정")}
            </span>
            <h3
              className="mt-2 text-[20px] leading-[1.1] wght-700 text-[var(--color-apple-ink)] sm:text-[22px]"
              style={{ letterSpacing: "-0.018em" }}
            >
              {course.name}
            </h3>
          </div>

          <div className="relative mt-4 flex items-baseline justify-between">
            <span
              className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              자료{" "}
              <span className="tabular-nums wght-620 text-[var(--color-apple-ink)]">
                {course.materialCount}
              </span>
              개
            </span>
            <span className="text-[13px] text-[var(--color-apple-muted)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--color-apple-action)]">
              ›
            </span>
          </div>
        </Link>
      </div>
    </CourseContextWrapper>
  );
}

function RecentActivity({ activities, className }: { activities: Activity[]; className?: string }) {
  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2
          className="text-[17px] leading-[1.2] wght-700 text-[var(--color-apple-ink)] sm:text-[19px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          최근 활동
        </h2>
        <Link
          href="/dashboard/history"
          className="group inline-flex items-baseline text-[12.5px] wght-560 text-[var(--color-apple-action)]"
        >
          <span className="border-b border-transparent group-hover:border-[var(--color-apple-action)]">
            전체 기록
          </span>
          <span className="ml-0.5">›</span>
        </Link>
      </div>

      <ul className="mt-4 overflow-hidden rounded-[10px] border border-[var(--color-apple-hairline)] bg-white">
        {activities.map((a, idx) => {
          const accent = activityColor(a.kind);
          return (
            <li
              key={a.id}
              className={
                idx !== activities.length - 1
                  ? "border-b border-[var(--color-apple-hairline-soft)]"
                  : ""
              }
            >
              <Link
                href={a.href}
                className="group relative grid grid-cols-[60px_1fr_auto] items-center gap-4 px-5 py-[18px] transition-colors hover:bg-[var(--color-apple-pearl)] sm:grid-cols-[72px_1fr_auto] sm:gap-5 sm:px-7"
              >
                <span
                  className="text-[11px] wght-620 uppercase tabular-nums"
                  style={{ letterSpacing: "0.06em", color: accent }}
                >
                  {a.kindLabel}
                </span>
                <span className="min-w-0">
                  <span
                    className="block truncate text-[14px] wght-560 text-[var(--color-apple-ink)]"
                    style={{ letterSpacing: "-0.012em" }}
                  >
                    {a.title}
                  </span>
                  {a.detail && (
                    <span className="mt-1 block truncate text-[12px] wght-450 text-[var(--color-apple-muted)]">
                      {a.detail}
                    </span>
                  )}
                </span>
                <span className="text-[15px] text-[var(--color-apple-muted)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--color-apple-action)]">
                  ›
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
