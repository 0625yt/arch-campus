import { describe, expect, it } from "vitest";
import { estimateCost, getModelVendor, MODELS } from "./claude";

/**
 * 1M 토큰 = 단가 1단위가 그대로 비용으로 떨어지게 만든 합성 usage.
 * cache 토큰 0으로 두면 input·output 단가만 검증된다.
 */
function unitUsage(input: number, output: number) {
  return {
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };
}

describe("estimateCost — vendor·tier 단가 매트릭스 (2026-05-28 보정 후)", () => {
  it("Sonnet 4.6: 입력 1M = $3, 출력 1M = $15", () => {
    const cost = estimateCost(unitUsage(1_000_000, 1_000_000), MODELS.sonnet);
    expect(cost).toBeCloseTo(3 + 15, 5);
  });

  it("Haiku 4.5 (보정 후): 입력 1M = $1, 출력 1M = $5", () => {
    // 2026-05-28 단가 보정. 이전 PRICING.haiku는 $0.8/$4였음 — ~20% 과소 추정 해소.
    const cost = estimateCost(unitUsage(1_000_000, 1_000_000), MODELS.haiku);
    expect(cost).toBeCloseTo(1 + 5, 5);
  });

  it("Gemini 2.5 Flash: 입력 1M = $0.30, 출력 1M = $2.50", () => {
    const cost = estimateCost(unitUsage(1_000_000, 1_000_000), MODELS.geminiFlash);
    expect(cost).toBeCloseTo(0.3 + 2.5, 5);
  });

  it("Gemini Flash 비용은 Sonnet 4.6의 1/5 이하 (퀴즈 전환 동기)", () => {
    const sonnetCost = estimateCost(unitUsage(22_000, 6_000), MODELS.sonnet);
    const flashCost = estimateCost(unitUsage(22_000, 6_000), MODELS.geminiFlash);
    expect(flashCost).toBeLessThan(sonnetCost / 5);
  });

  it("Anthropic 캐시 토큰 (read·creation) 단가도 분기", () => {
    const usage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1_000_000,
      cacheCreationTokens: 1_000_000,
    };
    // Sonnet: cacheRead $0.30, cacheWrite $6
    expect(estimateCost(usage, MODELS.sonnet)).toBeCloseTo(0.3 + 6, 5);
    // Haiku: cacheRead $0.10, cacheWrite $2 (보정 후)
    expect(estimateCost(usage, MODELS.haiku)).toBeCloseTo(0.1 + 2, 5);
  });

  it("Gemini는 캐시 컬럼 0 처리 — 캐시 토큰만 있으면 비용 0", () => {
    const usage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 1_000_000,
      cacheCreationTokens: 1_000_000,
    };
    // Gemini는 명시 캐시 API 안 쓰는 한 cache 단가 0. 추후 도입 시 별도 보정.
    expect(estimateCost(usage, MODELS.geminiFlash)).toBeCloseTo(0, 5);
  });

  it("미인식 슬러그는 Sonnet 단가로 보수적 fallback", () => {
    const cost = estimateCost(unitUsage(1_000_000, 0), "unknown/model-9");
    expect(cost).toBeCloseTo(3, 5);
  });
});

describe("getModelVendor — 슬러그 prefix 분기", () => {
  it("anthropic prefix → anthropic", () => {
    expect(getModelVendor("anthropic/claude-sonnet-4.6")).toBe("anthropic");
    expect(getModelVendor("anthropic/claude-haiku-4.5")).toBe("anthropic");
  });

  it("google prefix → google", () => {
    expect(getModelVendor("google/gemini-2.5-flash")).toBe("google");
  });

  it("prefix 없는 레거시 표기도 키워드로 추정", () => {
    // 레거시·외부 API에서 흘러오는 fallback. 일치 안 하면 anthropic으로 폴백 (보수적).
    expect(getModelVendor("gemini-1.5-pro")).toBe("google");
    expect(getModelVendor("claude-3-haiku")).toBe("anthropic");
  });

  it("MODELS 객체의 모든 슬러그는 정확히 vendor 분기", () => {
    expect(getModelVendor(MODELS.sonnet)).toBe("anthropic");
    expect(getModelVendor(MODELS.haiku)).toBe("anthropic");
    expect(getModelVendor(MODELS.geminiFlash)).toBe("google");
  });
});
