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
    "QUIZ_MODEL_VENDOR",
    "SUMMARY_MODEL_VENDOR",
    "QUIZ_MODEL",
    "EXTRACT_MODEL",
    "SYLLABUS_MODEL",
    "CHAT_MODEL",
    "CHAT_FREE_MODEL",
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

  it("env 안 켜면 summarize는 Haiku (기존 동작)", () => {
    expect(getModelIdFor("summarize")).toBe(MODELS.haiku);
  });

  it("QUIZ_MODEL_VENDOR=google → quiz만 Gemini Flash", () => {
    process.env.QUIZ_MODEL_VENDOR = "google";
    expect(getModelIdFor("quiz")).toBe(MODELS.geminiFlash);
    // 다른 도구는 영향 X
    expect(getModelIdFor("summarize")).toBe(MODELS.haiku);
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

  it("SUMMARY_MODEL_VENDOR=google → summarize만 Gemini Flash", () => {
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
    process.env.SUMMARY_MODEL_VENDOR = "google";
    expect(getModelIdFor("chat")).toBe(MODELS.haiku);
    expect(getModelIdFor("chat-free")).toBe(MODELS.haiku);
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
