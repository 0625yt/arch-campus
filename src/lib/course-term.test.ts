import { describe, expect, it } from "vitest";
import { effectiveCourseTermEnd, isImportedClassInsideCourseTerm } from "./course-term";

describe("course term bounds", () => {
  it("레거시 정규학기 sentinel만 16주 경계로 보정한다", () => {
    expect(effectiveCourseTermEnd("2026-03-01", "2026-06-30")).toBe("2026-06-20");
    expect(effectiveCourseTermEnd("2026-09-01", "2026-12-31")).toBe("2026-12-21");
    expect(effectiveCourseTermEnd("2026-03-04", "2026-06-30")).toBe("2026-06-30");
  });

  it("자동 시간표의 17·18주차는 숨기고 16주차는 유지한다", () => {
    const base = {
      kind: "class",
      sourceMaterialId: "material-1",
      courseTermStart: "2026-03-01",
      courseTermEnd: "2026-06-30",
    };
    expect(isImportedClassInsideCourseTerm({ ...base, startsAt: "2026-06-16T01:00:00Z" })).toBe(
      true,
    );
    expect(isImportedClassInsideCourseTerm({ ...base, startsAt: "2026-06-29T00:00:00Z" })).toBe(
      false,
    );
  });

  it("직접 만든 수업과 개인 일정은 학기 밖이어도 보존한다", () => {
    const outside = {
      startsAt: "2026-06-29T00:00:00Z",
      courseTermStart: "2026-03-01",
      courseTermEnd: "2026-06-20",
    };
    expect(
      isImportedClassInsideCourseTerm({ ...outside, kind: "class", sourceMaterialId: null }),
    ).toBe(true);
    expect(
      isImportedClassInsideCourseTerm({ ...outside, kind: "etc", sourceMaterialId: "material-1" }),
    ).toBe(true);
  });
});
