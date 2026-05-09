import { describe, expect, it } from "vitest";
import {
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

describe("parseModelJson", () => {
  it("strips markdown fence", () => {
    const raw = '```json\n{"watermark":"이 자료는 학습 보조용이며"}\n```';
    const schema = SummarizeOutput.pick({ watermark: true });
    expect(parseModelJson(schema, raw)).toEqual({ watermark: "이 자료는 학습 보조용이며" });
  });
});
