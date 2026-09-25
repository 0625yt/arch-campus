import { describe, expect, it } from "vitest";
import {
  academicTermLabel,
  calculateGpa,
  compareAcademicTerms,
  inferAcademicTerm,
  parseAcademicTermKey,
  recentAcademicTerms,
} from "./academic";

describe("academic terms", () => {
  it("parses only supported term keys", () => {
    expect(parseAcademicTermKey("2026-fall")).toEqual({ year: 2026, term: "fall" });
    expect(parseAcademicTermKey("2026-third")).toBeNull();
    expect(parseAcademicTermKey("fall-2026")).toBeNull();
  });

  it("uses Korean university term labels and ordering", () => {
    expect(academicTermLabel(2026, "spring")).toBe("2026년 1학기");
    expect(
      [
        { year: 2025, term: "fall" as const },
        { year: 2026, term: "spring" as const },
      ].sort(compareAcademicTerms),
    ).toEqual([
      { year: 2026, term: "spring" },
      { year: 2025, term: "fall" },
    ]);
  });

  it("infers regular and seasonal semesters", () => {
    expect(inferAcademicTerm(new Date(2026, 2, 1))).toEqual({ year: 2026, term: "spring" });
    expect(inferAcademicTerm(new Date(2026, 6, 1))).toEqual({ year: 2026, term: "summer" });
    expect(inferAcademicTerm(new Date(2026, 8, 1))).toEqual({ year: 2026, term: "fall" });
    expect(inferAcademicTerm(new Date(2026, 0, 1))).toEqual({ year: 2025, term: "winter" });
  });

  it("includes seasonal semesters in recent term choices", () => {
    const terms = recentAcademicTerms(new Date("2026-09-25T00:00:00+09:00"));
    expect(terms).toHaveLength(28);
    expect(terms).toContainEqual({ year: 2026, term: "summer" });
    expect(terms).toContainEqual({ year: 2026, term: "winter" });
  });
});

describe("GPA calculation", () => {
  it("calculates a credit-weighted 4.5 GPA and excludes pass/fail from the denominator", () => {
    expect(
      calculateGpa([
        { semesterYear: 2026, semesterTerm: "fall", credits: 3, grade: "A+" },
        { semesterYear: 2026, semesterTerm: "fall", credits: 2, grade: "B0" },
        { semesterYear: 2026, semesterTerm: "fall", credits: 1, grade: "P" },
      ]),
    ).toEqual({
      gpa: 3.9,
      registeredCredits: 6,
      gradedCredits: 5,
      earnedCredits: 6,
      gradedCourseCount: 3,
      totalCourseCount: 3,
    });
  });

  it("counts F in GPA and leaves an ungraded semester without a fake zero", () => {
    expect(
      calculateGpa([
        { semesterYear: 2026, semesterTerm: "fall", credits: 3, grade: "F" },
        { semesterYear: 2026, semesterTerm: "fall", credits: 3, grade: null },
      ]),
    ).toMatchObject({ gpa: 0, gradedCredits: 3, earnedCredits: 0 });
    expect(
      calculateGpa([{ semesterYear: 2026, semesterTerm: "fall", credits: 3, grade: null }]).gpa,
    ).toBeNull();
  });
});
