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
    "QUIZ_GRADE_MODEL",
    "QUIZ_VERIFY_MODEL",
    "EXTRACT_MODEL",
    "EXAM_SOLVE_MODEL",
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

  it("env 안 켜면 quiz는 Flash-Lite (2026-07-24 FIX — prod 포함 기본, 비용 79.9% 절감)", () => {
    expect(getModelIdFor("quiz")).toBe(MODELS.geminiFlashLite);
  });

  it("env 안 켜면 exam-solve는 Flash-Lite (A/B 실측 정답 20/20 → 2026-07-24 변경)", () => {
    expect(getModelIdFor("exam-solve")).toBe(MODELS.geminiFlashLite);
  });

  it("EXAM_SOLVE_MODEL=haiku로 격하 가능", () => {
    process.env.EXAM_SOLVE_MODEL = "haiku";
    expect(getModelIdFor("exam-solve")).toBe(MODELS.haiku);
  });

  describe("LLM_VENDOR=google 전역 스위치 (2026-06-06 전면 Gemini 전환)", () => {
    it("LLM_VENDOR=google는 TOOL_MODEL과 동일 매핑 (2026-07-24 GEMINI_BY_TOOL 병합)", () => {
      process.env.LLM_VENDOR = "google";
      process.env.VERCEL_ENV = "production";
      // GEMINI_BY_TOOL 제거 후 TOOL_MODEL 직접 사용 → 두 테이블 드리프트 없음.
      expect(getModelIdFor("quiz")).toBe(MODELS.geminiFlashLite);
      // 위저드 생성 — TOOL_MODEL대로 3.6 Flash
      expect(getModelIdFor("presentation")).toBe(MODELS.gemini36Flash);
      // Vision — TOOL_MODEL대로 3.1 Pro
      expect(getModelIdFor("timetable-extract")).toBe(MODELS.gemini31Pro);
    });

    it("단순·짧은출력·판정·맥락 도구는 TOOL_MODEL대로 Flash-Lite", () => {
      process.env.LLM_VENDOR = "google";
      // chat도 TOOL_MODEL대로 Flash-Lite (병합 후 GEMINI_BY_TOOL 별도 Flash 매핑 제거)
      expect(getModelIdFor("chat")).toBe(MODELS.geminiFlashLite);
      expect(getModelIdFor("event-parse")).toBe(MODELS.geminiFlashLite);
      expect(getModelIdFor("summarize")).toBe(MODELS.geminiFlashLite);
      expect(getModelIdFor("exam-extract")).toBe(MODELS.geminiFlashLite);
    });

    it("exam-solve는 TOOL_MODEL대로 Flash-Lite (A/B 정답 20/20)", () => {
      process.env.LLM_VENDOR = "google";
      process.env.VERCEL_ENV = "production";
      expect(getModelIdFor("exam-solve")).toBe(MODELS.geminiFlashLite);
    });

    it("gemini 별칭도 동작 — quiz는 Flash-Lite", () => {
      process.env.LLM_VENDOR = "gemini";
      expect(getModelIdFor("quiz")).toBe(MODELS.geminiFlashLite);
      expect(getModelIdFor("presentation")).toBe(MODELS.gemini36Flash);
    });

    it("도구별 *_MODEL_VENDOR=anthropic으로 그 도구만 Anthropic 유지", () => {
      process.env.LLM_VENDOR = "google";
      process.env.QUIZ_MODEL_VENDOR = "anthropic";
      // quiz만 다시 Anthropic(강제 원복 시 기본 Sonnet), 나머지는 Gemini 유지
      expect(getModelIdFor("quiz")).toBe(MODELS.sonnet);
      expect(getModelIdFor("presentation")).toBe(MODELS.gemini36Flash);
    });

    it("LLM_VENDOR 미설정이면 기존 라우팅 그대로 (quiz=Flash-Lite FIX)", () => {
      expect(getModelIdFor("quiz")).toBe(MODELS.geminiFlashLite);
    });
  });

  it("env 안 켜면 summarize는 Gemini Flash (2026-05-31 결정: prod 포함 기본)", () => {
    expect(getModelIdFor("summarize")).toBe(MODELS.geminiFlashLite);
  });

  it("SUMMARY_MODEL_VENDOR=anthropic으로 강제하면 Haiku", () => {
    process.env.SUMMARY_MODEL_VENDOR = "anthropic";
    expect(getModelIdFor("summarize")).toBe(MODELS.haiku);
  });

  it("QUIZ_MODEL_VENDOR 미설정이어도 quiz는 Flash-Lite (기본 FIX)", () => {
    // summarize는 기본 Gemini, presentation은 Sonnet 5 그대로(FIX 2026-07-24)
    expect(getModelIdFor("quiz")).toBe(MODELS.geminiFlashLite);
    expect(getModelIdFor("summarize")).toBe(MODELS.geminiFlashLite);
    // 위저드는 2026-07-24 실측으로 3.6 Flash로 변경(Flash-Lite는 발표 슬라이드 감각 약해 탈락).
    expect(getModelIdFor("presentation")).toBe(MODELS.gemini36Flash);
  });

  it("QUIZ_MODEL_VENDOR=anthropic → quiz를 Anthropic으로 원복 (기본 Sonnet)", () => {
    process.env.QUIZ_MODEL_VENDOR = "anthropic";
    expect(getModelIdFor("quiz")).toBe(MODELS.sonnet);
  });

  it("QUIZ_MODEL_VENDOR=claude 별칭도 원복 동작", () => {
    process.env.QUIZ_MODEL_VENDOR = "claude";
    expect(getModelIdFor("quiz")).toBe(MODELS.sonnet);
  });

  it("SUMMARY_MODEL_VENDOR=google → summarize는 Gemini (이미 기본)", () => {
    process.env.SUMMARY_MODEL_VENDOR = "google";
    expect(getModelIdFor("summarize")).toBe(MODELS.geminiFlashLite);
    // quiz는 영향 X — 기본 Flash-Lite
    expect(getModelIdFor("quiz")).toBe(MODELS.geminiFlashLite);
  });

  it("anthropic 원복 시 tier override 존중 — QUIZ_MODEL_VENDOR=anthropic + QUIZ_MODEL=haiku", () => {
    process.env.QUIZ_MODEL_VENDOR = "anthropic";
    process.env.QUIZ_MODEL = "haiku";
    expect(getModelIdFor("quiz")).toBe(MODELS.haiku);
  });

  it("QUIZ_MODEL_VENDOR 안 걸면 QUIZ_MODEL(tier)도 무시되고 Flash-Lite 유지", () => {
    // vendor 원복 없이 tier만 지정해도 Flash-Lite 기본이 우선(vendor 층이 tier 위)
    process.env.QUIZ_MODEL = "haiku";
    expect(getModelIdFor("quiz")).toBe(MODELS.geminiFlashLite);
  });

  it("빈 문자열·잡값 vendor는 기본 Flash-Lite 유지 (anthropic만 원복)", () => {
    process.env.QUIZ_MODEL_VENDOR = "";
    expect(getModelIdFor("quiz")).toBe(MODELS.geminiFlashLite);
    process.env.QUIZ_MODEL_VENDOR = "openai"; // 미지원 vendor
    expect(getModelIdFor("quiz")).toBe(MODELS.geminiFlashLite);
  });

  it("한 도구 vendor 플래그가 다른 도구에 영향 X", () => {
    process.env.QUIZ_MODEL_VENDOR = "anthropic";
    // quiz만 Anthropic 원복(Sonnet), 나머진 각자 기본 유지
    expect(getModelIdFor("quiz")).toBe(MODELS.sonnet);
    // 채점·검수는 2026-07-24 실측(3모델 정확도 동일)으로 Flash-Lite. QUIZ_MODEL_VENDOR과 무관.
    expect(getModelIdFor("quiz-grade")).toBe(MODELS.geminiFlashLite);
    expect(getModelIdFor("quiz-verify")).toBe(MODELS.geminiFlashLite);
    // chat(자료 RAG)은 실측(함정 3/3 정직)으로 Flash-Lite
    expect(getModelIdFor("chat")).toBe(MODELS.geminiFlashLite);
  });

  it("QUIZ_GRADE_MODEL=haiku로 채점을 Haiku 원복(안전판)", () => {
    process.env.QUIZ_GRADE_MODEL = "haiku";
    expect(getModelIdFor("quiz-grade")).toBe(MODELS.haiku);
  });

  // 2026-07-24 — quiz는 prod 포함 Flash-Lite 확정. 강화 파이프라인이 Flash-Lite 약점을 덮음.
  it("VERCEL_ENV=production이어도 quiz는 Flash-Lite (prod 포함 FIX)", () => {
    process.env.VERCEL_ENV = "production";
    expect(getModelIdFor("quiz")).toBe(MODELS.geminiFlashLite);
  });

  it("prod에서도 QUIZ_MODEL_VENDOR=anthropic이면 Sonnet으로 원복", () => {
    process.env.VERCEL_ENV = "production";
    process.env.QUIZ_MODEL_VENDOR = "anthropic";
    expect(getModelIdFor("quiz")).toBe(MODELS.sonnet);
  });

  it("VERCEL_ENV=production이어도 summarize는 Gemini Flash (2026-05-31 결정)", () => {
    process.env.VERCEL_ENV = "production";
    expect(getModelIdFor("summarize")).toBe(MODELS.geminiFlashLite);
  });

  it("VERCEL_ENV=production에서도 SUMMARY_MODEL_VENDOR=anthropic이면 Haiku로 복귀", () => {
    process.env.VERCEL_ENV = "production";
    process.env.SUMMARY_MODEL_VENDOR = "anthropic";
    expect(getModelIdFor("summarize")).toBe(MODELS.haiku);
  });

  it("VERCEL_ENV=preview에서도 quiz는 Flash-Lite (env 무관 FIX)", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.QUIZ_MODEL_VENDOR = "google";
    expect(getModelIdFor("quiz")).toBe(MODELS.geminiFlashLite);
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
