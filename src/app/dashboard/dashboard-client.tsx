"use client";

import { useEffect, useState } from "react";
import type { EventView } from "@/lib/data/events";
import type { CourseListItem } from "@/lib/data/materials";
import type { SafetySignal } from "@/lib/data/semester-safety";
import { BottomCards } from "./bottom-cards";
import { CourseSheet } from "./course-sheet";
import { SpineCard } from "./spine-card";
import { TimetableHeading, TimetableHero } from "./timetable-hero";

/**
 * 대시보드 단일 타이머 — NowBanner·TimetableHero·스파인 카드가 같은 "지금"을 공유.
 * 이전엔 now-banner·timetable-hero가 각자 60s setInterval을 돌려 두 개가 어긋날 수 있었음.
 */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

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
  const now = useNow();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* 헤더 + 스파인 카드 = 하나의 그룹. 모바일은 간격을 타이트하게 줄여
          시간표(flex-1)가 화면 대부분을 차지하게 한다(사용자 요청: 시간표 꽉 차게). */}
      <div className="shrink-0">
        <TimetableHeading courses={courses} studentName={studentName} />
        <div className="fade-up fade-up-1 mt-2 sm:mt-3">
          <SpineCard courses={courses} now={now} />
        </div>
      </div>

      {/* 시간표 — 가로 풀폭. 모바일은 위아래 간격 축소로 시간표 영역 최대 확보. */}
      <div className="fade-up fade-up-2 mt-2.5 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden sm:mt-5">
        <TimetableHero courses={courses} now={now} onPickCourse={(c) => setOpenCourse(c)} />
      </div>

      <div className="fade-up fade-up-3 mt-2.5 shrink-0 sm:mt-5">
        <BottomCards signals={signals} events={events} courses={courses} />
      </div>

      <CourseSheet course={openCourse} onClose={() => setOpenCourse(null)} />
    </div>
  );
}
