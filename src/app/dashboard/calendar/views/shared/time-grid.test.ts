import { describe, expect, it } from "vitest";
import type { EventView } from "@/lib/data/events";
import { eventDisplayDateKeys, eventOccursOnDateKey } from "./time-grid";

function event(overrides: Partial<EventView> = {}): EventView {
  return {
    id: "event-1",
    courseId: null,
    courseName: null,
    courseColor: null,
    courseTermStart: null,
    courseTermEnd: null,
    kind: "etc",
    title: "일정",
    notes: null,
    startsAt: "2026-07-20T15:00:00.000Z",
    endsAt: null,
    allDay: false,
    weightPercent: null,
    confidence: null,
    confirmed: true,
    sourceMaterialId: null,
    sourceMaterialTitle: null,
    sourceMaterialType: null,
    color: null,
    location: null,
    recurrenceRule: null,
    reminderMinutes: null,
    ...overrides,
  };
}

describe("calendar event date display", () => {
  it("시간 일정은 KST 시작일에만 표시한다", () => {
    const value = event();
    expect(eventOccursOnDateKey(value, "2026-07-21")).toBe(true);
    expect(eventOccursOnDateKey(value, "2026-07-22")).toBe(false);
  });

  it("여러 날 종일 일정은 시작일과 종료일을 모두 포함한다", () => {
    const value = event({
      allDay: true,
      startsAt: "2026-07-20T15:00:00.000Z",
      endsAt: "2026-07-23T14:59:00.000Z",
    });
    expect(eventDisplayDateKeys(value)).toEqual(["2026-07-21", "2026-07-22", "2026-07-23"]);
    expect(eventOccursOnDateKey(value, "2026-07-23")).toBe(true);
    expect(eventOccursOnDateKey(value, "2026-07-24")).toBe(false);
  });

  it("종료가 없거나 잘못 앞선 종일 일정은 시작일 한 칸에만 표시한다", () => {
    expect(eventDisplayDateKeys(event({ allDay: true }))).toEqual(["2026-07-21"]);
    expect(
      eventDisplayDateKeys(event({ allDay: true, endsAt: "2026-07-19T15:00:00.000Z" })),
    ).toEqual(["2026-07-21"]);
  });
});
