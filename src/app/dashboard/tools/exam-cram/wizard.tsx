"use client";

export interface CourseOption {
  id: string;
  name: string;
  color: string | null;
}

export interface MaterialOption {
  id: string;
  title: string;
  type: string;
  courseId: string | null;
  pageCount: number | null;
}

/**
 * 시험 벼락치기 위저드 — 진행 중 placeholder.
 * 비동기 작업 큐 작업 끝나면 실제 UI 채울 예정.
 */
export function ExamCramWizard({
  courses,
  materials,
}: {
  courses: CourseOption[];
  materials: MaterialOption[];
}) {
  return (
    <div className="rounded-[18px] bg-white p-8 sm:p-10">
      <p
        className="text-[14px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        강의 {courses.length}개 · 자료 {materials.length}건 준비됐어요.
      </p>
      <p
        className="mt-3 text-[14px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        시험 정보·남은 시간·약점을 입력하면 단원 우선순위와 시간 블록을 자동으로 잡아줘요. UI는 곧 채워질 예정입니다.
      </p>
    </div>
  );
}
