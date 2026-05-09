import { describe, expect, it } from "vitest";
import { breakdown, checkBudget, countTokens } from "./tokens";

describe("countTokens", () => {
  it("returns 0 for empty", () => {
    expect(countTokens("")).toBe(0);
  });
  it("returns positive integer for korean text", () => {
    const n = countTokens("프로세스 동기화 임계 구역 문제");
    expect(n).toBeGreaterThan(2);
    expect(Number.isInteger(n)).toBe(true);
  });
});

describe("breakdown", () => {
  it("computes cacheable share", () => {
    const b = breakdown({
      rule: "정적인 룰 텍스트 ".repeat(50),
      dynamic: "사용자 페르소나",
      user: "오늘 자료",
    });
    expect(b.total).toBe(b.rule + b.dynamic + b.user);
    expect(b.cacheableShare).toBeGreaterThan(0.5);
  });
});

describe("checkBudget", () => {
  it("ok within budget", () => {
    const result = checkBudget("짧은 글", 100);
    expect(result.ok).toBe(true);
    expect(result.message).toBeUndefined();
  });
  it("fails over budget", () => {
    const result = checkBudget("아주 긴 글 ".repeat(500), 50);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/예산/);
  });
});
