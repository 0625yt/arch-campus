import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GradedQuiz, GradedResult } from "./grade-quiz";

const { generateMock } = vi.hoisted(() => ({ generateMock: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/claude", () => ({ generate: generateMock }));

import { gradeWithLlmAssist } from "./grade-quiz-llm";

function result(overrides: Partial<GradedResult> = {}): GradedResult {
  return {
    questionId: 1,
    kind: "short-answer",
    correct: false,
    answer: "정규화",
    submitted: "normalization",
    explanation: "자료에서 정규화의 의미를 설명하고 있습니다.",
    evidence: "정규화는 중복을 줄이고 데이터 이상 현상을 방지하는 과정이다.",
    evidencePage: 2,
    whyWrong: "표기가 달라요.",
    ...overrides,
  };
}

function graded(item: GradedResult): GradedQuiz {
  return { score: item.correct ? 1 : 0, total: 1, results: [item] };
}

describe("gradeWithLlmAssist", () => {
  beforeEach(() => generateMock.mockReset());

  it("의미가 같은 단답형 표현만 정답으로 승격한다", async () => {
    generateMock.mockResolvedValue({
      text: JSON.stringify({
        verdicts: [{ questionId: 1, correct: true, reason: "같은 개념의 통용 영문 표현이에요." }],
      }),
    });

    const output = await gradeWithLlmAssist(graded(result()), [
      { id: 1, kind: "short-answer", stem: "데이터를 일관된 형태로 만드는 과정은?" },
    ]);

    expect(output.score).toBe(1);
    expect(output.promotedCount).toBe(1);
    expect(output.results[0]).toMatchObject({ correct: true, llmPromoted: true });
    expect(output.results[0].whyWrong).toBeUndefined();
  });

  it("서술형은 키워드 포함 여부가 아니라 모범답안 논리로 양방향 재판정한다", async () => {
    generateMock.mockResolvedValue({
      text: JSON.stringify({
        verdicts: [
          {
            questionId: 1,
            correct: false,
            reason: "핵심 용어만 나열했고 세 조건의 관계를 설명하지 않았어요.",
          },
        ],
      }),
    });
    const essay = result({
      kind: "essay",
      correct: true,
      answer: "상호 배제, 진행, 한정 대기가 함께 보장되어야 한다.",
      submitted: "상호 배제 진행 한정 대기",
      gradingNote: "핵심 포인트 3개를 챙겼어요.",
    });

    const output = await gradeWithLlmAssist(graded(essay), [
      { id: 1, kind: "essay", stem: "임계 구역 해결 조건을 관계와 함께 설명하세요." },
    ]);

    expect(output.score).toBe(0);
    expect(output.essayGradedCount).toBe(1);
    expect(output.results[0]).toMatchObject({ correct: false, llmGraded: true });
    expect(output.results[0].whyWrong).toContain("관계");
  });

  it("모델 응답이 깨지면 기존 보수적 판정을 유지한다", async () => {
    generateMock.mockResolvedValue({ text: "JSON이 아닌 응답" });
    const input = graded(result());
    const output = await gradeWithLlmAssist(input, [
      { id: 1, kind: "short-answer", stem: "정규화란 무엇인가요?" },
    ]);

    expect(output.score).toBe(0);
    expect(output.results).toEqual(input.results);
    expect(output.llmCalled).toBe(true);
  });

  it("복수 필수답 부분 채점은 모델에 보내지 않는다", async () => {
    const multi = result({
      answer: "상호 배제 & 진행",
      submitted: "상호 배제",
      partial: { matchedParts: ["상호 배제"], missingParts: ["진행"], requiredCount: 2 },
    });
    const output = await gradeWithLlmAssist(graded(multi), [
      { id: 1, kind: "short-answer", stem: "두 조건을 모두 쓰세요." },
    ]);

    expect(generateMock).not.toHaveBeenCalled();
    expect(output.llmCalled).toBe(false);
    expect(output.results[0].correct).toBe(false);
  });

  it("허용하지 않은 문제 번호와 중복 verdict를 무시한다", async () => {
    generateMock.mockResolvedValue({
      text: JSON.stringify({
        verdicts: [
          { questionId: 999, correct: true, reason: "허용되지 않은 번호예요." },
          { questionId: 1, correct: false, reason: "첫 판정만 사용해요." },
          { questionId: 1, correct: true, reason: "중복 판정은 버려요." },
        ],
      }),
    });
    const output = await gradeWithLlmAssist(graded(result()), [
      { id: 1, kind: "short-answer", stem: "정규화란 무엇인가요?" },
    ]);

    expect(output.score).toBe(0);
    expect(output.promotedCount).toBe(0);
  });
});
