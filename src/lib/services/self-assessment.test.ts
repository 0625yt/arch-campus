import { expect, it } from "vitest";
import { parseAttemptResults } from "@/lib/attempt-results";
import type { GradedResult } from "./grade-quiz";
import { applySelfAssessment } from "./self-assessment";

it("persists identifiable self assessment and restores the original verdict", () => {
  const original: GradedResult = {
    questionId: 7,
    kind: "short-answer",
    answer: "개체 무결성",
    submitted: "무결성",
    correct: false,
    explanation: "구체적인 제약 종류가 필요합니다.",
    evidence: "기본키는 NULL이 아니다.",
    evidencePage: 1,
    whyWrong: "어떤 무결성인지 구분해 주세요.",
    gradingNote: "구분 필요",
  };
  const corrected = applySelfAssessment(original, true);
  expect(corrected.correct).toBe(true);
  expect(corrected.selfAssessment?.originalCorrect).toBe(false);
  const restored = applySelfAssessment(parseAttemptResults([corrected])[0], false);
  expect(restored).toEqual({ ...original, selfAssessment: undefined });
});
