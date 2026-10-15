import { describe, expect, it } from "vitest";
import { missingQuizKinds, quizKindQuotas, selectQuizQuestions } from "./quiz-blueprint";
import type { QuizQuestionT } from "./schemas";

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

describe("verified question selection", () => {
  function question(id: number, kind: QuizQuestionT["kind"]): QuizQuestionT {
    return {
      id,
      kind,
      difficulty: "보통",
      topic: "가상 규칙",
      stem: "가상 규칙의 핵심 조건을 설명해 보세요.",
      answer: "기록 보존",
      explanation: "가상 규칙에서는 원본과 정정 기록을 함께 보존해야 합니다.",
      evidence: "원본 기록을 보존한다.",
    };
  }
  it("keeps essays when earlier verified candidates are all multiple-choice", () => {
    const candidates = [
      ...Array.from({ length: 6 }, (_, index) => question(index + 1, "multiple-choice")),
      question(7, "short-answer"),
      question(8, "short-answer"),
      question(9, "essay"),
      question(10, "essay"),
    ];
    const selected = selectQuizQuestions(candidates, 6, [
      "multiple-choice",
      "short-answer",
      "essay",
    ]);
    expect(selected.map((item) => item.id)).toEqual([1, 2, 7, 8, 9, 10]);
  });
  it("fills unavailable quotas with other verified candidates without inventing questions", () => {
    const candidates = [
      question(1, "multiple-choice"),
      question(2, "multiple-choice"),
      question(3, "multiple-choice"),
    ];
    expect(selectQuizQuestions(candidates, 3, ["multiple-choice", "essay"])).toEqual(candidates);
    expect(selectQuizQuestions(candidates, 5)).toHaveLength(3);
  });
  it("detects a missing essay quota even when the total requested count is met", () => {
    const candidates = [
      question(1, "multiple-choice"),
      question(2, "multiple-choice"),
      question(3, "short-answer"),
      question(4, "short-answer"),
      question(5, "multiple-choice"),
      question(6, "short-answer"),
    ];
    expect(missingQuizKinds(candidates, 6, ["multiple-choice", "short-answer", "essay"])).toEqual([
      "essay",
    ]);
    expect(
      missingQuizKinds([...candidates, question(7, "essay"), question(8, "essay")], 6, [
        "multiple-choice",
        "short-answer",
        "essay",
      ]),
    ).toEqual([]);
  });
});
