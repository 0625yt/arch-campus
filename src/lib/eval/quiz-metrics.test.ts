import { describe, expect, it } from "vitest";
import {
  choicesAreValid,
  compareForPromotion,
  evaluateQuiz,
  evidenceInMaterial,
  koreanRatio,
} from "./quiz-metrics";

describe("koreanRatio", () => {
  it("순수 한국어 문장은 1.0에 가까움", () => {
    expect(koreanRatio("이건 한국어 문장입니다")).toBeGreaterThan(0.95);
  });
  it("순수 영문은 0", () => {
    expect(koreanRatio("This is English only")).toBe(0);
  });
  it("공백·구두점은 분모에서 빠짐 (의미 글자 기준)", () => {
    // "AB" 2글자 모두 영어 → 0
    expect(koreanRatio("A   ,   B")).toBe(0);
  });
  it("빈 문자열은 0 (분모 보호)", () => {
    expect(koreanRatio("")).toBe(0);
  });
});

describe("evidenceInMaterial", () => {
  const material =
    "활성화 함수는 신경망의 비선형성을 부여한다. ReLU는 가장 흔히 쓰이는 활성화 함수다. 시그모이드는 출력층에서 자주 쓰인다.";

  it("그대로 들어있는 문장은 통과", () => {
    expect(evidenceInMaterial("ReLU는 가장 흔히 쓰이는 활성화 함수다", material)).toBe(true);
  });

  it("따옴표·말줄임 정규화 후 매칭", () => {
    expect(evidenceInMaterial('"ReLU는 가장 흔히 쓰이는 활성화 함수다"…', material)).toBe(true);
  });

  it("자료에 없는 문장은 실패 (hallucination 잡기)", () => {
    expect(evidenceInMaterial("ReLU는 1986년에 제안되었다", material)).toBe(false);
  });

  it("너무 짧은 문자열(<8자)은 실패 — 우연 매칭 차단", () => {
    expect(evidenceInMaterial("ReLU", material)).toBe(false);
  });

  it("빈 문자열은 실패", () => {
    expect(evidenceInMaterial("", material)).toBe(false);
  });
});

describe("choicesAreValid", () => {
  const base = {
    id: 1,
    kind: "multiple-choice",
    stem: "X는 무엇인가?",
    answer: "A",
    explanation: "x".repeat(30),
    evidence: "y".repeat(30),
  };

  it("정상 4개·A~D 유일·텍스트 중복 X → 통과", () => {
    expect(
      choicesAreValid({
        ...base,
        choices: [
          { key: "A", text: "가" },
          { key: "B", text: "나" },
          { key: "C", text: "다" },
          { key: "D", text: "라" },
        ],
      }).ok,
    ).toBe(true);
  });

  it("choices 3개면 실패", () => {
    const r = choicesAreValid({
      ...base,
      choices: [
        { key: "A", text: "가" },
        { key: "B", text: "나" },
        { key: "C", text: "다" },
      ] as { key: "A" | "B" | "C" | "D"; text: string }[],
    });
    expect(r.ok).toBe(false);
  });

  it("key 중복(A·A·B·C)이면 실패", () => {
    const r = choicesAreValid({
      ...base,
      choices: [
        { key: "A", text: "가" },
        { key: "A", text: "나" },
        { key: "B", text: "다" },
        { key: "C", text: "라" },
      ],
    });
    expect(r.ok).toBe(false);
  });

  it("text 중복 → 실패", () => {
    const r = choicesAreValid({
      ...base,
      choices: [
        { key: "A", text: "가" },
        { key: "B", text: "가" },
        { key: "C", text: "다" },
        { key: "D", text: "라" },
      ],
    });
    expect(r.ok).toBe(false);
  });

  it("answer가 A~D 형식이 아니면 실패", () => {
    const r = choicesAreValid({
      ...base,
      answer: "E",
      choices: [
        { key: "A", text: "가" },
        { key: "B", text: "나" },
        { key: "C", text: "다" },
        { key: "D", text: "라" },
      ],
    });
    expect(r.ok).toBe(false);
  });

  it("객관식 아니면 자동 통과 (단답·서술)", () => {
    expect(
      choicesAreValid({
        id: 1,
        kind: "short-answer",
        stem: "X 정의를 쓰세요",
        answer: "x".repeat(10),
        explanation: "x".repeat(30),
        evidence: "y".repeat(30),
      }).ok,
    ).toBe(true);
  });
});

describe("evaluateQuiz — 통합", () => {
  const material =
    "활성화 함수는 신경망의 비선형성을 부여한다. ReLU는 가장 흔히 쓰이는 활성화 함수다. 시그모이드는 출력층에서 자주 쓰인다.";

  it("정상 1문제 — evidence 매칭 + 보기 무결성 + 한국어 stem", () => {
    const r = evaluateQuiz({
      materialText: material,
      quiz: {
        questions: [
          {
            id: 1,
            kind: "multiple-choice",
            stem: "활성화 함수의 역할은 무엇인가?",
            choices: [
              { key: "A", text: "비선형성 부여" },
              { key: "B", text: "선형성 확보" },
              { key: "C", text: "메모리 절감" },
              { key: "D", text: "속도 향상" },
            ],
            answer: "A",
            explanation: "활성화 함수는 신경망에 비선형성을 부여하므로 A가 정답이다.",
            evidence: "활성화 함수는 신경망의 비선형성을 부여한다",
          },
        ],
      },
    });
    expect(r.total).toBe(1);
    expect(r.evidenceMatchRate).toBe(1);
    expect(r.choicesIntegrityRate).toBe(1);
    expect(r.schemaIssues).toBe(0);
    expect(r.meanKoreanRatioInStem).toBeGreaterThan(0.95);
  });

  it("hallucination — evidence가 자료에 없으면 매칭률 0", () => {
    const r = evaluateQuiz({
      materialText: material,
      quiz: {
        questions: [
          {
            id: 1,
            kind: "multiple-choice",
            stem: "ReLU는 언제 제안되었는가?",
            choices: [
              { key: "A", text: "1986" },
              { key: "B", text: "2000" },
              { key: "C", text: "2010" },
              { key: "D", text: "2015" },
            ],
            answer: "A",
            explanation: "ReLU는 1986년에 제안된 활성화 함수다.",
            evidence: "ReLU는 1986년에 제안되었다",
          },
        ],
      },
    });
    expect(r.evidenceMatchRate).toBe(0);
    expect(r.notes.some((n) => n.includes("자료 본문에 없음"))).toBe(true);
  });

  it("rejected 응답은 total 0 + rejected flag", () => {
    const r = evaluateQuiz({
      materialText: material,
      quiz: { rejected: true, questions: [] },
    });
    expect(r.rejected).toBe(true);
    expect(r.total).toBe(0);
  });
});

describe("compareForPromotion", () => {
  const passing = {
    total: 10,
    rejected: false,
    evidenceMatchRate: 1,
    choicesIntegrityRate: 1,
    meanKoreanRatioInStem: 0.95,
    schemaIssues: 0,
    notes: [],
  };

  it("baseline·candidate 둘 다 통과 → promote", () => {
    const r = compareForPromotion(passing, passing);
    expect(r.promote).toBe(true);
    expect(r.reasons).toHaveLength(0);
  });

  it("candidate evidence 매칭 90% → 거부", () => {
    const r = compareForPromotion(passing, { ...passing, evidenceMatchRate: 0.9 });
    expect(r.promote).toBe(false);
    expect(r.reasons[0]).toContain("evidence");
  });

  it("candidate 보기 무결성 깨짐 → 거부", () => {
    const r = compareForPromotion(passing, { ...passing, choicesIntegrityRate: 0.8 });
    expect(r.promote).toBe(false);
    expect(r.reasons.some((x) => x.includes("보기 무결성"))).toBe(true);
  });

  it("schemaIssues 1건이면 거부", () => {
    const r = compareForPromotion(passing, { ...passing, schemaIssues: 1 });
    expect(r.promote).toBe(false);
  });

  it("한국어 비율이 baseline의 90% 미만이면 거부", () => {
    const r = compareForPromotion(passing, { ...passing, meanKoreanRatioInStem: 0.5 });
    expect(r.promote).toBe(false);
    expect(r.reasons.some((x) => x.includes("한국어"))).toBe(true);
  });
});
