import { describe, expect, it } from "vitest";
import {
  resolveSeriesOccurrenceTimes,
  resolveSingleEventTimes,
  validateEventRange,
  validateEventTimestamp,
} from "./calendar-event-time";

describe("calendar event time safety", () => {
  it("rejects nonexistent dates and clock values without a timezone", () => {
    expect(validateEventTimestamp("2026-02-30")).toContain("존재하지 않는");
    expect(validateEventTimestamp("2026-07-23T13:00:00", { allowDateOnly: false })).toContain(
      "시간대",
    );
    expect(validateEventTimestamp("2026-07-23T13:00:00+09:00", { allowDateOnly: false })).toBe(
      null,
    );
  });

  it("allows date-only all-day events but rejects them for timed events", () => {
    expect(validateEventRange("2026-07-23", null, { allowDateOnly: false })).toContain("시각");
    expect(validateEventRange("2026-07-23", null, { allowDateOnly: true })).toBe(null);
  });

  it("rejects reversed and identical ranges", () => {
    expect(validateEventRange("2026-07-23T01:00:00Z", "2026-07-23T01:00:00Z")).toContain("늦어야");
    expect(validateEventRange("2026-07-23T02:00:00Z", "2026-07-23T01:00:00Z")).toContain("늦어야");
  });

  it("preserves duration when only a single event's start changes", () => {
    const result = resolveSingleEventTimes({
      originalStart: "2026-07-20T00:00:00.000Z",
      originalEnd: "2026-07-20T01:30:00.000Z",
      requestedStart: "2026-07-20T02:00:00.000Z",
    });
    expect(result).toEqual({
      ok: true,
      startsAt: "2026-07-20T02:00:00.000Z",
      endsAt: "2026-07-20T03:30:00.000Z",
    });
  });

  it("changes every series occurrence to the requested KST clock without collapsing dates", () => {
    const result = resolveSeriesOccurrenceTimes({
      occurrenceStart: "2026-07-27T00:00:00.000Z", // 월 09:00 KST
      occurrenceEnd: "2026-07-27T01:30:00.000Z",
      selectedStart: "2026-07-20T00:00:00.000Z",
      selectedEnd: "2026-07-20T01:30:00.000Z",
      requestedStart: "2026-07-20T02:00:00.000Z", // 월 11:00 KST
    });
    expect(result).toEqual({
      ok: true,
      startsAt: "2026-07-27T02:00:00.000Z",
      endsAt: "2026-07-27T03:30:00.000Z",
    });
  });

  it("preserves overnight duration for all-series edits", () => {
    const result = resolveSeriesOccurrenceTimes({
      occurrenceStart: "2026-07-20T13:00:00.000Z",
      occurrenceEnd: "2026-07-20T16:00:00.000Z",
      selectedStart: "2026-07-20T13:00:00.000Z",
      selectedEnd: "2026-07-20T16:00:00.000Z",
      requestedStart: "2026-07-20T14:00:00.000Z",
      requestedEnd: "2026-07-20T17:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(new Date(result.endsAt as string).getTime() - new Date(result.startsAt).getTime()).toBe(
      3 * 60 * 60 * 1000,
    );
  });
});
