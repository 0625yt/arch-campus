import { describe, expect, it } from "vitest";
import type { SummarizeOutputT } from "./schemas";
import { groundSummaryCitations } from "./summary-grounding";

const quote = "표본 크기가 커지면 표준오차는 감소한다.";
function summary(sourceQuote: string | null): SummarizeOutputT {
  return {
    leadSentence: "표본 크기와 표준오차의 관계를 정리합니다.",
    blocks: [{ type: "para", content: quote, sourcePage: 99, sourceQuote }],
    keywords: ["표본", "표준오차", "크기"],
    reviewSpots: [],
    watermark: "이 자료는 학습 보조용입니다.",
  };
}
describe("summary citations", () => {
  it("모델 쪽수를 실제 원문 쪽수로 바로잡는다", () => {
    expect(
      groundSummaryCitations(summary(quote), `=== Page 8 ===\n${quote}`).blocks[0].sourcePage,
    ).toBe(8);
  });
  it("알 수 없는 위치와 인용 없는 블록에 가짜 쪽수를 달지 않는다", () => {
    expect(groundSummaryCitations(summary(quote), quote).blocks[0].sourcePage).toBeNull();
    expect(groundSummaryCitations(summary(null), quote).blocks[0].sourcePage).toBeNull();
  });
  it("원문에 없는 인용을 출처로 저장하지 않는다", () => {
    expect(() => groundSummaryCitations(summary(quote), "다른 자료의 본문입니다.")).toThrow(
      "실제 원문",
    );
  });
  it("모델이 합친 줄바꿈과 기호를 실제 원문 인용으로 복원한다", () => {
    const original = "표본 크기가\n커지면 표준오차는 감소한다.";
    const output = groundSummaryCitations(summary(quote), original);
    expect(output.blocks[0].sourceQuote).toBe(original);
    expect(original.includes(output.blocks[0].sourceQuote ?? "")).toBe(true);
  });
});
