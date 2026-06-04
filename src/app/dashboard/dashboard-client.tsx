"use client";

import { useState } from "react";
import type { EventView } from "@/lib/data/events";
import type { CourseListItem } from "@/lib/data/materials";
import type { SafetySignal } from "@/lib/data/semester-safety";
import { BottomCards } from "./bottom-cards";
import { CourseSheet } from "./course-sheet";
import { NowBanner } from "./now-banner";
import { TimetableHeading, TimetableHero } from "./timetable-hero";

/**
 * Dashboard client wrapper — 시간표 풀폭 구조 (구조안 A).
 *
 *   ┌─ heading (이름)
 *   ├─ 주간 날짜 strip + 지금/다음 (NowBanner)
 *   ├─ ┌──────────────────────────────────────┐
 *   │  │        시간표 — 가로 풀폭 (주인공)      │
 *   │  └──────────────────────────────────────┘
 *   └─ 하단 3카드 (긴급·다음 일정·진척)
 *
 * 빈 사이드레일 제거 → 시간표가 풀폭으로 넓어짐. "내일 첫 강의"는 다음 일정 카드가 담당.
 * 헤더·배너·하단카드는 shrink-0 고정, 시간표만 flex-1.
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
    <div className="flex h-full min-h-0 flex-col">
      {/* 헤더 + 배너 = 하나의 그룹 (붙임) */}
      <div className="shrink-0">
        <TimetableHeading courses={courses} studentName={studentName} />
        <div className="fade-up fade-up-1 mt-2.5">
          <NowBanner courses={courses} />
        </div>
      </div>

      {/* 시간표 — 가로 풀폭. 시간표↔하단카드는 띄워 그룹 분리(mt-4) */}
      <div className="fade-up fade-up-2 mt-4 flex min-h-0 min-w-0 flex-1 flex-col">
        <TimetableHero courses={courses} onPickCourse={(c) => setOpenCourse(c)} />
      </div>

      <div className="fade-up fade-up-3 mt-3 shrink-0">
        <BottomCards signals={signals} events={events} courses={courses} />
      </div>

      <CourseSheet course={openCourse} onClose={() => setOpenCourse(null)} />
    </div>
  );
}
