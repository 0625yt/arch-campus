import { describe, expect, it } from "vitest";
import { buildTimetable, parseScheduleString } from "./timetable-grid";

describe("timetable dashboard parsing", () => {
  it("rejects impossible clock values even when the shape looks valid", () => {
    expect(parseScheduleString("월 25:00-26:00")).toBeNull();
    expect(parseScheduleString("화 09:60-10:30")).toBeNull();
    expect(parseScheduleString("수 11:00-10:00")).toBeNull();
  });

  it("keeps weekend and late classes in the visible range", () => {
    const timetable = buildTimetable([
      {
        id: "course",
        name: "야간 세미나",
        professor: null,
        location: null,
        color: null,
        schedule: ["토 18:30-21:30"],
      },
    ]);
    expect(timetable.activeWeekdays).toEqual(["SAT"]);
    expect(timetable.hourStart).toBe(18);
    expect(timetable.hourEnd).toBe(22);
  });
});
