import { describe, expect, it } from "vitest";
import {
  addDaysToDateKey,
  dateKeyToDayNumber,
  kstDateKey,
  kstDateKeyToIso,
  kstParts,
  startOfWeekDateKey,
  weekdayOfDateKey,
} from "./kst";

describe("KST calendar helpers", () => {
  it("puts UTC evening events on the next Korean calendar day", () => {
    const iso = "2026-07-22T16:30:00.000Z";
    expect(kstDateKey(iso)).toBe("2026-07-23");
    expect(kstParts(iso)).toMatchObject({ hour: 1, minute: 30, weekday: 4 });
  });

  it("converts Korean midnight to the exact UTC instant", () => {
    expect(kstDateKeyToIso("2026-03-01")).toBe("2026-02-28T15:00:00.000Z");
    expect(kstDateKeyToIso("2026-03-01", "23:59")).toBe("2026-03-01T14:59:00.000Z");
  });

  it("does date-only arithmetic without depending on the machine timezone", () => {
    expect(addDaysToDateKey("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDaysToDateKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(weekdayOfDateKey("2026-07-23")).toBe(4);
    expect(startOfWeekDateKey("2026-07-23")).toBe("2026-07-19");
    expect(dateKeyToDayNumber("2026-07-24") - dateKeyToDayNumber("2026-07-23")).toBe(1);
  });
});
