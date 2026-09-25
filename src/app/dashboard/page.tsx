import { ArrowUpRight, BarChart3, CalendarPlus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  academicTermKey,
  academicTermLabel,
  calculateGpa,
  compareAcademicTerms,
  inferAcademicTerm,
  isCourseInTerm,
  parseAcademicTermKey,
  recentAcademicTerms,
  type SemesterTerm,
} from "@/lib/academic";
import { tryGetOwnerId } from "@/lib/auth";
import { listUpcomingEvents } from "@/lib/data/events";
import { listCoursesGrouped } from "@/lib/data/materials";
import { getProfile } from "@/lib/data/profile";
import { getSemesterSafetySnapshot } from "@/lib/data/semester-safety";
import { buildTimetable } from "@/lib/timetable-grid";
import styles from "./campus.module.css";
import { DashboardClient } from "./dashboard-client";
import { SemesterSwitcher } from "./semester-switcher";

export const dynamic = "force-dynamic";

/** Fit registered timetables to the workspace; let first-use guidance scroll naturally. */
export default async function DashboardHomePage({
  searchParams,
}: {
  searchParams: Promise<{ term?: string }>;
}) {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  const [profile, grouped, upcoming, safety] = await Promise.all([
    getProfile(ownerId),
    listCoursesGrouped({ ownerId }),
    listUpcomingEvents({ ownerId, limit: 6 }),
    getSemesterSafetySnapshot(ownerId),
  ]);

  const inferred = inferAcademicTerm();
  const requested = parseAcademicTermKey((await searchParams).term);
  const selected = requested ?? inferred;
  const selectedKey = academicTermKey(selected.year, selected.term);
  const semesterCourses = grouped.semester.filter((course) =>
    isCourseInTerm(course, selected.year, selected.term),
  );
  const termMap = new Map<string, { year: number; term: SemesterTerm }>();
  for (const value of [...recentAcademicTerms(), inferred, selected]) {
    termMap.set(academicTermKey(value.year, value.term), value);
  }
  for (const course of grouped.semester) {
    if (!course.semesterYear || !course.semesterTerm) continue;
    const value = { year: course.semesterYear, term: course.semesterTerm };
    termMap.set(academicTermKey(value.year, value.term), value);
  }
  const terms = [...termMap.values()].sort(compareAcademicTerms);
  const visibleCourses = [...semesterCourses, ...grouped.personal];
  const hasTimetable = buildTimetable(semesterCourses).slots.length > 0;
  const semesterGpa = calculateGpa(semesterCourses);
  const cumulativeGpa = calculateGpa(grouped.semester);

  return (
    <div className={`${styles.page} ${hasTimetable ? styles.fittedPage : ""}`}>
      <div className={styles.container}>
        <TopChrome terms={terms} selectedKey={selectedKey} hasCourses={hasTimetable} />
        <div className={`flex min-h-0 flex-1 flex-col ${hasTimetable ? "sm:overflow-hidden" : ""}`}>
          <DashboardClient
            initialNow={new Date().toISOString()}
            courses={visibleCourses}
            hasTimetable={hasTimetable}
            studentName={profile?.displayName ?? null}
            signals={safety.signals}
            events={upcoming}
            semesterGpa={semesterGpa}
            cumulativeGpa={cumulativeGpa}
            semesterLabel={academicTermLabel(selected.year, selected.term)}
          />
        </div>
      </div>
    </div>
  );
}

/* 상단 chrome — 학기 + 시간표 업로드 진입. */
function TopChrome({
  terms,
  selectedKey,
  hasCourses,
}: {
  terms: Array<{ year: number; term: SemesterTerm }>;
  selectedKey: string;
  hasCourses: boolean;
}) {
  return (
    <header className={styles.topline}>
      <SemesterSwitcher terms={terms} selectedKey={selectedKey} />
      <div className={styles.topActions}>
        <Link href="/dashboard/today" className={styles.todayLink}>
          오늘 할 일 <ArrowUpRight size={14} aria-hidden />
        </Link>
        <Link href={`/dashboard/grades?term=${selectedKey}`} className={styles.todayLink}>
          <BarChart3 size={14} aria-hidden /> 성적
        </Link>
        <Link
          href={`/dashboard/calendar/import?kind=timetable&term=${selectedKey}`}
          className={styles.editTimetable}
        >
          <CalendarPlus size={15} aria-hidden />
          {hasCourses ? "시간표 수정" : "시간표 등록"}
        </Link>
      </div>
    </header>
  );
}
