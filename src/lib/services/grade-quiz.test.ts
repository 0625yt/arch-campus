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

  // ── 일본어 표기 변형 (피드백: "정답인데 틀렸다고 함") ──
  // 순수 함수는 가타카나↔히라가나만 자동 변환한다. 한자↔가나는 못 하므로,
  // 프롬프트가 정답에 한자 표기를 |로 병기해야 잡힌다(아래 회귀 테스트로 고정).

  it("가타카나로 쓴 답을 히라가나 정답에 매칭 (자동 변환)", () => {
    const questions: Question[] = [
      mkQ(1, "A", { kind: "short-answer", choices: null, answer: "がっこう" }),
    ];
    // 학생이 가타카나로 ガッコウ를 써도 음이 같으므로 정답.
    const graded = gradeQuiz(questions, [{ questionId: 1, response: "ガッコウ" }]);
    expect(graded.results[0].correct).toBe(true);
  });

  it("정답에 한자를 |로 병기하면 한자로 쓴 답도 정답 (Q1·Q12 수정)", () => {
    const questions: Question[] = [
      // 프롬프트 보강의 결과물: 가나 + 한자 동의어 병기.
      mkQ(1, "A", { kind: "short-answer", choices: null, answer: "がっこう | 学校" }),
    ];
    expect(gradeQuiz(questions, [{ questionId: 1, response: "学校" }]).results[0].correct).toBe(
      true,
    );
    expect(gradeQuiz(questions, [{ questionId: 1, response: "がっこう" }]).results[0].correct).toBe(
      true,
    );
  });

  it("혼합표기(けしゴム) 정답에 가나·한자 변형을 병기하면 다 정답 (Q11 수정)", () => {
    const questions: Question[] = [
      mkQ(1, "A", {
        kind: "short-answer",
        choices: null,
        answer: "けしゴム | けしごむ | 消しゴム",
      }),
    ];
    // けしゴム(원형) · けしごむ(전부 히라가나) · ケシゴム(전부 가타카나·자동변환) · 消しゴム(한자)
    for (const response of ["けしゴム", "けしごむ", "ケシゴム", "消しゴム"]) {
      expect(gradeQuiz(questions, [{ questionId: 1, response }]).results[0].correct).toBe(true);
    }
  });

  it("촉음 실수(がっこう vs がつこう)는 오답이고, whyWrong이 촉음을 콕 집는다 (피드백: 츠가 뭐가 달라?)", () => {
    const questions: Question[] = [
      mkQ(1, "A", { kind: "short-answer", choices: null, answer: "がっこう" }),
    ];
    const r = gradeQuiz(questions, [{ questionId: 1, response: "がつこう" }]).results[0];
    // 작은 っ ≠ 큰 つ — 오답이 맞다.
    expect(r.correct).toBe(false);
    // "표기를 맞춰보세요" 같은 막연한 안내가 아니라 촉음을 짚어야 한다.
    expect(r.whyWrong).toContain("촉음");
    expect(r.whyWrong).not.toContain("표기·철자를 자료와 맞춰");
  });

  it('"두 개 쓰세요"는 &로 만들어야 채점이 stem 의도와 맞는다 (Q2 수정)', () => {
    // OR(|)의 문제: "둘 다 쓰세요"인데 하나만 써도 정답 → stem 의도와 어긋난다.
    // (게다가 부분 매칭이 관대해 둘 다 써도 정답으로 통과해 구분이 안 된다.)
    const orQ: Question[] = [
      mkQ(1, "A", { kind: "short-answer", choices: null, answer: "どちら | どっち" }),
    ];
    expect(gradeQuiz(orQ, [{ questionId: 1, response: "どちら" }]).results[0].correct).toBe(true);
    expect(gradeQuiz(orQ, [{ questionId: 1, response: "どちら" }]).results[0].partial).toBeUndefined();

    // AND(&) 수정 형태: 둘 다 써야 정답, 하나만 쓰면 오답 + 부분 채점으로 "뭘 빠뜨렸는지" 노출.
    const andQ: Question[] = [
      mkQ(1, "A", { kind: "short-answer", choices: null, answer: "どちら & どっち" }),
    ];
    // 둘 다 → 정답
    expect(
      gradeQuiz(andQ, [{ questionId: 1, response: "どちら、どっち" }]).results[0].correct,
    ).toBe(true);
    // 하나만 → 오답이되 부분 채점이 동작 (OR과 결정적 차이)
    const partial = gradeQuiz(andQ, [{ questionId: 1, response: "どちら" }]).results[0];
    expect(partial.correct).toBe(false);
    expect(partial.partial?.matchedParts).toContain("どちら");
    expect(partial.partial?.missingParts).toContain("どっち");
  });
});
