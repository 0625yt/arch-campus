import { describe, expect, it } from "vitest";
import {
  ChecklistOutput,
  ExamExtractedQuestion,
  ExamSolveOutput,
  evidenceMatches,
  findBannedWords,
  hasWatermark,
  parseModelJson,
  parseQuizModelJson,
  QuizOutput,
  replaceBannedWords,
  SummarizeOutput,
  TimetableOutput,
} from "./schemas";

describe("findBannedWords", () => {
  it("flags 17개 banned words", () => {
    const text = "효과적인 방법으로 다양한 자료를 살펴보겠습니다";
    const hits = findBannedWords(text);
    expect(hits.length).toBeGreaterThanOrEqual(3);
    expect(hits.map((h) => h.word)).toEqual(
      expect.arrayContaining(["효과적인", "다양한", "살펴보겠습니다"]),
    );
  });

  it("returns empty for clean text", () => {
    expect(findBannedWords("좋은 방법으로 여러 자료를 한 번 볼게요")).toEqual([]);
  });
});

describe("replaceBannedWords", () => {
  it("substitutes all banned forms", () => {
    const out = replaceBannedWords("효과적인 학습으로 이를 통해 결론적으로");
    expect(out).not.toMatch(/효과적인|이를 통해|결론적으로/);
    expect(out).toContain("좋은");
  });
});

describe("hasWatermark", () => {
  it("accepts watermark with required prefix", () => {
    expect(hasWatermark({ watermark: "이 자료는 학습 보조용이며 본인이 검토하세요" })).toBe(true);
  });
  it("rejects missing or wrong watermark", () => {
    expect(hasWatermark({})).toBe(false);
    expect(hasWatermark({ watermark: "감사합니다" })).toBe(false);
  });
});

describe("evidenceMatches", () => {
  const material = "임계 구역 문제 해결 조건: 1) 상호 배제 2) 진행 3) 한정 대기";

  it("matches whitespace-normalized substring", () => {
    expect(evidenceMatches(material, "1) 상호 배제 2) 진행")).toBe(true);
    expect(evidenceMatches(material, "1)  상호  배제   2) 진행")).toBe(true);
  });
  it("rejects substrings not present", () => {
    expect(evidenceMatches(material, "Peterson 알고리즘")).toBe(false);
    expect(evidenceMatches(material, "")).toBe(false);
    expect(evidenceMatches(material, "짧음")).toBe(false);
  });
});

describe("SummarizeOutput schema", () => {
  it("accepts valid output", () => {
    const valid = {
      leadSentence: "이 자료는 프로세스 동기화를 다뤄요.",
      blocks: [
        { type: "h2", content: "임계 구역" },
        {
          type: "para",
          content:
            "두 프로세스가 같은 변수를 동시에 건드리면 결과가 꼬여요. 자료 5쪽 예시처럼 카운터 변수를 동시에 증가시킬 때 나타나요.",
        },
        {
          type: "bullets",
          items: ["상호 배제", "진행 조건", "한정 대기"],
        },
        {
          type: "callout",
          tone: "warn",
          content: "임계 구역 진입 전 락을 풀어두면 데드락이 나오니 순서를 꼭 지켜주세요.",
        },
        {
          type: "para",
          content:
            "Peterson 알고리즘은 두 프로세스만 가정한 풀이라 N개 환경에서는 베이커리 같은 일반화 알고리즘이 필요해요.",
        },
      ],
      keywords: ["임계 구역", "상호 배제", "Peterson", "test-and-set", "세마포어"],
      reviewSpots: [{ title: "Peterson", why: "조건 3개 중 2개만 외우는 학생이 많아요." }],
      watermark: "이 자료는 학습 보조용이며 본인 검토 필수",
    };
    expect(SummarizeOutput.parse(valid)).toBeTruthy();
  });

  it("rejects too few blocks", () => {
    expect(() =>
      SummarizeOutput.parse({
        leadSentence: "짧음",
        blocks: [{ type: "h2", content: "x" }],
        keywords: ["a", "b", "c", "d", "e"],
        reviewSpots: [{ title: "ok", why: "이유가 길게 적혀있어요" }],
        watermark: "이 자료는 학습 보조용이며",
      }),
    ).toThrow();
  });
});

describe("QuizOutput rejected branch", () => {
  it("accepts external-source rejection payload", () => {
    const rejected = {
      questions: [],
      rejected: true,
      reason: "외부 기출 문제집으로 보여요. 본인 자료를 올려주세요.",
      watermark: "이 자료는 학습 보조용이며",
    };
    expect(QuizOutput.parse(rejected)).toBeTruthy();
  });
});

describe("QuizOutput choices normalization", () => {
  const base = {
    id: 1,
    kind: "short-answer" as const,
    difficulty: "보통" as const,
    topic: "용어",
    stem: "자료에서 설명한 핵심 용어의 이름을 정확히 쓰세요.",
    answer: "상호 배제",
    explanation: "자료에서 한 번에 한 프로세스만 진입할 수 있다고 설명한 조건입니다.",
    evidence: "상호 배제는 한 프로세스만 임계 구역에 진입하도록 보장한다.",
  };

  it("비객관식의 빈 choices 배열을 null로 정규화한다", () => {
    const parsed = QuizOutput.parse({
      questions: [{ ...base, choices: [] }],
      watermark: "이 자료는 학습 보조용이며 직접 검토하세요.",
    });
    expect(parsed.rejected).not.toBe(true);
    if (!parsed.rejected) expect(parsed.questions[0].choices).toBeNull();
  });

  it("1~3개짜리 깨진 choices 배열은 여전히 거부한다", () => {
    expect(() =>
      QuizOutput.parse({
        questions: [{ ...base, choices: [{ key: "A", text: "보기 하나" }] }],
        watermark: "이 자료는 학습 보조용이며 직접 검토하세요.",
      }),
    ).toThrow();
  });

  it("모델의 kind 별칭과 외국어 난이도 라벨을 안전하게 정규화한다", () => {
    const parsed = QuizOutput.parse({
      questions: [{ ...base, kind: "short_answer", difficulty: "medium", choices: [] }],
      watermark: "이 자료는 학습 보조용이며 직접 검토하세요.",
    });
    expect(parsed.rejected).not.toBe(true);
    if (!parsed.rejected) {
      expect(parsed.questions[0].kind).toBe("short-answer");
      expect(parsed.questions[0].difficulty).toBe("보통");
    }
  });

  it("한 문제 형식이 깨져도 같은 응답의 정상 문제는 보존한다", () => {
    const parsed = parseQuizModelJson(
      JSON.stringify({
        questions: [
          { ...base, choices: [] },
          { ...base, id: 2, stem: "짧음", choices: [] },
        ],
        watermark: "이 자료는 학습 보조용이며 직접 검토하세요.",
      }),
    );
    expect(parsed.output.rejected).not.toBe(true);
    if (!parsed.output.rejected) expect(parsed.output.questions).toHaveLength(1);
    expect(parsed.invalidQuestions).toHaveLength(1);
  });
});

describe("ExamExtractedQuestion answerSource", () => {
  const base = {
    id: 1,
    kind: "short-answer" as const,
    stem: "go의 과거형은?",
    answer: "went",
    explanation: null,
    sourcePageNum: null,
    sourceQuote: "go의 과거형은?",
  };

  it("answerSource 미지정이면 기존 데이터 호환을 위해 material로 채움", () => {
    const parsed = ExamExtractedQuestion.parse(base);
    expect(parsed.answerSource).toBe("material");
  });

  it("answerSource=ai를 받아들임 (exam-solve가 채운 추정 정답)", () => {
    const parsed = ExamExtractedQuestion.parse({ ...base, answerSource: "ai" });
    expect(parsed.answerSource).toBe("ai");
  });

  it("material·ai 외 값은 거부", () => {
    expect(() => ExamExtractedQuestion.parse({ ...base, answerSource: "guess" })).toThrow();
  });
});

describe("TimetableOutput model tolerance", () => {
  it("시간 미상 null 슬롯은 응답 전체 대신 해당 슬롯만 후처리할 수 있게 보존한다", () => {
    const parsed = TimetableOutput.parse({
      courses: [
        {
          name: "온라인 강의",
          slots: [{ weekday: "FRI", startTime: null, endTime: null }],
          confidence: 0.6,
        },
      ],
      watermark: "이 자료는 학습 보조용이며 직접 확인해야 합니다.",
    });

    expect(parsed.courses[0].slots[0]).toMatchObject({ startTime: "", endTime: "" });
  });
});

describe("ExamSolveOutput schema", () => {
  it("정상 풀이 결과를 파싱하고 confidence default 0.5", () => {
    const parsed = ExamSolveOutput.parse({
      answers: [{ id: 7, answer: "B", explanation: "과거시제라 approved.", confidence: 0.9 }],
      watermark: "이 자료는 학습 보조용이며, AI가 추정한 답이라 반드시 본인이 검토·확인하세요.",
    });
    expect(parsed.answers[0].id).toBe(7);
    expect(parsed.answers).toHaveLength(1);

    const noConf = ExamSolveOutput.parse({
      answers: [{ id: 1, answer: null, explanation: null }],
      watermark: "이 자료는 학습 보조용이며 ...",
    });
    expect(noConf.answers[0].confidence).toBe(0.5);
  });

  it("answers 빈 배열도 허용 (다 못 푼 경우)", () => {
    const parsed = ExamSolveOutput.parse({
      answers: [],
      watermark: "이 자료는 학습 보조용이며 ...",
    });
    expect(parsed.answers).toHaveLength(0);
  });

  it("confidence 범위(0~1) 밖이면 거부", () => {
    expect(() =>
      ExamSolveOutput.parse({
        answers: [{ id: 1, answer: "A", explanation: "근거 설명", confidence: 1.5 }],
        watermark: "이 자료는 학습 보조용이며 ...",
      }),
    ).toThrow();
  });
});

describe("ChecklistOutput schema", () => {
  const validRequirement = {
    title: "본문 4쪽 ±0.5쪽 (제목·참고문헌 제외)",
    category: "분량" as const,
    weight: "high" as const,
    quote: "본문 4쪽 내외 (제목·참고문헌 제외)",
    why: "분량 초과·미달은 즉시 감점. 글자 크기·줄간격까지 같이 확인.",
  };

  it("accepts valid output", () => {
    const output = {
      headline: "운영체제 1차 리포트 — 4쪽 내외, 5/22 23:59 LMS PDF",
      topRisks: ["분량 4쪽 ±0.5쪽", "LMS PDF 한정", "5/22 23:59 마감"],
      requirements: [
        validRequirement,
        { ...validRequirement, title: "Chicago 인용 5개 이상", category: "참고문헌" as const },
        { ...validRequirement, title: "LMS PDF 업로드", category: "제출방식" as const },
      ],
      selfQuestions: [
        "내가 고른 동기화 알고리즘은 무엇인가요?",
        "참고문헌 5개를 본문에서 인용했나요?",
        "PDF로 변환한 뒤 글자 깨짐을 확인했나요?",
      ],
      watermark: "이 자료는 학습 보조용이며 본인이 공지 원문을 확인해야 해요",
    };
    expect(ChecklistOutput.parse(output)).toBeTruthy();
  });

  it("rejects requirements under min count", () => {
    expect(() =>
      ChecklistOutput.parse({
        headline: "헤드라인이 충분히 길게 적혀있어요",
        topRisks: ["risk a 충분히 길게", "risk b 충분히 길게"],
        requirements: [validRequirement],
        selfQuestions: [
          "질문 1 충분히 길게 적혀있어요",
          "질문 2 충분히 길게 적혀있어요",
          "질문 3 충분히 길게 적혀있어요",
        ],
        watermark: "이 자료는 학습 보조용이며",
      }),
    ).toThrow();
  });

  it("accepts rejected branch", () => {
    expect(
      ChecklistOutput.parse({
        rejected: true,
        reason: "공지 본문이 비어있어 요구사항을 추출할 수 없어요. 다시 붙여주세요.",
        watermark: "이 자료는 학습 보조용이며",
      }),
    ).toBeTruthy();
  });
});

describe("parseModelJson", () => {
  it("strips markdown fence", () => {
    const raw = '```json\n{"watermark":"이 자료는 학습 보조용이며"}\n```';
    const schema = SummarizeOutput.pick({ watermark: true });
    expect(parseModelJson(schema, raw)).toEqual({ watermark: "이 자료는 학습 보조용이며" });
  });

  it("handles fence with no closing (max_tokens truncation case)", () => {
    const raw = '```json\n{"watermark":"이 자료는 학습 보조용이며"}';
    const schema = SummarizeOutput.pick({ watermark: true });
    expect(parseModelJson(schema, raw)).toEqual({ watermark: "이 자료는 학습 보조용이며" });
  });

  it("handles bare JSON without fence", () => {
    const raw = '{"watermark":"이 자료는 학습 보조용이며"}';
    const schema = SummarizeOutput.pick({ watermark: true });
    expect(parseModelJson(schema, raw)).toEqual({ watermark: "이 자료는 학습 보조용이며" });
  });
});
