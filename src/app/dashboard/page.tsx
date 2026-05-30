import Link from "next/link";
import { redirect } from "next/navigation";
import { tryGetOwnerId } from "@/lib/auth";
import { listUpcomingEvents } from "@/lib/data/events";
import { listCoursesGrouped } from "@/lib/data/materials";
import { getProfile } from "@/lib/data/profile";
import { getSemesterSafetySnapshot } from "@/lib/data/semester-safety";
import { inferSemester } from "@/lib/semester";
import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

/**
 * 내 캠퍼스 — 한 화면에 다 들어오는 hero.
 *
 * 구조:
 *   ┌─ TopChrome (학기 라벨 + 시간표 다시 올리기)
 *   ├─ DashboardClient
 *   │   ├─ TimetableHeading (이름 + 진행 중/다음 강의)
 *   │   ├─ TimetableHero (시간표 — 남은 공간 다)
 *   │   └─ BottomCards (긴급 / 다음 일정 / 강의 진척)
 *   └─ ─── (스크롤 없음)
 *
 * dashboard layout이 main을 overflow-y-auto로 잡고 있지만,
 * 우리는 페이지 내부에서 h-full + overflow-hidden으로 fix.
 */
export default async function DashboardHomePage() {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  const [profile, grouped, upcoming, safety] = await Promise.all([
    getProfile(ownerId),
    listCoursesGrouped({ ownerId }),
    listUpcomingEvents({ ownerId, limit: 6 }),
    getSemesterSafetySnapshot(ownerId),
  ]);

  const semester = inferSemester();
  const allCourses = [...grouped.semester, ...grouped.personal];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mx-auto flex w-full min-h-0 max-w-[1440px] flex-1 flex-col gap-3 px-5 pt-4 pb-4 sm:gap-4 sm:px-8 sm:pt-6 sm:pb-5 md:px-10 xl:px-14">
        <TopChrome semesterLabel={semester.label} />
        <div className="flex min-h-0 flex-1 flex-col">
          <DashboardClient
            courses={allCourses}
            studentName={profile?.displayName ?? null}
            signals={safety.signals}
            events={upcoming}
          />
        </div>
      </div>
    </div>
  );
}

/* 상단 chrome — 학기 + 시간표 업로드 진입. */
function TopChrome({ semesterLabel }: { semesterLabel: string }) {
  return (
    <header className="fade-up flex items-center justify-between gap-3">
      <p
        className="text-[11px] wght-700 uppercase text-[var(--color-apple-action)]"
        style={{ letterSpacing: "0.08em" }}
      >
        {semesterLabel}
      </p>
      <Link
        href="/dashboard/calendar/import?kind=timetable"
        className="group spring-press inline-flex items-center gap-2 rounded-full bg-[var(--color-apple-ink)] px-4 py-2 text-[12.5px] wght-620 text-white shadow-[0_6px_18px_-8px_rgba(0,0,0,0.35)] transition-all hover:-translate-y-px hover:shadow-[0_10px_24px_-8px_rgba(0,0,0,0.4)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
          <title>시간표 수정</title>
          <path
            d="M8 11V3.5M8 3.5l-2.5 2.5M8 3.5l2.5 2.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M3 11.5v.5c0 .8.7 1.5 1.5 1.5h7c.8 0 1.5-.7 1.5-1.5v-.5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        시간표 수정
      </Link>
    </header>
  );
}
