import Link from "next/link";
import { Arrow, Dot } from "@/components/primitives";
import {
  PageShell,
  PageHint,
  PageTitle,
  MetaLine,
  PageFooter,
  EmptyState,
} from "@/components/page-shell";
import { COURSES, COURSE_COLOR, type Course } from "./data";

export default function StudyIndexPage() {
  const totalMaterials = COURSES.reduce((acc, c) => acc + c.materials.length, 0);
  const totalProblems = COURSES.reduce(
    (acc, c) => acc + c.materials.reduce((sum, m) => sum + m.problems.done, 0),
    0,
  );

  return (
    <PageShell width="md">
      <PageHint>강의를 골라 자료를 올리면 요약·문제가 만들어져요</PageHint>

      <PageTitle className="mt-6">강의</PageTitle>

      <MetaLine className="mt-2 fade-up fade-up-1">
        <span>
          <span className="tabular-nums text-[var(--color-fg)]">
            {COURSES.length}
          </span>
          개
        </span>
        <span>
          자료{" "}
          <span className="tabular-nums text-[var(--color-fg)]">
            {totalMaterials}
          </span>
        </span>
        <span>
          이번 주 푼 문제{" "}
          <span className="tabular-nums text-[var(--color-fg)]">
            {totalProblems}
          </span>
        </span>
      </MetaLine>

      {/* 강의 리스트 — 빈 상태 분기 */}
      {COURSES.length === 0 ? (
        <EmptyState
          className="mt-10 fade-up fade-up-2"
          title="아직 등록된 강의가 없어요"
          hint="강의계획서 PDF를 한 장 올리면 강의·시험·과제 일정이 한 번에 정리돼요. 직접 강의를 추가해도 괜찮아요."
          action={
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
              <Link
                href="/dashboard/calendar"
                className="group inline-flex items-baseline gap-1.5 text-[14px] wght-560 kerning-tight text-[var(--color-accent)] hover:text-[var(--color-accent-strong)]"
              >
                <span className="border-b border-[var(--color-accent)]/40 pb-px group-hover:border-[var(--color-accent-strong)]">
                  강의계획서 올리기
                </span>
                <Arrow className="text-[14px] transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="#"
                className="text-[12.5px] wght-450 kerning-tight text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
              >
                직접 추가
              </Link>
            </div>
          }
        />
      ) : (
        <>
          <ul className="mt-10 flex flex-col gap-2 fade-up fade-up-2">
            {COURSES.map((c) => (
              <li key={c.slug}>
                <CourseCard course={c} />
              </li>
            ))}
          </ul>

          {/* 새 강의 */}
          <Link
            href="#"
            className="group mt-3 flex items-center justify-between gap-3 rounded-xl border border-dashed border-[var(--color-line-strong)] px-5 py-4 transition-colors duration-[var(--duration-base)] hover:bg-[var(--color-surface)] fade-up fade-up-3"
          >
            <span className="text-[13.5px] wght-500 kerning-tight text-[var(--color-fg-muted)] group-hover:text-[var(--color-fg)]">
              + 새 강의 추가
            </span>
            <span className="text-[11px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
              강의계획서 PDF로 한 번에
            </span>
          </Link>
        </>
      )}

      <PageFooter>모든 자료는 본인만 볼 수 있고, 학습 보조용이에요.</PageFooter>
    </PageShell>
  );
}

function CourseCard({ course }: { course: Course }) {
  const total = course.materials.reduce((sum, m) => sum + m.problems.total, 0);
  const done = course.materials.reduce((sum, m) => sum + m.problems.done, 0);
  const correct = course.materials.reduce(
    (sum, m) => sum + m.problems.correct,
    0,
  );
  const acc = done > 0 ? Math.round((correct / done) * 100) : 0;
  const fresh = course.materials.some((m) => m.problems.done === 0);

  return (
    <Link
      href={`/dashboard/study/${course.slug}`}
      className="group flex items-baseline gap-4 rounded-xl border border-[var(--color-line)] bg-[var(--color-bg)] px-5 py-4 transition-all duration-[var(--duration-base)] hover:-translate-y-px hover:border-[var(--color-line-strong)] hover:shadow-[var(--shadow-soft)]"
    >
      <Dot color={COURSE_COLOR[course.slug]} size={6} className="translate-y-[-1px]" />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <h3 className="truncate text-[15.5px] wght-700 kerning-tight text-[var(--color-fg-strong)] sm:text-[16px]">
            {course.slug}
          </h3>
          {fresh && (
            <span className="shrink-0 text-[9.5px] wght-700 kerning-mono uppercase text-[var(--color-accent)]">
              새 자료
            </span>
          )}
        </div>
        <p className="truncate text-[12px] wght-450 kerning-tight text-[var(--color-fg-muted)]">
          {course.professor} · {course.semester}
        </p>
      </div>

      <div className="hidden shrink-0 items-baseline gap-3 self-baseline text-[11px] wght-450 kerning-tight tabular-nums text-[var(--color-fg-subtle)] sm:flex">
        <span>
          자료 <span className="text-[var(--color-fg)]">{course.materials.length}</span>
        </span>
        <span className="text-[var(--color-line-strong)]">·</span>
        <span>
          문제{" "}
          <span className="text-[var(--color-fg)]">
            {done}/{total}
          </span>
        </span>
        {acc > 0 && (
          <>
            <span className="text-[var(--color-line-strong)]">·</span>
            <span>
              정답률 <span className="text-[var(--color-fg)]">{acc}%</span>
            </span>
          </>
        )}
      </div>

      <Arrow className="reveal-right text-[12px] text-[var(--color-fg-subtle)]" />
    </Link>
  );
}
