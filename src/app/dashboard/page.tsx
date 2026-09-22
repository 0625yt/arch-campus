import { ArrowUpRight, CalendarPlus, Sun } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { tryGetOwnerId } from "@/lib/auth";
import { listUpcomingEvents } from "@/lib/data/events";
import { listCoursesGrouped } from "@/lib/data/materials";
import { getProfile } from "@/lib/data/profile";
import { getSemesterSafetySnapshot } from "@/lib/data/semester-safety";
import { inferSemester } from "@/lib/semester";
import { buildTimetable } from "@/lib/timetable-grid";
import styles from "./campus.module.css";
import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

/** Fit registered timetables to the workspace; let first-use guidance scroll naturally. */
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
  const hasTimetable = buildTimetable(grouped.semester).slots.length > 0;

  return (
    <div className={`${styles.page} ${hasTimetable ? styles.fittedPage : ""}`}>
      <div className={styles.container}>
        <TopChrome semesterLabel={semester.label} hasCourses={hasTimetable} />
        <div className={`flex min-h-0 flex-1 flex-col ${hasTimetable ? "sm:overflow-hidden" : ""}`}>
          <DashboardClient
            initialNow={new Date().toISOString()}
            courses={allCourses}
            hasTimetable={hasTimetable}
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
function TopChrome({ semesterLabel, hasCourses }: { semesterLabel: string; hasCourses: boolean }) {
  return (
    <header className={styles.topline}>
      <p className={styles.semester}>
        <Sun size={15} aria-hidden />
        {semesterLabel}
      </p>
      <div className={styles.topActions}>
        <Link href="/dashboard/today" className={styles.todayLink}>
          오늘 할 일 <ArrowUpRight size={14} aria-hidden />
        </Link>
        <Link href="/dashboard/calendar/import?kind=timetable" className={styles.editTimetable}>
          <CalendarPlus size={15} aria-hidden />
          {hasCourses ? "시간표 수정" : "시간표 등록"}
        </Link>
      </div>
    </header>
  );
}
