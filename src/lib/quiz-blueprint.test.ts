import { describe, expect, it } from "vitest";
import { quizKindQuotas } from "./quiz-blueprint";

describe("quiz kind quotas", () => {
  it("혼합 종류의 개수 합을 유지하고 나머지를 분산한다", () => {
    expect(quizKindQuotas(7, ["multiple-choice", "short-answer", "essay"])).toEqual({
      "multiple-choice": 3,
      "short-answer": 2,
      essay: 2,
    });
    expect(quizKindQuotas(7, ["multiple-choice", "short-answer", "essay"], 1)).toEqual({
      "multiple-choice": 2,
      "short-answer": 3,
      essay: 2,
    });
  });
  it("중복 kind와 비어 있는 종류를 정리한다", () => {
    expect(quizKindQuotas(5, ["essay", "essay"])).toEqual({ essay: 5 });
    expect(quizKindQuotas(5, [])).toEqual({ "multiple-choice": 5 });
  });
});
