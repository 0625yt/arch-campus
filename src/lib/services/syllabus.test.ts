import { beforeAll, describe, expect, it, vi } from "vitest";
import type { SyllabusOutputT } from "@/lib/schemas";

vi.mock("server-only", () => ({}));

let __test: typeof import("./syllabus").__test;

beforeAll(async () => {
  ({ __test } = await import("./syllabus"));
});

function makeParsed(overrides?: Partial<SyllabusOutputT>): SyllabusOutputT {
  return {
    course: {
      name: "글로컬 영어",
      professor: "홍길동",
      location: "인문관 201",
      schedule: ["목 10:00-11:15"],
      termStart: "2026-03-02",
      termEnd: "2026-06-13",
      ...overrides?.course,
    },
    events: overrides?.events ?? [],
    watermark:
      overrides?.watermark ?? "이 자료는 학습 보조용이며, 일정은 강의계획서를 다시 확인하세요.",
  };
}

describe("syllabus postprocess", () => {
  it("infers missing course schedule from plain text", () => {
    const inferred = __test.inferScheduleFromText(`
      과목명: 글로컬 영어
      수업시간: 화 13:00~14:15 / 금 09:00~10:15
      강의실: 국제관 301
    `);
    expect(inferred).toEqual(["화 13:00-14:15", "금 09:00-10:15"]);
  });

  it("auto-aligns week-based in-class events to the unique nearest course weekday", () => {
    const parsed = makeParsed({
      events: [
        {
          kind: "class",
          title: "7주차 Unit 5",
          notes: "7주차 수업 활동",
          startsAt: "2026-03-17",
          allDay: true,
          confidence: 0.62,
        },
      ],
    });
    const repaired = __test.autoAlignScheduleAnchoredEvents(parsed);
    expect(repaired.events[0].startsAt).toBe("2026-03-19");
    expect(repaired.events[0].notes).toContain("강의 요일(목)");
    expect(repaired.events[0].confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("does not auto-align submission deadlines even when weekday differs", () => {
    const parsed = makeParsed({
      events: [
        {
          kind: "assignment",
          title: "에세이 제출",
          notes: "LMS 제출 마감",
          startsAt: "2026-03-17",
          allDay: true,
          confidence: 0.9,
        },
      ],
    });
    const repaired = __test.autoAlignScheduleAnchoredEvents(parsed);
    expect(repaired.events[0].startsAt).toBe("2026-03-17");
    expect(repaired.events[0].notes).toBe("LMS 제출 마감");
  });

  it("keeps ambiguous two-day schedules untouched and marks them for review", () => {
    const parsed = makeParsed({
      course: {
        name: "글로컬 영어",
        schedule: ["월 09:00-10:15", "수 09:00-10:15"],
      },
      events: [
        {
          kind: "class",
          title: "4주차 Quiz",
          notes: "4주차 수업 중 진행",
          startsAt: "2026-03-10",
          allDay: true,
          confidence: 0.88,
        },
      ],
    });
    const aligned = __test.autoAlignScheduleAnchoredEvents(parsed);
    expect(aligned.events[0].startsAt).toBe("2026-03-10");

    const flagged = __test.markScheduleWeekdayMismatches(aligned);
    expect(flagged.events[0].notes).toContain("확인 필요");
    expect(flagged.events[0].confidence).toBeLessThanOrEqual(0.55);
  });
});
