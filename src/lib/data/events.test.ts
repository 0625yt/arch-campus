import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getAdminSupabase: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminSupabase: mocks.getAdminSupabase }));

import { isUpcomingEvent, listUpcomingEvents } from "./events";

const NOW = new Date("2026-09-10T01:00:00.000Z"); // 10:00 KST

describe("upcoming events", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("keeps today's all-day deadline visible until KST midnight", () => {
    const event = { startsAt: "2026-09-09T15:00:00.000Z", endsAt: null, allDay: true };
    expect(isUpcomingEvent(event, NOW)).toBe(true);
    expect(isUpcomingEvent(event, new Date("2026-09-10T14:59:59.999Z"))).toBe(true);
    expect(isUpcomingEvent(event, new Date("2026-09-10T15:00:00.000Z"))).toBe(false);
  });

  it("keeps a class in progress and removes it at its end", () => {
    const event = {
      startsAt: "2026-09-10T00:00:00.000Z",
      endsAt: "2026-09-10T02:00:00.000Z",
      allDay: false,
    };
    expect(isUpcomingEvent(event, NOW)).toBe(true);
    expect(isUpcomingEvent(event, new Date(event.endsAt))).toBe(false);
  });

  it("keeps a multiday event that started yesterday and has not ended", () => {
    expect(
      isUpcomingEvent(
        {
          startsAt: "2026-09-08T15:00:00.000Z",
          endsAt: "2026-09-11T15:00:00.000Z",
          allDay: true,
        },
        NOW,
      ),
    ).toBe(true);
  });

  it("excludes a passed time-only reminder without inventing a duration", () => {
    expect(
      isUpcomingEvent({ startsAt: "2026-09-10T00:00:00.000Z", endsAt: null, allDay: false }, NOW),
    ).toBe(false);
  });

  it("keeps future events and rejects invalid starts", () => {
    expect(
      isUpcomingEvent({ startsAt: "2026-09-11T00:00:00.000Z", endsAt: null, allDay: false }, NOW),
    ).toBe(true);
    expect(isUpcomingEvent({ startsAt: "invalid", endsAt: null, allDay: true }, NOW)).toBe(false);
  });

  it("fetches today's and ongoing candidates, then removes finished timed events", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const row = {
      course_id: null,
      courses: null,
      source_material_id: null,
      kind: "assignment",
      title: "오늘 과제",
      starts_at: "2026-09-09T15:00:00.000Z",
      ends_at: null,
      all_day: true,
    };
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [
          { ...row, id: "today" },
          { ...row, id: "finished", all_day: false },
          { ...row, id: "tomorrow", starts_at: "2026-09-10T15:00:00.000Z" },
        ],
        error: null,
      }),
    };
    mocks.getAdminSupabase.mockReturnValue({ from: () => query });

    const result = await listUpcomingEvents({ ownerId: "student", limit: 2 });

    expect(query.eq).toHaveBeenCalledWith("owner_id", "student");
    expect(query.or).toHaveBeenCalledWith(
      "starts_at.gte.2026-09-09T15:00:00.000Z,ends_at.gt.2026-09-10T01:00:00.000Z",
    );
    expect(result.map((event) => event.id)).toEqual(["today", "tomorrow"]);
  });
});
