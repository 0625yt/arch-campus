"use client";

import { useState } from "react";
import type { CourseListItem } from "@/lib/data/materials";
import { CourseSheet } from "./course-sheet";
import { TimetableHero } from "./timetable-hero";

/**
 * Dashboard client wrapper — 시간표 hero + course sheet state 관리.
 *
 * 서버 컴포넌트(page.tsx)가 데이터를 fetch해 props로 내려주고,
 * 여기서 시트 열기/닫기 인터랙션을 담당.
 */
export function DashboardClient({
  courses,
  studentName,
}: {
  courses: CourseListItem[];
  studentName: string | null;
}) {
  const [openCourse, setOpenCourse] = useState<CourseListItem | null>(null);

  return (
    <>
      <TimetableHero
        courses={courses}
        studentName={studentName}
        onPickCourse={(c) => setOpenCourse(c)}
      />
      <CourseSheet course={openCourse} onClose={() => setOpenCourse(null)} />
    </>
  );
}
