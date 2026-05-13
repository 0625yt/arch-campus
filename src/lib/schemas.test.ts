import { describe, expect, it } from "vitest";
import {
  ChecklistOutput,
  evidenceMatches,
  findBannedWords,
  hasWatermark,
  parseModelJson,
  QuizOutput,
  replaceBannedWords,
  SummarizeOutput,
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
