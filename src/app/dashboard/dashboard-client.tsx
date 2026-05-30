"use client";

import { useState } from "react";
import type { EventView } from "@/lib/data/events";
import type { CourseListItem } from "@/lib/data/materials";
import type { SafetySignal } from "@/lib/data/semester-safety";
import { BottomCards } from "./bottom-cards";
import { CourseSheet } from "./course-sheet";
import { TimetableHeading, TimetableHero } from "./timetable-hero";
import { TimetableSideRail } from "./timetable-side-rail";

/**
 * Dashboard client wrapper — Apple Maps detail panel 톤.
 *
 *   ┌─ heading row
 *   ├─ ┌──────────────────────┬─────────────────┐
 *   │  │                      │                 │
 *   │  │   시간표 (lg: 2/3)    │  사이드 (1/3)    │
 *   │  │                      │  - 지금/다음     │
 *   │  │                      │  - 오늘 남은     │
 *   │  │                      │  - 다가오는 마감 │
 *   │  └──────────────────────┴─────────────────┘
 *   └─ 하단 3카드 (긴급·다음·진척)
 *
 * 모두 부모 h-full을 flex로 나눠 가짐. 스크롤 0.
 * lg 미만에선 사이드 숨김 — 시간표만 풀폭.
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

      {/* 메인 row — 시간표 + 사이드 */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="fade-up fade-up-1 flex min-h-0 min-w-0 flex-col">
          <TimetableHero
            courses={courses}
            onPickCourse={(c) => setOpenCourse(c)}
          />
        </div>
        <div className="hidden min-h-0 min-w-0 lg:block">
          <TimetableSideRail courses={courses} events={events} />
        </div>
      </div>

      <div className="fade-up fade-up-2">
        <BottomCards signals={signals} events={events} courses={courses} />
      </div>

      <CourseSheet course={openCourse} onClose={() => setOpenCourse(null)} />
    </div>
  );
}
