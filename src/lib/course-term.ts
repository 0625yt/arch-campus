import { kstDateKey } from "@/lib/kst";

/**
 * 2026-07 이전 fallback이 정규학기를 3/1~6/30, 9/1~12/31로 넓게 저장했다.
 * 사용자가 직접 지정한 다른 기간은 보존하고, 정확히 그 레거시 sentinel만 16주 경계로 보정한다.
 */
export function effectiveCourseTermEnd(
  termStart: string | null,
  termEnd: string | null,
): string | null {
  if (!termStart || !termEnd) return termEnd;
  const year = termStart.slice(0, 4);
  if (termStart === `${year}-03-01` && termEnd === `${year}-06-30`) {
    return `${year}-06-20`;
  }
  if (termStart === `${year}-09-01` && termEnd === `${year}-12-31`) {
    return `${year}-12-21`;
  }
  return termEnd;
}

/** 자동 가져온 수업만 과목의 학기 범위로 제한한다. 직접 만든 보강·개인 일정은 보존한다. */
export function isImportedClassInsideCourseTerm(event: {
  kind: string;
  sourceMaterialId: string | null;
  startsAt: string;
  courseTermStart: string | null;
  courseTermEnd: string | null;
}): boolean {
  if (event.kind !== "class" || !event.sourceMaterialId) return true;
  const effectiveEnd = effectiveCourseTermEnd(event.courseTermStart, event.courseTermEnd);
  if (!event.courseTermStart && !effectiveEnd) return true;

  const dateKey = kstDateKey(event.startsAt);
  if (event.courseTermStart && dateKey < event.courseTermStart.slice(0, 10)) return false;
  if (effectiveEnd && dateKey > effectiveEnd.slice(0, 10)) return false;
  return true;
}
