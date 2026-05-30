"use client";

import { useState } from "react";
import type { EventView } from "@/lib/data/events";
import type { CourseListItem } from "@/lib/data/materials";
import type { SafetySignal } from "@/lib/data/semester-safety";
import { BottomCards } from "./bottom-cards";
import { CourseSheet } from "./course-sheet";
import { TimetableHeading, TimetableHero } from "./timetable-hero";

/**
 * Dashboard client wrapper — 한 화면 fit layout.
 *
 *   ┌─ heading row (~60px)
 *   ├─ timetable hero (flex-1, 남은 공간 다)
 *   └─ bottom cards 3개 (~100px)
 *
 * 모두 부모의 100% height를 flex로 나눠 가짐. 스크롤 없음.
 */
export function DashboardClient({
  courses,
  studentName,
  signals,
  events,
}: {
  courses: CourseListItem[];
  studentName: string | null;
  signals: SafetySignal[];
  events: EventView[];
}) {
  const [openCourse, setOpenCourse] = useState<CourseListItem | null>(null);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <TimetableHeading courses={courses} studentName={studentName} />
      <div className="fade-up fade-up-1 flex min-h-0 flex-1 flex-col">
        <TimetableHero courses={courses} onPickCourse={(c) => setOpenCourse(c)} />
      </div>
      <div className="fade-up fade-up-2">
        <BottomCards signals={signals} events={events} courses={courses} />
      </div>
      <CourseSheet course={openCourse} onClose={() => setOpenCourse(null)} />
    </div>
  );
}
