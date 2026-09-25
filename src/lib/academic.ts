export const SEMESTER_TERMS = ["spring", "summer", "fall", "winter"] as const;
export type SemesterTerm = (typeof SEMESTER_TERMS)[number];

export const COURSE_GRADES = [
  "A+",
  "A0",
  "B+",
  "B0",
  "C+",
  "C0",
  "D+",
  "D0",
  "F",
  "P",
  "NP",
] as const;
export type CourseGrade = (typeof COURSE_GRADES)[number];

/** 학교별 무학점 P/NP 과목을 포함한 0.5 단위 학점 선택지. */
export const COURSE_CREDIT_OPTIONS = Array.from({ length: 13 }, (_, index) => index / 2);

export interface AcademicCourse {
  semesterYear: number | null;
  semesterTerm: SemesterTerm | null;
  credits: number | null;
  grade: CourseGrade | null;
}

export interface GpaSummary {
  gpa: number | null;
  registeredCredits: number;
  gradedCredits: number;
  earnedCredits: number;
  gradedCourseCount: number;
  totalCourseCount: number;
}

const TERM_LABEL: Record<SemesterTerm, string> = {
  spring: "1학기",
  summer: "여름학기",
  fall: "2학기",
  winter: "겨울학기",
};

const TERM_ORDER: Record<SemesterTerm, number> = { spring: 0, summer: 1, fall: 2, winter: 3 };

const GRADE_POINTS: Partial<Record<CourseGrade, number>> = {
  "A+": 4.5,
  A0: 4,
  "B+": 3.5,
  B0: 3,
  "C+": 2.5,
  C0: 2,
  "D+": 1.5,
  D0: 1,
  F: 0,
};

export function academicTermKey(year: number, term: SemesterTerm): string {
  return `${year}-${term}`;
}

export function parseAcademicTermKey(value: string | null | undefined): {
  year: number;
  term: SemesterTerm;
} | null {
  const match = /^(\d{4})-(spring|summer|fall|winter)$/.exec(value ?? "");
  if (!match) return null;
  const year = Number(match[1]);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  return { year, term: match[2] as SemesterTerm };
}

export function academicTermLabel(year: number, term: SemesterTerm): string {
  return `${year}년 ${TERM_LABEL[term]}`;
}

export function inferAcademicTerm(now: Date = new Date()): { year: number; term: SemesterTerm } {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month <= 2) return { year: year - 1, term: "winter" };
  if (month <= 6) return { year, term: "spring" };
  if (month <= 8) return { year, term: "summer" };
  return { year, term: "fall" };
}

export function compareAcademicTerms(
  left: { year: number; term: SemesterTerm },
  right: { year: number; term: SemesterTerm },
): number {
  return right.year - left.year || TERM_ORDER[right.term] - TERM_ORDER[left.term];
}

/** 학기 선택기에 보여줄 최근 학기. 다음 학년도부터 5년 전까지 계절학기를 포함한다. */
export function recentAcademicTerms(
  now: Date = new Date(),
): Array<{ year: number; term: SemesterTerm }> {
  const current = inferAcademicTerm(now);
  const values: Array<{ year: number; term: SemesterTerm }> = [];
  for (let year = current.year + 1; year >= current.year - 5; year--) {
    for (const term of SEMESTER_TERMS) values.push({ year, term });
  }
  return values.sort(compareAcademicTerms);
}

export function calculateGpa(courses: AcademicCourse[]): GpaSummary {
  let registeredCredits = 0;
  let gradedCredits = 0;
  let earnedCredits = 0;
  let weightedPoints = 0;
  let gradedCourseCount = 0;

  for (const course of courses) {
    const credits = course.credits && course.credits > 0 ? course.credits : 0;
    registeredCredits += credits;
    if (!course.grade) continue;
    gradedCourseCount++;
    const points = GRADE_POINTS[course.grade];
    if (points !== undefined) {
      gradedCredits += credits;
      weightedPoints += points * credits;
    }
    if (course.grade !== "F" && course.grade !== "NP") earnedCredits += credits;
  }

  return {
    gpa: gradedCredits > 0 ? Math.round((weightedPoints / gradedCredits) * 100) / 100 : null,
    registeredCredits: Math.round(registeredCredits * 10) / 10,
    gradedCredits: Math.round(gradedCredits * 10) / 10,
    earnedCredits: Math.round(earnedCredits * 10) / 10,
    gradedCourseCount,
    totalCourseCount: courses.length,
  };
}

export function isCourseInTerm(
  course: Pick<AcademicCourse, "semesterYear" | "semesterTerm">,
  year: number,
  term: SemesterTerm,
): boolean {
  return course.semesterYear === year && course.semesterTerm === term;
}
