import { describe, expect, it, vi } from "vitest";
import type { QuizQuestionT } from "@/lib/schemas";

vi.mock("server-only", () => ({}));

import { verifyQuizQuestions } from "@/lib/services/quiz-verifier";

const runLive = process.env.RUN_LLM_EVAL === "1";

function mcq(
  id: number,
  answer: "A" | "B" | "C" | "D",
  choices: [string, string, string, string],
): QuizQuestionT {
  return {
    id,
    kind: "multiple-choice",
    difficulty: "보통",
    topic: "표본 평균",
    stem: "자료에서 설명한 표본 평균의 표준오차 변화로 가장 적절한 것은 무엇인가요?",
    choices: choices.map((text, index) => ({
      key: (["A", "B", "C", "D"] as const)[index],
      text,
    })),
    answer,
    explanation: "표본 크기가 커지면 표본 평균의 표준오차가 작아진다고 자료에 나와 있습니다.",
    evidence: "표본 크기가 커질수록 표본 평균의 표준오차는 작아진다.",
  };
}

describe.skipIf(!runLive)("quiz verifier live", () => {
  it("근거가 명확한 문항은 통과시키고 복수 정답·근거 불일치 문항은 제거한다", async () => {
    const source = [
      "표본 크기가 커질수록 표본 평균의 표준오차는 작아진다.",
      "표본 평균은 모집단 평균의 불편추정량이다.",
    ].join(" ");
    const good = mcq(1, "A", [
      "표본 크기가 커질수록 표준오차가 작아진다.",
      "표본 크기와 표준오차는 관계가 없다.",
      "표본 크기가 커질수록 표준오차가 커진다.",
      "표본 크기가 커지면 모집단 평균이 변한다.",
    ]);
    const twoCorrect = mcq(2, "A", [
      "표본 크기가 커질수록 표준오차가 작아진다.",
      "더 큰 표본에서는 표본 평균의 표준오차가 감소한다.",
      "표본 크기와 표준오차는 항상 같다.",
      "표본 크기가 커지면 모집단 평균도 커진다.",
    ]);
    const unsupported = {
      ...mcq(3, "D", ["1/2", "1/3", "1/4", "1/5"]),
      stem: "표본 크기가 네 배가 될 때 표준오차의 정확한 수치는 얼마인가요?",
      explanation: "자료에 따라 정답은 1/5입니다.",
    };

    const output = await verifyQuizQuestions({
      questions: [good, twoCorrect, unsupported],
      sourceText: source,
    });

    expect(output.technicalFailure).toBe(false);
    expect(output.kept.map((item) => item.id)).toEqual([1]);
    expect(output.dropped.map((item) => item.questionId).sort()).toEqual([2, 3]);
  }, 60_000);
});
