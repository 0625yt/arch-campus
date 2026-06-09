import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getModelIdFor, MODELS } from "./claude";

/**
 * resolveModel은 internal이라 직접 테스트할 수 없음 — getModelIdFor로 동일한 코드 경로 통과한다.
 *
 * 검증 핵심 (2026-05-28 vendor 분기 도입):
 *   - 기본은 anthropic (env 안 켜면 기존 동작 100% 유지)
 *   - *_MODEL_VENDOR=google → 해당 도구만 Gemini Flash로
 *   - vendor 분기가 tier override(QUIZ_MODEL=haiku)보다 우선 (1층 위)
 *   - 한 도구의 vendor 플래그가 다른 도구에 영향 X
 */
describe("resolveModel — vendor 분기 (via getModelIdFor)", () => {
  const ENV_KEYS = [
    "LLM_VENDOR",
    "QUIZ_MODEL_VENDOR",
    "SUMMARY_MODEL_VENDOR",
    "CHAT_MODEL_VENDOR",
    "QUIZ_MODEL",
    "EXTRACT_MODEL",
    "SYLLABUS_MODEL",
    "CHAT_MODEL",
    "CHAT_FREE_MODEL",
    // prod 차단 가드 — 테스트 누수 방지용
    "VERCEL_ENV",
    "NEXT_PUBLIC_VERCEL_ENV",
  ] as const;

  // 매 테스트마다 깨끗한 env로 시작. 다른 테스트가 누수시킨 값을 격리.
  beforeEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
  });
  afterEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
  });

  it("env 안 켜면 quiz는 Sonnet (기존 동작)", () => {
    expect(getModelIdFor("quiz")).toBe(MODELS.sonnet);
  });

  describe("LLM_VENDOR=google 전역 스위치 (2026-06-06 전면 Gemini 전환)", () => {
    it("생성·Vision 도구는 Gemini Pro로 (prod 포함)", () => {
      process.env.LLM_VENDOR = "google";
      process.env.VERCEL_ENV = "production";
      expect(getModelIdFor("quiz")).toBe(MODELS.geminiPro);
      expect(getModelIdFor("presentation")).toBe(MODELS.geminiPro);
      expect(getModelIdFor("timetable-extract")).toBe(MODELS.geminiPro);
    });

    it("고빈도·저비용 도구는 Gemini Flash로", () => {
      process.env.LLM_VENDOR = "google";
      expect(getModelIdFor("chat")).toBe(MODELS.geminiFlash);
      expect(getModelIdFor("event-parse")).toBe(MODELS.geminiFlash);
      expect(getModelIdFor("summarize")).toBe(MODELS.geminiFlash);
      // exam-extract는 "본문 그대로 전사"라 추론 불필요 → Flash로 비용 1/4 (2026-06-09).
      expect(getModelIdFor("exam-extract")).toBe(MODELS.geminiFlash);
    });

    it("gemini 별칭도 동작", () => {
      process.env.LLM_VENDOR = "gemini";
      expect(getModelIdFor("quiz")).toBe(MODELS.geminiPro);
    });

    it("도구별 *_MODEL_VENDOR=anthropic으로 그 도구만 Anthropic 유지", () => {
      process.env.LLM_VENDOR = "google";
      process.env.QUIZ_MODEL_VENDOR = "anthropic";
      // quiz만 다시 Anthropic(비-prod 기본 Sonnet), 나머지는 Gemini 유지
      expect(getModelIdFor("quiz")).toBe(MODELS.sonnet);
      expect(getModelIdFor("presentation")).toBe(MODELS.geminiPro);
    });

    it("LLM_VENDOR 미설정이면 기존 라우팅 그대로 (quiz=Sonnet)", () => {
      expect(getModelIdFor("quiz")).toBe(MODELS.sonnet);
    });
  });

  it("env 안 켜면 summarize는 Gemini Flash (2026-05-31 결정: prod 포함 기본)", () => {
    expect(getModelIdFor("summarize")).toBe(MODELS.geminiFlash);
  });

  it("SUMMARY_MODEL_VENDOR=anthropic으로 강제하면 Haiku", () => {
    process.env.SUMMARY_MODEL_VENDOR = "anthropic";
    expect(getModelIdFor("summarize")).toBe(MODELS.haiku);
  });

  it("QUIZ_MODEL_VENDOR=google → quiz만 Gemini Flash", () => {
    process.env.QUIZ_MODEL_VENDOR = "google";
    expect(getModelIdFor("quiz")).toBe(MODELS.geminiFlash);
    // summarize는 기본 Gemini, presentation은 Sonnet 그대로
    expect(getModelIdFor("summarize")).toBe(MODELS.geminiFlash);
    expect(getModelIdFor("presentation")).toBe(MODELS.sonnet);
  });

  it("QUIZ_MODEL_VENDOR=gemini도 같은 의미 (별칭)", () => {
    process.env.QUIZ_MODEL_VENDOR = "gemini";
    expect(getModelIdFor("quiz")).toBe(MODELS.geminiFlash);
  });

  it("대소문자 무관", () => {
    process.env.QUIZ_MODEL_VENDOR = "Google";
    expect(getModelIdFor("quiz")).toBe(MODELS.geminiFlash);
    process.env.QUIZ_MODEL_VENDOR = "GEMINI";
    expect(getModelIdFor("quiz")).toBe(MODELS.geminiFlash);
  });

  it("SUMMARY_MODEL_VENDOR=google → summarize는 Gemini (이미 기본)", () => {
    process.env.SUMMARY_MODEL_VENDOR = "google";
    expect(getModelIdFor("summarize")).toBe(MODELS.geminiFlash);
    // quiz는 영향 X
    expect(getModelIdFor("quiz")).toBe(MODELS.sonnet);
  });

  it("vendor 플래그가 tier override보다 우선 — QUIZ_MODEL_VENDOR=google + QUIZ_MODEL=haiku", () => {
    process.env.QUIZ_MODEL_VENDOR = "google";
    process.env.QUIZ_MODEL = "haiku";
    expect(getModelIdFor("quiz")).toBe(MODELS.geminiFlash);
  });

  it("vendor 플래그 OFF + tier override → tier override 그대로 동작", () => {
    process.env.QUIZ_MODEL = "haiku";
    expect(getModelIdFor("quiz")).toBe(MODELS.haiku);
    process.env.QUIZ_MODEL = "sonnet";
    expect(getModelIdFor("quiz")).toBe(MODELS.sonnet);
  });

  it("빈 문자열·잡값은 anthropic 유지 (안전한 기본값)", () => {
    process.env.QUIZ_MODEL_VENDOR = "";
    expect(getModelIdFor("quiz")).toBe(MODELS.sonnet);
    process.env.QUIZ_MODEL_VENDOR = "openai"; // 미지원 vendor
    expect(getModelIdFor("quiz")).toBe(MODELS.sonnet);
  });

  it("vendor 플래그가 안 걸린 도구는 영향 X — chat은 항상 Anthropic 라우팅", () => {
    process.env.QUIZ_MODEL_VENDOR = "google";
    // summarize는 어차피 기본 Gemini라 SUMMARY_MODEL_VENDOR=google 의미 없음
    expect(getModelIdFor("chat")).toBe(MODELS.haiku);
    expect(getModelIdFor("chat-free")).toBe(MODELS.haiku);
  });

  // 2026-05-28 — vendor 플래그는 prod에서 무시(A/B 검증 끝나기 전까지).
  // dev/preview는 그대로 동작.
  it("VERCEL_ENV=production이면 QUIZ_MODEL_VENDOR=google 무시", () => {
    process.env.VERCEL_ENV = "production";
    process.env.QUIZ_MODEL_VENDOR = "google";
    expect(getModelIdFor("quiz")).toBe(MODELS.sonnet);
  });

  it("VERCEL_ENV=production이어도 summarize는 Gemini Flash (2026-05-31 결정)", () => {
    process.env.VERCEL_ENV = "production";
    expect(getModelIdFor("summarize")).toBe(MODELS.geminiFlash);
  });

  it("VERCEL_ENV=production에서도 SUMMARY_MODEL_VENDOR=anthropic이면 Haiku로 복귀", () => {
    process.env.VERCEL_ENV = "production";
    process.env.SUMMARY_MODEL_VENDOR = "anthropic";
    expect(getModelIdFor("summarize")).toBe(MODELS.haiku);
  });

  it("VERCEL_ENV=preview면 vendor 플래그 정상 동작", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.QUIZ_MODEL_VENDOR = "google";
    expect(getModelIdFor("quiz")).toBe(MODELS.geminiFlash);
  });

  it("기존 tier override들 모두 보존 — syllabus·exam·chat", () => {
    process.env.SYLLABUS_MODEL = "haiku";
    expect(getModelIdFor("syllabus-extract")).toBe(MODELS.haiku);
    process.env.EXTRACT_MODEL = "sonnet";
    expect(getModelIdFor("exam-extract")).toBe(MODELS.sonnet);
    process.env.CHAT_MODEL = "sonnet";
    expect(getModelIdFor("chat")).toBe(MODELS.sonnet);
    process.env.CHAT_FREE_MODEL = "sonnet";
    expect(getModelIdFor("chat-free")).toBe(MODELS.sonnet);
  });
});
