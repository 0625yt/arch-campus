import type {
  TimetableCourseT,
  TimetableOutputT,
  TimetableReviewWarningT,
  TimetableSlotT,
} from "./schemas";
import { inferSemester } from "./semester";

const WEEKDAY_ORDER: TimetableSlotT["weekday"][] = [
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
  "SUN",
];

export interface NormalizedTimetable {
  output: TimetableOutputT;
  droppedCourseCount: number;
  droppedSlotCount: number;
}

export function normalizeTimetableOutput(input: TimetableOutputT): NormalizedTimetable {
  const warnings: TimetableReviewWarningT[] = [];
  const mergedCourses: TimetableCourseT[] = [];
  let droppedCourseCount = 0;
  let droppedSlotCount = 0;

  for (const rawCourse of input.courses) {
    const name = normalizeWhitespace(rawCourse.name);
    if (!name || isPlaceholderCourseName(name) || /시간\s*미배정/.test(name)) {
      droppedCourseCount += 1;
      continue;
    }

    const validSlots: TimetableSlotT[] = [];
    let invalidForCourse = 0;
    for (const rawSlot of rawCourse.slots) {
      const slot = normalizeSlot(rawSlot);
      if (!slot) {
        invalidForCourse += 1;
        droppedSlotCount += 1;
        continue;
      }
      validSlots.push(slot);
    }

    if (invalidForCourse > 0) {
      warnings.push({
        code: "invalid-time",
        message: `${name}의 잘못된 시간 ${invalidForCourse}개를 제외했어요.`,
        courseNames: [name],
      });
    }
    if (validSlots.length === 0) {
      droppedCourseCount += 1;
      warnings.push({
        code: "missing-time",
        message: `${name}은(는) 확인 가능한 요일·시간이 없어 등록 대상에서 제외했어요.`,
        courseNames: [name],
      });
      continue;
    }

    const existing = mergedCourses.find(
      (candidate) =>
        courseKey(candidate.name) === courseKey(name) &&
        professorsCompatible(candidate.professor, rawCourse.professor),
    );
    if (existing) {
      existing.slots.push(...validSlots);
      existing.professor ||= cleanOptional(rawCourse.professor);
      existing.location ||= cleanOptional(rawCourse.location);
      existing.credits ??= rawCourse.credits ?? null;
      existing.confidence = Math.min(existing.confidence, rawCourse.confidence, 0.85);
      warnings.push({
        code: "deduplicated",
        message: `중복된 ${name} 항목을 하나의 강의로 합쳤어요.`,
        courseNames: [name],
      });
      continue;
    }

    mergedCourses.push({
      ...rawCourse,
      name,
      professor: cleanOptional(rawCourse.professor),
      location: cleanOptional(rawCourse.location),
      slots: validSlots,
      confidence:
        invalidForCourse > 0 ? Math.min(rawCourse.confidence, 0.59) : rawCourse.confidence,
    });
  }

  for (const course of mergedCourses) {
    const before = course.slots.length;
    course.slots = mergeCourseSlots(course.slots);
    const mergedCount = before - course.slots.length;
    if (mergedCount > 0) {
      warnings.push({
        code: "merged-slots",
        message: `${course.name}의 중복·연속 교시 ${mergedCount}개를 한 슬롯으로 합쳤어요.`,
        courseNames: [course.name],
      });
    }
  }

  const conflicts = findCrossCourseConflicts(mergedCourses);
  for (const conflict of conflicts) {
    for (const index of conflict.indexes) {
      mergedCourses[index].confidence = Math.min(mergedCourses[index].confidence, 0.59);
    }
    warnings.push({
      code: "conflict",
      message: `${conflict.names.join(" · ")}의 수업 시간이 겹쳐요. 저장 전에 학교 시간표와 확인해주세요.`,
      courseNames: conflict.names,
    });
  }

  return {
    output: {
      ...input,
      courses: mergedCourses,
      warnings: dedupeWarnings(warnings),
    },
    droppedCourseCount,
    droppedSlotCount,
  };
}

export function parseClockMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function isValidTimeRange(startTime: string, endTime: string): boolean {
  const start = parseClockMinutes(startTime);
  const end = parseClockMinutes(endTime);
  return start !== null && end !== null && end > start && end - start <= 12 * 60;
}

function normalizeSlot(slot: TimetableSlotT): TimetableSlotT | null {
  const start = parseClockMinutes(slot.startTime);
  const end = parseClockMinutes(slot.endTime);
  if (start === null || end === null || end <= start || end - start > 12 * 60) return null;
  return {
    weekday: slot.weekday,
    startTime: formatClock(start),
    endTime: formatClock(end),
  };
}

function mergeCourseSlots(slots: TimetableSlotT[]): TimetableSlotT[] {
  const sorted = [...slots].sort((a, b) => {
    const day = WEEKDAY_ORDER.indexOf(a.weekday) - WEEKDAY_ORDER.indexOf(b.weekday);
    return day || (parseClockMinutes(a.startTime) ?? 0) - (parseClockMinutes(b.startTime) ?? 0);
  });
  const merged: TimetableSlotT[] = [];
  for (const slot of sorted) {
    const previous = merged.at(-1);
    if (!previous || previous.weekday !== slot.weekday) {
      merged.push({ ...slot });
      continue;
    }
    const previousEnd = parseClockMinutes(previous.endTime) ?? 0;
    const currentStart = parseClockMinutes(slot.startTime) ?? 0;
    const currentEnd = parseClockMinutes(slot.endTime) ?? 0;
    // 대학 교시 사이의 5~15분 쉬는 시간은 같은 연속 수업으로 본다.
    if (currentStart <= previousEnd + 15) {
      previous.endTime = formatClock(Math.max(previousEnd, currentEnd));
    } else {
      merged.push({ ...slot });
    }
  }
  return merged;
}

function findCrossCourseConflicts(courses: TimetableCourseT[]) {
  const conflicts = new Map<string, { indexes: [number, number]; names: [string, string] }>();
  for (let left = 0; left < courses.length; left += 1) {
    for (let right = left + 1; right < courses.length; right += 1) {
      const overlaps = courses[left].slots.some((a) =>
        courses[right].slots.some((b) => {
          if (a.weekday !== b.weekday) return false;
          const aStart = parseClockMinutes(a.startTime) ?? 0;
          const aEnd = parseClockMinutes(a.endTime) ?? 0;
          const bStart = parseClockMinutes(b.startTime) ?? 0;
          const bEnd = parseClockMinutes(b.endTime) ?? 0;
          return aStart < bEnd && bStart < aEnd;
        }),
      );
      if (!overlaps) continue;
      const key = `${left}:${right}`;
      conflicts.set(key, {
        indexes: [left, right],
        names: [courses[left].name, courses[right].name],
      });
    }
  }
  return [...conflicts.values()];
}

function professorsCompatible(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = cleanOptional(a);
  const right = cleanOptional(b);
  return !left || !right || courseKey(left) === courseKey(right);
}

function cleanOptional(value: string | null | undefined): string | null {
  const cleaned = value ? normalizeWhitespace(value) : "";
  if (!cleaned) return null;
  const key = placeholderKey(cleaned);
  if (
    /^(?:미상|미정|미배정|알수없음|교수미정|담당교수|교수|unknown|untitled|none|na)$/.test(key) ||
    /^(?:교양|전공|취업정보|학과|구분)$/.test(key)
  ) {
    return null;
  }
  return cleaned;
}

function isPlaceholderCourseName(value: string): boolean {
  return /^(?:미상|미정|미배정|알수없음|과목명|강의명|수업명|unknown|untitled|none|na)$/.test(
    placeholderKey(value),
  );
}

function placeholderKey(value: string): string {
  return normalizeWhitespace(value)
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s()[\]{}<>._\-/]/g, "");
}

function normalizeWhitespace(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function courseKey(value: string): string {
  return normalizeWhitespace(value).toLocaleLowerCase("ko-KR").replace(/\s/g, "");
}

function formatClock(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function dedupeWarnings(warnings: TimetableReviewWarningT[]): TimetableReviewWarningT[] {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = `${warning.code}:${warning.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface TermBounds {
  label: string;
  termStart: string;
  termEnd: string;
}

export function resolveTermBounds(
  termYear: number | null | undefined,
  termLabel: string | null | undefined,
  now: Date = new Date(),
): TermBounds {
  const fallback = inferSemester(now);
  const label = termLabel?.trim() ?? "";
  const yearFromLabel = Number(/(?:20)\d{2}/.exec(label)?.[0]);
  const year = termYear ?? (Number.isInteger(yearFromLabel) ? yearFromLabel : fallback.year);

  if (/여름|하계|summer/i.test(label)) {
    return {
      label: label || `${year} 여름학기`,
      termStart: `${year}-07-01`,
      termEnd: `${year}-08-31`,
    };
  }
  if (/겨울|동계|winter/i.test(label)) {
    return {
      label: label || `${year} 겨울학기`,
      termStart: `${year}-12-01`,
      termEnd: `${year + 1}-02-${isLeapYear(year + 1) ? "29" : "28"}`,
    };
  }
  const isSpring = /1\s*학기|봄|spring/i.test(label);
  const isFall = /2\s*학기|가을|fall/i.test(label);
  const term = isSpring ? "spring" : isFall ? "fall" : fallback.term;
  return term === "spring"
    ? { label: label || `${year} 봄학기`, termStart: `${year}-03-01`, termEnd: `${year}-06-20` }
    : { label: label || `${year} 가을학기`, termStart: `${year}-09-01`, termEnd: `${year}-12-21` };
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
