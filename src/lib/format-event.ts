import type { EventView } from "@/lib/data/events";

/**
 * 일정 표기 규칙 — 어디서든 같은 룰로 보여야 헷갈리지 않음.
 *
 * 시간표 수업 (kind=class): "[N주차] 글로컬 영어"
 *   - 학기 시작일 기준 같은 요일이 몇 번째인지로 주차 계산
 *   - termStart 없으면 "[수업]"으로 fallback
 *
 * 시험·과제·발표 (kind=exam/assignment/presentation):
 *   - "[시험] 글로컬 영어" (title이 과목명을 포함하면 그대로)
 *   - "[시험] 운영체제 · 중간고사" (title이 다른 일정 이름이면 과목명 + " · " + title)
 *
 * etc: "[기타] ..."
 */

const KIND_BRACKET: Record<EventView["kind"], string> = {
  class: "수업",
  exam: "시험",
  assignment: "과제",
  presentation: "발표",
  etc: "기타",
};

export function formatEventLabel(event: EventView): string {
  const bracket = formatBracket(event);
  const body = formatBody(event);
  return `[${bracket}] ${body}`;
}

/**
 * 큰 hero·헤딩에서 쓰는 라벨 — 대괄호 없이 자연스럽게.
 *   - class: "글로컬 영어 N주차"
 *   - exam/assignment/...: "운영체제 중간고사" 또는 title 그대로 (과목명 포함 시)
 */
export function formatEventHeading(event: EventView): string {
  if (event.kind === "class") {
    const week = computeWeekNumber(event);
    const name = event.courseName ?? event.title;
    return week != null ? `${name} ${week}주차` : name;
  }
  return formatBody(event);
}

function formatBracket(event: EventView): string {
  if (event.kind === "class") {
    const week = computeWeekNumber(event);
    if (week != null) return `${week}주차`;
  }
  return KIND_BRACKET[event.kind];
}

function formatBody(event: EventView): string {
  // 시간표 수업: 본문 = 과목명만 (title도 보통 과목명이지만 중복 방지)
  if (event.kind === "class") {
    return event.courseName ?? event.title;
  }

  // 다른 일정: 과목명이 있고, title에 과목명이 안 들어있으면 prefix
  if (event.courseName) {
    const courseName = event.courseName;
    const title = event.title;
    if (title.includes(courseName) || courseName.includes(title)) {
      return title;
    }
    // title이 단순한 일정 이름 ("중간고사", "과제 1")이면 과목명 + 일정 이름
    return `${courseName} · ${title}`;
  }

  return event.title;
}

/**
 * 학기 시작일부터 같은 요일이 몇 번째인지 계산.
 * 예: termStart = 2026-03-02 (월), event = 2026-03-09 (월) → 2주차
 */
function computeWeekNumber(event: EventView): number | null {
  if (!event.courseTermStart) return null;
  const start = new Date(`${event.courseTermStart.slice(0, 10)}T00:00:00+09:00`);
  const target = new Date(event.startsAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(target.getTime())) return null;
  if (target < start) return null;

  // 같은 요일끼리 비교 — 학기 첫 같은 요일을 찾고 그 이후 7일 단위로 카운트
  const targetDay = target.getDay();
  const firstSameDay = new Date(start);
  while (firstSameDay.getDay() !== targetDay) {
    firstSameDay.setDate(firstSameDay.getDate() + 1);
    if (firstSameDay > target) return null;
  }
  const diffMs = target.getTime() - firstSameDay.getTime();
  const week = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
  if (week < 1 || week > 30) return null;
  return week;
}
