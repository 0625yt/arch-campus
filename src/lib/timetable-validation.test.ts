import { describe, expect, it } from "vitest";
import { TimetableOutput } from "./schemas";
import {
  isValidTimeRange,
  normalizeTimetableOutput,
  parseClockMinutes,
  resolveTermBounds,
} from "./timetable-validation";

function output(courses: unknown[]) {
  return TimetableOutput.parse({
    termYear: 2026,
    termLabel: "2026 1학기",
    courses,
    watermark: "학교 포털 원본 시간표와 다시 확인해주세요.",
  });
}

describe("timetable normalization", () => {
  it("normalizes one-digit hours and drops impossible/reversed times", () => {
    const result = normalizeTimetableOutput(
      output([
        {
          name: "자료구조",
          professor: null,
          location: null,
          confidence: 0.95,
          slots: [
            { weekday: "MON", startTime: "9:00", endTime: "10:15" },
            { weekday: "TUE", startTime: "25:00", endTime: "26:00" },
            { weekday: "WED", startTime: "13:00", endTime: "12:00" },
          ],
        },
      ]),
    );

    expect(result.output.courses[0].slots).toEqual([
      { weekday: "MON", startTime: "09:00", endTime: "10:15" },
    ]);
    expect(result.droppedSlotCount).toBe(2);
    expect(result.output.courses[0].confidence).toBe(0.59);
    expect(result.output.warnings.some((warning) => warning.code === "invalid-time")).toBe(true);
  });

  it("merges duplicate courses, exact slots, and adjacent university periods", () => {
    const result = normalizeTimetableOutput(
      output([
        {
          name: " 글로컬   영어 I ",
          professor: "김교수",
          location: "인문관 201",
          confidence: 0.95,
          slots: [
            { weekday: "TUE", startTime: "09:00", endTime: "09:50" },
            { weekday: "TUE", startTime: "10:00", endTime: "10:50" },
          ],
        },
        {
          name: "글로컬 영어 I",
          professor: "김교수",
          location: null,
          confidence: 0.9,
          slots: [
            { weekday: "TUE", startTime: "10:00", endTime: "10:50" },
            { weekday: "TUE", startTime: "11:00", endTime: "11:50" },
            { weekday: "THU", startTime: "13:30", endTime: "14:00" },
          ],
        },
      ]),
    );

    expect(result.output.courses).toHaveLength(1);
    expect(result.output.courses[0].slots).toEqual([
      { weekday: "TUE", startTime: "09:00", endTime: "11:50" },
      { weekday: "THU", startTime: "13:30", endTime: "14:00" },
    ]);
  });

  it("keeps same-named sections with different professors separate", () => {
    const result = normalizeTimetableOutput(
      output([
        {
          name: "대학영어",
          professor: "김교수",
          slots: [{ weekday: "MON", startTime: "09:00", endTime: "10:15" }],
        },
        {
          name: "대학영어",
          professor: "박교수",
          slots: [{ weekday: "TUE", startTime: "09:00", endTime: "10:15" }],
        },
      ]),
    );

    expect(result.output.courses).toHaveLength(2);
  });

  it("flags cross-course overlaps but preserves Saturday and night classes", () => {
    const result = normalizeTimetableOutput(
      output([
        {
          name: "운영체제",
          confidence: 0.99,
          slots: [{ weekday: "SAT", startTime: "18:30", endTime: "20:00" }],
        },
        {
          name: "캡스톤",
          confidence: 0.99,
          slots: [{ weekday: "SAT", startTime: "19:30", endTime: "21:30" }],
        },
      ]),
    );

    expect(result.output.courses).toHaveLength(2);
    expect(result.output.courses.every((course) => course.confidence === 0.59)).toBe(true);
    expect(result.output.warnings.some((warning) => warning.code === "conflict")).toBe(true);
  });

  it("drops courses with no usable time instead of creating invisible calendar courses", () => {
    const result = normalizeTimetableOutput(
      output([{ name: "졸업인증", confidence: 0.8, slots: [] }]),
    );

    expect(result.output.courses).toHaveLength(0);
    expect(result.droppedCourseCount).toBe(1);
    expect(result.output.warnings[0].code).toBe("missing-time");
  });

  it("keeps valid courses when another model slot has null times", () => {
    const result = normalizeTimetableOutput(
      output([
        {
          name: "보험심사",
          slots: [{ weekday: "MON", startTime: "10:00", endTime: "13:00" }],
        },
        {
          name: "비동기 온라인 강의",
          slots: [{ weekday: "FRI", startTime: null, endTime: null }],
        },
      ]),
    );

    expect(result.output.courses).toHaveLength(1);
    expect(result.output.courses[0].name).toBe("보험심사");
    expect(result.droppedCourseCount).toBe(1);
    expect(result.droppedSlotCount).toBe(1);
    expect(result.output.warnings.some((warning) => warning.code === "missing-time")).toBe(true);
  });

  it("drops placeholder courses and clears placeholder professor metadata", () => {
    const result = normalizeTimetableOutput(
      output([
        {
          name: "(미상)",
          professor: "교수 미정",
          slots: [{ weekday: "MON", startTime: "09:00", endTime: "10:00" }],
        },
        {
          name: "데이터구조",
          professor: "담당교수",
          location: "미정",
          slots: [{ weekday: "TUE", startTime: "13:00", endTime: "14:15" }],
        },
      ]),
    );

    expect(result.output.courses).toHaveLength(1);
    expect(result.output.courses[0]).toMatchObject({
      name: "데이터구조",
      professor: null,
      location: null,
    });
    expect(result.droppedCourseCount).toBe(1);
  });
});

describe("timetable time and term guards", () => {
  it("validates real 24-hour ranges, not only their text shape", () => {
    expect(parseClockMinutes("23:59")).toBe(1439);
    expect(parseClockMinutes("24:00")).toBeNull();
    expect(parseClockMinutes("09:60")).toBeNull();
    expect(isValidTimeRange("09:00", "10:30")).toBe(true);
    expect(isValidTimeRange("10:30", "10:30")).toBe(false);
    expect(isValidTimeRange("20:00", "09:00")).toBe(false);
  });

  it("uses the imported semester year instead of the server's current semester", () => {
    expect(resolveTermBounds(2025, "2025 2학기", new Date("2026-07-01"))).toEqual({
      label: "2025 2학기",
      termStart: "2025-09-01",
      termEnd: "2025-12-21",
    });
    expect(resolveTermBounds(2026, "2026 여름학기").termStart).toBe("2026-07-01");
    expect(resolveTermBounds(2027, "2027 겨울학기").termEnd).toBe("2028-02-29");
  });

  it("limits a regular semester fallback to sixteen teaching weeks", () => {
    expect(resolveTermBounds(2026, "2026 1학기")).toMatchObject({
      termStart: "2026-03-01",
      termEnd: "2026-06-20",
    });
    expect(resolveTermBounds(2026, "2026 2학기")).toMatchObject({
      termStart: "2026-09-01",
      termEnd: "2026-12-21",
    });
  });
});
