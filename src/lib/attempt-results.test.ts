import { describe, expect, it } from "vitest";
import type { GradedResult } from "@/lib/services/grade-quiz";
import {
  attemptActivityTime,
  latestQuestionResults,
  mergeAttemptResults,
  reconcileAttemptTotals,
} from "./attempt-results";

function result(questionId: number, correct: boolean, gradedAt?: string): GradedResult {
  return {
    questionId,
    kind: "multiple-choice",
    correct,
    answer: "A",
    submitted: correct ? "A" : "B",
    explanation: "자료의 근거를 확인하는 해설입니다.",
    evidence: "자료에 실제로 있는 충분히 긴 근거 문장입니다.",
    evidencePage: 1,
    gradedAt,
  };
}

describe("mergeAttemptResults", () => {
  it("다시 푼 문제만 최신 판정과 시각으로 교체한다", () => {
    const oldTime = "2026-07-20T01:00:00.000Z";
    const newTime = "2026-07-23T02:00:00.000Z";
    const merged = mergeAttemptResults(
      [result(1, false, oldTime), result(2, false, oldTime)],
      [result(2, true)],
      newTime,
    );

    expect(merged).toEqual([result(1, false, oldTime), result(2, true, newTime)]);
  });

  it("같은 요청에 같은 문제 결과가 여러 번 오면 마지막 판정을 쓴다", () => {
    const time = "2026-07-23T02:00:00.000Z";
    const merged = mergeAttemptResults([], [result(1, false), result(1, true)], time);
    expect(merged).toEqual([result(1, true, time)]);
  });
});

describe("reconcileAttemptTotals", () => {
  it("부분 결과가 있으면 실제 저장된 결과 수와 정답 수를 사용한다", () => {
    expect(reconcileAttemptTotals(1, 10, [result(1, true), result(2, false)])).toEqual({
      score: 1,
      total: 2,
    });
  });

  it("복원할 결과가 없는 오래된 시도는 당시 저장 수치를 유지한다", () => {
    expect(reconcileAttemptTotals(7, 10, [])).toEqual({ score: 7, total: 10 });
  });
});

describe("problem-level activity", () => {
  it("나중에 이어 푼 오래된 attempt가 더 최신이면 그 판정을 사용한다", () => {
    const latest = latestQuestionResults([
      {
        attemptId: "new-attempt",
        quizId: "quiz-1",
        createdAt: "2026-07-22T00:00:00.000Z",
        results: [result(1, false, "2026-07-22T00:00:00.000Z")],
      },
      {
        attemptId: "old-attempt",
        quizId: "quiz-1",
        createdAt: "2026-07-20T00:00:00.000Z",
        results: [result(1, true, "2026-07-23T00:00:00.000Z")],
      },
    ]);

    expect(latest).toHaveLength(1);
    expect(latest[0]).toMatchObject({
      attemptId: "old-attempt",
      attemptedAt: "2026-07-23T00:00:00.000Z",
    });
    expect(latest[0]?.result.correct).toBe(true);
  });

  it("attempt 활동 시각은 결과별 gradedAt 최댓값을 쓰고 없으면 생성 시각으로 폴백한다", () => {
    expect(
      attemptActivityTime("2026-07-20T00:00:00.000Z", [
        result(1, false, "2026-07-21T00:00:00.000Z"),
        result(2, true, "2026-07-23T00:00:00.000Z"),
      ]),
    ).toBe("2026-07-23T00:00:00.000Z");
    expect(attemptActivityTime("2026-07-20T00:00:00.000Z", [])).toBe("2026-07-20T00:00:00.000Z");
  });
});
