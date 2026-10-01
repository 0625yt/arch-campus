import { describe, expect, it } from "vitest";
import { scheduleReview } from "./fsrs";

describe("FSRS review scheduling", () => {
  const now = new Date("2026-09-29T03:00:00.000Z");

  it("schedules a new failed recall for a near-term retry", () => {
    const result = scheduleReview(null, 1, now);
    expect(result.card.reps).toBe(1);
    expect(result.card.lapses).toBe(0);
    expect(new Date(result.card.dueAt).getTime()).toBeGreaterThan(now.getTime());
    expect(new Date(result.card.dueAt).getTime()).toBeLessThanOrEqual(now.getTime() + 15 * 60_000);
  });

  it("gives an easy recall a longer first interval than good", () => {
    const good = scheduleReview(null, 3, now);
    const easy = scheduleReview(null, 4, now);
    expect(new Date(easy.card.dueAt).getTime()).toBeGreaterThan(
      new Date(good.card.dueAt).getTime(),
    );
  });

  it("continues scheduling from stored memory state", () => {
    const first = scheduleReview(null, 3, now);
    const secondAt = new Date(first.card.dueAt);
    const second = scheduleReview(first.card, 3, secondAt);
    expect(second.card.reps).toBe(2);
    expect(second.card.stability).toBeGreaterThanOrEqual(first.card.stability);
    expect(new Date(second.card.dueAt).getTime()).toBeGreaterThan(secondAt.getTime());
  });
});
