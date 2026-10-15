import { describe, expect, it } from "vitest";
import type { QuizQuestionT } from "@/lib/schemas";
import { gradeQuiz } from "@/lib/services/grade-quiz";
import { gradeWithLlmAssist } from "@/lib/services/grade-quiz-llm";

const cases = [
  {
    stem: "상대 모듈에 플래그를 전달해 흐름을 지시하는 결합도를 쓰세요.",
    answer: "제어 결합도 | Control",
    submitted: "제어",
    expected: true,
    evidence: "제어 결합도는 플래그로 상대 모듈의 처리 흐름을 지시한다.",
  },
  {
    stem: "기본키의 NULL을 금지하는 무결성 제약의 명칭을 쓰세요.",
    answer: "개체 무결성",
    submitted: "무결성",
    expected: false,
    evidence: "개체 무결성은 기본키가 유일하고 NULL이 아님을 요구한다.",
  },
  {
    stem: "운영체제의 영어 표현을 쓰세요.",
    answer: "OS",
    submitted: "Operating System",
    expected: true,
    evidence: "OS(Operating System)는 운영체제의 영문 표현이다.",
  },
  {
    stem: "표본 비율 1/2을 같은 값으로 나타내세요.",
    answer: "1/2",
    submitted: "0.5",
    expected: true,
    evidence: "비율은 전체의 절반으로 1/2 또는 0.5이다.",
  },
  {
    stem: "표본 비율 1/2을 같은 값으로 나타내세요.",
    answer: "1/2",
    submitted: "1",
    expected: false,
    evidence: "비율은 전체의 절반으로 1/2 또는 0.5이다.",
  },
  {
    stem: "문서에 제시된 길이 1m를 쓰세요.",
    answer: "1 m",
    submitted: "100 cm",
    expected: true,
    evidence: "문서에 제시된 길이는 1m(100cm)이다.",
  },
  {
    stem: "문서에 제시된 길이 1m를 쓰세요.",
    answer: "1 m",
    submitted: "1 s",
    expected: false,
    evidence: "문서에 제시된 길이는 1m(100cm)이다.",
  },
  {
    stem: "学校를 히라가나로 쓰세요.",
    answer: "がっこう",
    submitted: "がつこう",
    expected: false,
    evidence: "学校의 히라가나 표기는 がっこう로 작은 っ가 들어간다.",
  },
  {
    stem: "고무의 일본어 표현을 쓰세요. 표기는 제한하지 않습니다.",
    answer: "ゴム",
    submitted: "ごむ",
    expected: true,
    evidence: "ゴム는 고무를 뜻한다.",
  },
  {
    stem: "고무를 가타카나로 쓰세요.",
    answer: "ゴム",
    submitted: "ごむ",
    expected: false,
    evidence: "고무는 가타카나로 ゴム라고 쓴다.",
  },
  {
    stem: "임계구역 해결의 세 조건과 각각의 보장 관계를 설명하세요.",
    kind: "essay",
    answer:
      "상호 배제: 동시 진입 방지; 진행: 빈 구역의 진입 결정 무한 지연 방지; 한정 대기: 요청 후 다른 프로세스 진입 횟수 상한",
    submitted:
      "여러 프로세스가 한꺼번에 들어가지 못해야 하고, 비어 있을 때 들어가려는 프로세스가 있으면 결정을 끝없이 미루지 않아야 합니다. 요청한 뒤 다른 프로세스가 먼저 들어갈 수 있는 횟수에도 한도가 있어야 합니다.",
    expected: true,
    evidence:
      "상호 배제는 동시 진입 방지, 진행은 빈 임계구역의 진입 결정 무한 지연 방지, 한정 대기는 요청 후 다른 프로세스 진입 횟수의 상한을 보장한다.",
  },
  {
    stem: "임계구역 해결의 세 조건과 각각의 보장 관계를 설명하세요.",
    kind: "essay",
    answer:
      "상호 배제: 동시 진입 방지; 진행: 빈 구역의 진입 결정 무한 지연 방지; 한정 대기: 요청 후 다른 프로세스 진입 횟수 상한",
    submitted: "상호 배제, 진행, 한정 대기",
    expected: false,
    evidence:
      "각 조건의 보장 관계까지 설명해야 한다. 상호 배제는 동시 진입 방지, 진행은 결정 무한 지연 방지, 한정 대기는 요청 후 선행 진입 횟수 상한이다.",
  },
  {
    stem: "상호 배제는 어떤 진입을 막는지 설명하세요.",
    kind: "essay",
    answer: "둘 이상의 프로세스의 같은 임계 구역 동시 진입 방지",
    submitted: "상호 배제는 여러 프로세스가 같은 임계구역에 동시에 들어가는 것을 허용합니다.",
    expected: false,
    evidence: "상호 배제는 둘 이상이 같은 임계 구역에 동시에 진입하지 못하게 한다.",
  },
  {
    stem: "임계구역 해결 조건 세 가지를 모두 쓰세요.",
    answer: "상호 배제 & 진행 & 한정 대기",
    submitted: "mutual exclusion, progress, bounded waiting",
    expected: true,
    evidence:
      "상호 배제(mutual exclusion), 진행(progress), 한정 대기(bounded waiting)를 모두 보장한다.",
  },
  {
    stem: "임계구역 해결 조건 세 가지를 모두 쓰세요.",
    answer: "상호 배제 & 진행 & 한정 대기",
    submitted: "상호 배제와 진행",
    expected: false,
    evidence: "상호 배제, 진행, 한정 대기를 모두 보장한다.",
  },
] as const;

describe.skipIf(process.env.RUN_GRADING_QUALITY_EVAL !== "1")("grading quality", () => {
  it("accepts equivalent answers and rejects wrong concepts, missing criteria and negation", async () => {
    const questions = cases.map(
      (c, i): QuizQuestionT => ({
        id: i + 1,
        kind: "kind" in c ? c.kind : "short-answer",
        difficulty: "보통",
        topic: "채점 품질",
        stem: c.stem,
        answer: c.answer,
        evidence: c.evidence,
        evidencePage: null,
        choices: null,
        explanation: "요구한 개념과 관계를 원문에 따라 확인합니다.",
      }),
    );
    const graded = gradeQuiz(
      questions,
      cases.map((c, i) => ({ questionId: i + 1, response: c.submitted })),
    );
    const output = await gradeWithLlmAssist(graded, questions);
    for (const [i, c] of cases.entries())
      expect.soft(output.results[i].correct, `case ${i + 1}: ${c.submitted}`).toBe(c.expected);
  }, 120_000);
});
