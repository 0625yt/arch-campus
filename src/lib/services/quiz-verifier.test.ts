import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QuizQuestionT } from "@/lib/schemas";

const { generateMock } = vi.hoisted(() => ({ generateMock: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/claude", () => ({ generate: generateMock }));

import { verifyQuizQuestions } from "./quiz-verifier";

const supported = {
  citationSupported: true,
  correctChoiceKeys: ["A"],
  answerSupported: true,
  explanationSupported: true,
};

function question(id: number): QuizQuestionT {
  return {
    id,
    kind: "multiple-choice",
    difficulty: "보통",
    topic: "운영체제",
    stem: `임계 구역 조건을 구분하는 ${id}번 문제로 가장 적절한 것은 무엇인가요?`,
    choices: [
      { key: "A", text: "상호 배제" },
      { key: "B", text: "순환 대기" },
      { key: "C", text: "선점 허용" },
      { key: "D", text: "무한 대기" },
    ],
    answer: "A",
    explanation: "임계 구역에는 상호 배제 조건이 필요하므로 A가 정답입니다.",
    evidence: "임계 구역 해결 조건은 상호 배제, 진행, 한정 대기이다.",
  };
}

describe("verifyQuizQuestions", () => {
  beforeEach(() => {
    generateMock.mockReset();
  });

  it("통과 문항만 남기고 누락된 판정은 안전하게 제거한다", async () => {
    generateMock.mockResolvedValue({
      text: JSON.stringify({
        verdicts: [
          { ...supported, questionId: 1, valid: true, reason: "근거가 정답을 직접 지지해요." },
          {
            ...supported,
            questionId: 2,
            valid: false,
            reason: "두 보기가 모두 정답으로 해석돼요.",
          },
          { ...supported, questionId: 999, valid: true, reason: "허용되지 않은 번호예요." },
        ],
      }),
      modelId: "claude-haiku-4-5",
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 },
    });

    const output = await verifyQuizQuestions({
      questions: [question(1), question(2), question(3)],
      sourceText: `앞 문장. ${question(1).evidence} 뒤 문장.`,
    });

    expect(output.kept.map((item) => item.id)).toEqual([1]);
    expect(output.dropped.map((item) => item.questionId)).toEqual([2, 3]);
    expect(output.dropped[1].reason).toContain("누락");
    expect(output.technicalFailure).toBe(false);
  });

  it("검수 응답 형식이 깨지면 미검증 문항을 모두 보류한다", async () => {
    generateMock.mockResolvedValue({ text: "broken" });
    const input = [question(1)];
    const output = await verifyQuizQuestions({ questions: input, sourceText: input[0].evidence });

    expect(output.kept).toEqual([]);
    expect(output.dropped).toEqual([
      expect.objectContaining({ questionId: 1, reason: expect.stringContaining("저장하지 않음") }),
    ]);
    expect(output.technicalFailure).toBe(true);
    expect(output.modelId).toBeNull();
  });

  it("valid=true여도 직접 푼 답이 다르거나 복수 정답이면 제거한다", async () => {
    generateMock.mockResolvedValue({
      text: JSON.stringify({
        verdicts: [
          {
            ...supported,
            questionId: 1,
            valid: true,
            correctChoiceKeys: ["B"],
            reason: "생성 답이 잘못됐어요.",
          },
          {
            ...supported,
            questionId: 2,
            valid: true,
            correctChoiceKeys: ["A", "B"],
            reason: "둘 다 맞는 보기예요.",
          },
          {
            ...supported,
            questionId: 3,
            valid: true,
            explanationSupported: false,
            reason: "해설에 외부 사실이 있어요.",
          },
        ],
      }),
      modelId: "fixture",
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 },
    });
    const output = await verifyQuizQuestions({
      questions: [question(1), question(2), question(3)],
      sourceText: question(1).evidence,
    });
    expect(output.kept).toEqual([]);
    expect(output.dropped).toHaveLength(3);
  });

  it("중복된 판정에서 처음의 통과 결과를 믿지 않는다", async () => {
    generateMock.mockResolvedValue({
      text: JSON.stringify({
        verdicts: [
          { ...supported, questionId: 1, valid: true, reason: "근거가 충분해요." },
          { ...supported, questionId: 1, valid: false, reason: "근거가 부족해요." },
        ],
      }),
      modelId: "fixture",
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 },
    });
    const output = await verifyQuizQuestions({
      questions: [question(1)],
      sourceText: question(1).evidence,
    });
    expect(output.kept).toEqual([]);
    expect(output.dropped[0].reason).toContain("중복");
  });

  it("원문에 없는 인용은 인용 자체를 자료로 삼아 검수하지 않는다", async () => {
    const output = await verifyQuizQuestions({
      questions: [question(1)],
      sourceText: "관련 없는 다른 자료의 내용입니다.",
    });
    expect(output.kept).toEqual([]);
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("최대 요청보다 많은 후보도 20개씩 검수하고 사용량을 합산한다", async () => {
    generateMock.mockImplementation(async ({ userInput }) => ({
      text: JSON.stringify({
        verdicts: JSON.parse(userInput).items.map((item: { questionId: number }) => ({
          ...supported,
          questionId: item.questionId,
          valid: true,
          reason: "근거로 명확하게 판정됩니다.",
        })),
      }),
      modelId: "fixture",
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 },
    }));
    const output = await verifyQuizQuestions({
      questions: Array.from({ length: 58 }, (_, i) => question(i + 1)),
      sourceText: question(1).evidence,
    });
    expect(output.kept).toHaveLength(58);
    expect(generateMock).toHaveBeenCalledTimes(3);
    expect(output.usage).toMatchObject({ inputTokens: 30, outputTokens: 15 });
    expect(
      generateMock.mock.calls.map(([call]) => JSON.parse(call.userInput).items.length),
    ).toEqual([20, 20, 18]);
  });

  it("정상 형식이 아닌 응답도 이미 사용한 토큰은 보존한다", async () => {
    generateMock.mockResolvedValue({
      text: "broken",
      modelId: "fixture",
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0 },
    });
    const output = await verifyQuizQuestions({
      questions: [question(1)],
      sourceText: question(1).evidence,
    });
    expect(output.technicalFailure).toBe(true);
    expect(output.usage.inputTokens).toBe(10);
  });
});
