import { notFound } from "next/navigation";
import { GlobalTopbar } from "@/components/global-topbar";
import { MobileTabBar, MobileTopbar } from "@/components/mobile-nav";
import type { CourseListItem } from "@/lib/data/materials";
import { CalendarBoard } from "../../dashboard/calendar/calendar-board";
import styles from "../../dashboard/campus.module.css";
import { DashboardClient } from "../../dashboard/dashboard-client";
import { QuizResultView } from "../../dashboard/quiz/[quizId]/quiz-result-view";
import { GenerateButton } from "../../dashboard/study/[course]/[material]/generate-button";
import { ReplaceFailedMaterial } from "../../dashboard/study/[course]/[material]/replace-failed-material";
import { UploadZone } from "../../dashboard/study/[course]/upload-zone";
import { StudyWorkspace } from "../../dashboard/study/study-workspace";
import { TodayOverview } from "../../dashboard/today/today-overview";

export const dynamic = "force-dynamic";

const courses: CourseListItem[] = [
  {
    id: "preview-algorithms",
    name: "알고리즘 기초",
    professor: "한교수",
    color: "#8aa6c1",
    schedule: ["수 13:00-14:30"],
    location: "공학관 401",
    materialCount: 3,
    category: "semester",
    semesterYear: 2026,
    semesterTerm: "spring",
    credits: 3,
    grade: "A0",
  },
  {
    id: "preview-structures",
    name: "자료구조",
    professor: "김교수",
    color: "#7aa6d6",
    schedule: ["월 09:00-10:30", "수 09:00-10:30"],
    location: "공학관 302",
    materialCount: 4,
    category: "semester",
    semesterYear: 2026,
    semesterTerm: "fall",
    credits: 3,
    grade: "A+",
  },
  {
    id: "preview-design",
    name: "인터랙션 디자인",
    professor: "이교수",
    color: "#c7b28e",
    schedule: ["화 10:00-12:00", "목 10:00-12:00"],
    location: "디자인관 201",
    materialCount: 2,
    category: "semester",
    semesterYear: 2026,
    semesterTerm: "fall",
    credits: 3,
    grade: "B+",
  },
  {
    id: "preview-statistics",
    name: "확률과 통계",
    professor: "박교수",
    color: "#9ebbaf",
    schedule: ["월 13:00-14:30", "수 13:00-14:30"],
    location: "자연과학관 103",
    materialCount: 3,
    category: "semester",
    semesterYear: 2026,
    semesterTerm: "fall",
    credits: 3,
    grade: null,
  },
  {
    id: "preview-english",
    name: "대학 영어",
    professor: "최교수",
    color: "#b0a2c7",
    schedule: ["화 14:00-15:30", "금 10:00-11:30"],
    location: "인문관 205",
    materialCount: 1,
    category: "semester",
    semesterYear: 2026,
    semesterTerm: "fall",
    credits: 2,
    grade: "P",
  },
  {
    id: "preview-project",
    name: "캡스톤 프로젝트",
    professor: "정교수",
    color: "#ccaaae",
    schedule: ["목 14:00-17:00"],
    location: "공학관 501",
    materialCount: 0,
    category: "semester",
    semesterYear: 2026,
    semesterTerm: "fall",
    credits: 3,
    grade: null,
  },
];

/** UI fixtures with fictional IDs. Never served in production. */
export default async function CampusPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const view = (await searchParams).view;
  if (view === "calendar")
    return (
      <main className="mx-auto max-w-[1280px] p-4">
        <CalendarBoard
          monthEvents={[]}
          upcoming={[]}
          courses={[]}
          kindLabel={{
            exam: "시험",
            assignment: "과제",
            presentation: "발표",
            class: "수업",
            etc: "기타",
          }}
        />
      </main>
    );
  if (view === "study-generate")
    return (
      <main className="mx-auto max-w-[800px] px-6 py-12">
        <h1 className="mb-6 text-xl">개발용 시험 범위 연결 확인</h1>
        <GenerateButton
          courseSlug="00000000-0000-4000-8000-000000000010"
          materialId="00000000-0000-4000-8000-000000000020"
          materialTitle="3주차 강의"
          materialType="lecture"
          siblingMaterials={[
            { id: "00000000-0000-4000-8000-000000000021", title: "4주차 강의", type: "lecture" },
          ]}
        />
      </main>
    );
  if (view === "study-result")
    return (
      <main className="mx-auto max-w-[800px] px-6 py-12">
        <h1 className="mb-6 text-xl">개발용 공부 완료 연결 확인</h1>
        <QuizResultView
          title="개발용 개념 점검"
          score={0}
          total={1}
          watermark="개발용 예시 데이터"
          materialId="00000000-0000-4000-8000-000000000020"
          quizId="00000000-0000-4000-8000-000000000030"
          attemptId="00000000-0000-4000-8000-000000000040"
          questions={[
            {
              id: 1,
              kind: "short-answer",
              topic: "스택",
              stem: "스택의 처리 순서는?",
              choices: null,
              answer: "후입선출",
              submitted: "선입선출",
              correct: false,
              explanation: "마지막 입력을 먼저 꺼냅니다.",
              evidence: "스택은 후입선출 구조",
              evidencePage: 1,
            },
          ]}
        />
      </main>
    );
  if (view === "study" || view === "today") {
    return (
      <div className="flex h-screen-safe flex-col overflow-hidden">
        <GlobalTopbar />
        <MobileTopbar />
        <main data-dashboard-scroll className="dashboard-canvas flex-1 overflow-y-auto">
          {view === "study" ? (
            <StudyWorkspace
              courses={[
                ...courses,
                {
                  id: "preview-personal",
                  name: "정보처리기사",
                  professor: null,
                  color: "#7aa6d6",
                  schedule: null,
                  location: null,
                  materialCount: 2,
                  category: "personal",
                  semesterYear: null,
                  semesterTerm: null,
                  credits: null,
                  grade: null,
                },
              ]}
              recent={[
                {
                  id: "preview-activity",
                  kind: "summarize",
                  kindLabel: "요약",
                  title: "자료구조 · 스택과 큐",
                  detail: "핵심 개념을 다시 살펴보세요",
                  createdAt: "2026-09-10T00:00:00Z",
                  href: "/dashboard/study/자료구조",
                },
              ]}
            />
          ) : (
            <TodayOverview signals={[]} events={[]} />
          )}
        </main>
        <MobileTabBar />
      </div>
    );
  }
  if (view === "upload") {
    return (
      <main className="mx-auto max-w-[800px] px-6 py-12">
        <h1 className="mb-6 text-xl">개발용 업로드 복구 확인</h1>
        <UploadZone courseId="preview-course" />
      </main>
    );
  }
  if (view === "replace") {
    return (
      <main className="mx-auto max-w-[760px] px-6 py-12">
        <h1 className="mb-6 text-xl">개발용 실패 자료 교체 확인</h1>
        <ReplaceFailedMaterial
          materialId="11111111-1111-4111-8111-111111111111"
          courseId="22222222-2222-4222-8222-222222222222"
          courseRouteKey="22222222-2222-4222-8222-222222222222"
          title="운영체제 4주차"
          materialType="lecture"
        />
      </main>
    );
  }
  return (
    <div className="flex h-screen-safe flex-col overflow-hidden">
      <GlobalTopbar />
      <MobileTopbar />
      <main data-dashboard-scroll className="dashboard-canvas flex-1 overflow-y-auto">
        <div className={`${styles.page} ${styles.fittedPage}`}>
          <div className={styles.container}>
            <p className="text-[11px] text-[var(--color-apple-muted)]">
              개발용 화면 확인 · 예시 데이터
            </p>
            <div className="flex min-h-0 flex-1 flex-col sm:overflow-hidden">
              <DashboardClient
                initialNow={new Date().toISOString()}
                courses={courses}
                hasTimetable
                studentName="지민"
                signals={[]}
                events={[]}
                semesterGpa={{
                  gpa: 4.07,
                  registeredCredits: 14,
                  gradedCredits: 6,
                  earnedCredits: 8,
                  gradedCourseCount: 3,
                  totalCourseCount: 5,
                }}
                cumulativeGpa={{
                  gpa: 4.07,
                  registeredCredits: 14,
                  gradedCredits: 6,
                  earnedCredits: 8,
                  gradedCourseCount: 3,
                  totalCourseCount: 5,
                }}
                semesterLabel="2026년 2학기"
              />
            </div>
          </div>
        </div>
      </main>
      <MobileTabBar />
    </div>
  );
}
