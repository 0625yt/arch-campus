import { describe, expect, it } from "vitest";
import type { z } from "zod";
import type { QuizQuestion } from "@/lib/schemas";
import { type Choice, gradeQuiz, type SubmittedAnswer } from "./grade-quiz";

type Question = z.infer<typeof QuizQuestion>;

function mkQ(id: number, answer: Choice, overrides?: Partial<Question>): Question {
  return {
    id,
    difficulty: "보통",
    topic: "샘플",
    stem: `질문 ${id}번입니다 — 이 문장은 정답을 묻습니다.`,
    choices: [
      { key: "A", text: "선택지 A" },
      { key: "B", text: "선택지 B" },
      { key: "C", text: "선택지 C" },
      { key: "D", text: "선택지 D" },
    ],
    answer,
    explanation: "이 문제의 풀이는 이렇습니다 — 본문 어디를 보세요.",
    evidence: "근거 인용",
    evidencePage: 1,
    ...overrides,
  } as Question;
}

describe("gradeQuiz", () => {
  it("정답·오답·미응답을 정확히 채점", () => {
    const questions: Question[] = [mkQ(1, "A"), mkQ(2, "B"), mkQ(3, "C")];
    const answers: SubmittedAnswer[] = [
      { questionId: 1, choice: "A" },
      { questionId: 2, choice: "C" },
      // 3번은 미응답
    ];
    const graded = gradeQuiz(questions, answers);
    expect(graded.score).toBe(1);
    expect(graded.total).toBe(3);
    expect(graded.results).toHaveLength(3);

    const r1 = graded.results[0];
    expect(r1.correct).toBe(true);
    expect(r1.submitted).toBe("A");

    const r2 = graded.results[1];
    expect(r2.correct).toBe(false);
    expect(r2.submitted).toBe("C");
    expect(r2.answer).toBe("B");

    const r3 = graded.results[2];
    expect(r3.correct).toBe(false);
    expect(r3.submitted).toBeNull();
  });

  it("미응답은 'A'로 강제하지 않는다 (regression)", () => {
    // 옛 동작: 미응답을 'A'로 처리해 정답이 'A'면 우연히 정답 처리됨
    const questions: Question[] = [mkQ(1, "A")];
    const graded = gradeQuiz(questions, []);
    expect(graded.score).toBe(0);
    expect(graded.results[0].submitted).toBeNull();
    expect(graded.results[0].correct).toBe(false);
  });

  it("answers에 questions에 없는 id가 와도 무시", () => {
    const questions: Question[] = [mkQ(1, "A")];
    const answers: SubmittedAnswer[] = [
      { questionId: 1, choice: "A" },
      { questionId: 999, choice: "B" },
    ];
    const graded = gradeQuiz(questions, answers);
    expect(graded.total).toBe(1);
    expect(graded.score).toBe(1);
  });

  it("evidence·evidencePage 누락된 question도 안전하게 처리", () => {
    const questions: Question[] = [
      mkQ(1, "B", { evidence: undefined as unknown as string, evidencePage: undefined }),
    ];
    const graded = gradeQuiz(questions, [{ questionId: 1, choice: "B" }]);
    expect(graded.results[0].evidence).toBe("");
    expect(graded.results[0].evidencePage).toBeNull();
  });

  it("단답형은 허용 표현 중 하나와 맞으면 정답 처리", () => {
    const questions: Question[] = [
      mkQ(1, "A", {
        kind: "short-answer",
        choices: null,
        answer: "뮤텍스 | mutex",
      }),
    ];
    const graded = gradeQuiz(questions, [{ questionId: 1, response: "Mutex" }]);
    expect(graded.total).toBe(1);
    expect(graded.score).toBe(1);
    expect(graded.results[0].correct).toBe(true);
  });

  it("서술형은 핵심 포인트를 일정 비율 이상 포함하면 정답 처리", () => {
    const questions: Question[] = [
      mkQ(1, "A", {
        kind: "essay",
        choices: null,
        answer: "핵심 키워드: 상호 배제, 진행, 한정 대기",
      }),
    ];
    const graded = gradeQuiz(questions, [
      { questionId: 1, response: "상호 배제와 진행 조건, 그리고 한정 대기를 설명해야 합니다." },
    ]);
    expect(graded.score).toBe(1);
    expect(graded.results[0].gradingNote).toContain("핵심 포인트");
  });

  it("일본어 단답형 — 중점·공백 차이가 있어도 정답 (사용자 버그 재현)", () => {
    // 정답 "あの & この" (둘 다 써야 정답), 사용자가 "あの・この" (중점 구분) 입력.
    const questions: Question[] = [
      mkQ(1, "A", { kind: "short-answer", choices: null, answer: "あの & この" }),
    ];
    const cases = ["あの・この", "あの ・ この", "あの、この", "この あの", "アノ・コノ"];
    for (const response of cases) {
      const graded = gradeQuiz(questions, [{ questionId: 1, response }]);
      expect(graded.results[0].correct, `"${response}" 가 정답이어야 함`).toBe(true);
      expect(graded.results[0].partial?.matchedParts).toHaveLength(2);
    }
  });

  it("복수 필수답 부분 채점 — 하나만 맞으면 오답이되 맞은/빠진 답을 분리", () => {
    const questions: Question[] = [
      mkQ(1, "A", { kind: "short-answer", choices: null, answer: "あの & この" }),
    ];
    const graded = gradeQuiz(questions, [{ questionId: 1, response: "あの" }]);
    const r = graded.results[0];
    expect(r.correct).toBe(false);
    expect(r.partial?.matchedParts).toEqual(["あの"]);
    expect(r.partial?.missingParts).toEqual(["この"]);
    expect(r.whyWrong).toContain("この");
  });

  it("단답형 오답이면 내 답이 왜 틀렸는지 whyWrong 제공", () => {
    const questions: Question[] = [
      mkQ(1, "A", { kind: "short-answer", choices: null, answer: "정규화" }),
    ];
    const graded = gradeQuiz(questions, [{ questionId: 1, response: "트랜잭션" }]);
    expect(graded.results[0].correct).toBe(false);
    expect(graded.results[0].whyWrong).toContain("트랜잭션");
    expect(graded.results[0].whyWrong).toContain("정규화");
  });

  it("동의어형(|)은 여전히 하나만 맞으면 정답 (회귀 방지)", () => {
    const questions: Question[] = [
      mkQ(1, "A", { kind: "short-answer", choices: null, answer: "임계 구역 | critical section" }),
    ];
    const graded = gradeQuiz(questions, [{ questionId: 1, response: "critical section" }]);
    expect(graded.results[0].correct).toBe(true);
    // 동의어형은 복수 필수답이 아니므로 partial 없음.
    expect(graded.results[0].partial).toBeUndefined();
  });
});
