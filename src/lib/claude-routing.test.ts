import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  estimateCost,
  getModelIdFor,
  MODELS,
  TOOL_ENV_KEY,
  TOOL_MODEL,
  type ToolKind,
} from "./claude";

const toolKinds = Object.keys(TOOL_MODEL) as ToolKind[];

describe("model routing", () => {
  beforeEach(() => {
    for (const prefix of Object.values(TOOL_ENV_KEY)) {
      for (const suffix of ["MODEL_ID", "MODEL_VENDOR", "MODEL"]) {
        vi.stubEnv(`${prefix}_${suffix}`, "");
      }
    }
    for (const key of ["LLM_VENDOR", "PDF_OCR_VENDOR", "EXTRACT_MODEL"]) vi.stubEnv(key, "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each(toolKinds)("%s matches its published default", (tool) => {
    expect(getModelIdFor(tool)).toBe(TOOL_MODEL[tool]);
  });

  it.each(toolKinds)("%s honors a per-tool provider over the global Google switch", (tool) => {
    vi.stubEnv("LLM_VENDOR", "google");
    vi.stubEnv(`${TOOL_ENV_KEY[tool]}_MODEL_VENDOR`, "anthropic");
    expect(getModelIdFor(tool)).toMatch(/^claude-/);
  });

  it("allows a pinned, priced model in production and supports rollback", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LLM_VENDOR", "google");
    vi.stubEnv("SUMMARY_MODEL_ID", " gemini-3.8-flash ");
    expect(getModelIdFor("summarize")).toBe(MODELS.gemini38Flash);
    vi.stubEnv("PRESENTATION_MODEL_ID", "gemini-3.6-flash");
    expect(getModelIdFor("presentation")).toBe(MODELS.gemini36Flash);
    expect(getModelIdFor("quiz")).toBe(MODELS.geminiFlashLite);
  });

  it("rejects unknown IDs before a billable request", () => {
    vi.stubEnv("QUIZ_MODEL_ID", "gemini-typo");
    expect(() => getModelIdFor("quiz")).toThrow("Unsupported QUIZ_MODEL_ID");
  });

  it("retains legacy tier and OCR aliases", () => {
    vi.stubEnv("EXTRACT_MODEL", "sonnet");
    vi.stubEnv("PDF_OCR_VENDOR", "anthropic");
    vi.stubEnv("CHAT_MODEL", "sonnet");
    expect(getModelIdFor("exam-extract")).toBe(MODELS.sonnet);
    expect(getModelIdFor("pdf-ocr")).toBe(MODELS.haiku);
    expect(getModelIdFor("chat")).toBe(MODELS.sonnet);
    vi.stubEnv("LLM_VENDOR", "google");
    expect(getModelIdFor("chat")).toBe(MODELS.geminiFlashLite);
    expect(getModelIdFor("pdf-ocr")).toBe(MODELS.haiku);
  });

  it("prices 3.8 as Flash, including historical provider-prefixed IDs", () => {
    const usage = {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };
    expect(estimateCost(usage, MODELS.gemini38Flash)).toBe(9);
    expect(estimateCost(usage, `google/${MODELS.gemini38Flash}`)).toBe(9);
    expect(estimateCost(usage, MODELS.geminiFlashLite)).toBe(2.8);
  });
});

it("prices Haiku 5.5 at its prompt-length tier without charging cache twice", () => {
  expect(
    estimateCost(
      {
        inputTokens: 100000,
        outputTokens: 1000,
        cacheReadTokens: 80000,
        cacheCreationTokens: 10000,
      },
      MODELS.haiku55,
    ),
  ).toBeCloseTo(0.0043);
  expect(
    estimateCost(
      {
        inputTokens: 100001,
        outputTokens: 1000,
        cacheReadTokens: 80000,
        cacheCreationTokens: 10000,
      },
      MODELS.haiku55,
    ),
  ).toBeCloseTo(0.0215005);
});
