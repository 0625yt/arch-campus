import { describe, expect, it } from "vitest";
import { createIcalendar, escapeIcalText } from "./ical";

describe("iCalendar export", () => {
  it("escapes user text and emits UTC timed events", () => {
    const text = createIcalendar(
      [
        {
          id: "event-1",
          title: "시험, 1차",
          notes: "1장; 복습\n계산기",
          startsAt: "2026-09-29T01:00:00.000Z",
          endsAt: "2026-09-29T02:30:00.000Z",
          allDay: false,
          location: "공학관 101",
          recurrenceRule: null,
          reminderMinutes: 10,
        },
      ],
      new Date("2026-09-28T00:00:00.000Z"),
    );
    expect(text).toContain("DTSTART:20260929T010000Z");
    expect(text).toContain("SUMMARY:시험\\, 1차");
    expect(text).toContain("DESCRIPTION:1장\\; 복습\\n계산기");
    expect(text).toContain("TRIGGER:-PT10M");
    expect(text.endsWith("\r\n")).toBe(true);
  });

  it("uses KST calendar dates for all-day events", () => {
    const text = createIcalendar([
      {
        id: "event-2",
        title: "과제 마감",
        notes: null,
        startsAt: "2026-09-29T15:00:00.000Z",
        endsAt: null,
        allDay: true,
        location: null,
        recurrenceRule: null,
        reminderMinutes: null,
      },
    ]);
    expect(text).toContain("DTSTART;VALUE=DATE:20260930");
    expect(text).toContain("DTEND;VALUE=DATE:20261001");
  });

  it("escapes backslashes", () => {
    expect(escapeIcalText("A\\B")).toBe("A\\\\B");
  });
});
