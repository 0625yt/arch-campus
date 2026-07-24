import { describe, expect, it, vi } from "vitest";
import type { GradedQuiz, GradedResult } from "@/lib/services/grade-quiz";

vi.mock("server-only", () => ({}));

import { gradeWithLlmAssist } from "@/lib/services/grade-quiz-llm";

const runLive = process.env.RUN_LLM_EVAL === "1";

function answer(
  questionId: number,
  kind: "short-answer" | "essay",
  submitted: string,
  expected: string,
): GradedResult {
  return {
    questionId,
    kind,
    correct: kind === "essay",
    answer: expected,
    submitted,
    explanation: "자료의 채점 기준과 필수 조건을 비교합니다.",
    evidence:
      "임계 구역 해결은 상호 배제, 진행, 한정 대기를 모두 보장해야 하며 각 조건은 동시 진입 방지, 결정 지연 방지, 무한 대기 방지를 뜻한다.",
    evidencePage: 1,
  };
}

describe.skipIf(!runLive)("quiz grading live", () => {
  it("동의어 단답과 온전한 서술은 인정하고 키워드 나열·반대 설명은 거부한다", async () => {
    const results = [
      answer(1, "short-answer", "normalization", "정규화"),
      answer(
        2,
        "essay",
        "상호 배제는 둘이 동시에 들어가는 것을 막고, 진행은 결정이 미뤄지지 않게 하며, 한정 대기는 특정 프로세스가 계속 기다리지 않도록 보장한다.",
        "핵심 키워드: 상호 배제, 진행, 한정 대기. 각 조건이 동시 진입, 결정 지연, 무한 대기를 어떻게 막는지 설명한다.",
      ),
      answer(
        3,
        "essay",
        "상호 배제 진행 한정 대기",
        "핵심 키워드: 상호 배제, 진행, 한정 대기. 각 조건의 보장 관계를 설명한다.",
      ),
      answer(
        4,
        "essay",
        "상호 배제는 여러 프로세스의 동시 진입을 허용하고 한정 대기는 무한 대기를 만든다.",
        "핵심 키워드: 상호 배제, 진행, 한정 대기. 동시 진입과 무한 대기를 방지하는 관계를 설명한다.",
      ),
    ];
    const graded: GradedQuiz = { score: 3, total: 4, results };
    const questions = results.map((result) => ({
      id: result.questionId,
      kind: result.kind,
      stem:
        result.kind === "short-answer"
          ? "데이터를 일관된 형식으로 만드는 과정을 쓰세요."
          : "임계 구역 해결의 세 조건이 각각 무엇을 보장하는지 설명하세요.",
    }));

    const output = await gradeWithLlmAssist(graded, questions);
    expect(output.llmCalled).toBe(true);
    expect(
      output.results.filter((result) => result.correct).map((result) => result.questionId),
    ).toEqual([1, 2]);
    expect(output.essayGradedCount).toBe(3);
  }, 60_000);
});
