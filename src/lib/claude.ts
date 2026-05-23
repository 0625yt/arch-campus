import { anthropic } from "@ai-sdk/anthropic";
import { generateText, type LanguageModel, type ModelMessage } from "ai";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey && process.env.NODE_ENV === "production") {
  throw new Error("ANTHROPIC_API_KEY is required in production");
}

export const MODELS = {
  sonnet: anthropic("claude-sonnet-4-6"),
  haiku: anthropic("claude-haiku-4-5"),
} as const;

export type ToolKind =
  | "summarize"
  | "quiz"
  | "presentation"
  | "wizard-assignment"
  | "wizard-exam"
  | "wizard-cram"
  | "syllabus-extract"
  | "timetable-extract"
  | "post-mortem"
  | "event-parse"
  | "exam-extract";

export const TOOL_MODEL: Record<ToolKind, LanguageModel> = {
  summarize: MODELS.haiku,
  quiz: MODELS.sonnet,
  presentation: MODELS.sonnet,
  "wizard-assignment": MODELS.sonnet,
  "wizard-exam": MODELS.sonnet,
  "wizard-cram": MODELS.sonnet,
  "syllabus-extract": MODELS.haiku,
  // 시간표는 격자 vision 정확도가 사활. 학기당 1~2번이므로 sonnet 감수.
  "timetable-extract": MODELS.sonnet,
  "post-mortem": MODELS.haiku,
  // 자연어 → 일정 JSON. 짧고 정형이라 Haiku 충분.
  "event-parse": MODELS.haiku,
  // 기출문제 PDF에서 문제·정답·해설을 그대로 추출 (새 생성 X).
  // Vision 입력이라 토큰 비싸지만 추출은 생성보다 쉬워 Haiku로 시작.
  // EXTRACT_MODEL=sonnet env로 승격 가능 (정확도 70% 미만 시).
  "exam-extract": MODELS.haiku,
};

/**
 * 런타임 모델 override.
 *
 * 환경변수로 특정 tool의 모델을 일시 교체한다. 적자 통제 실험·롤백용
 * (CLAUDE.md §1, 진단 리포트 P0 quiz 모델 재평가).
 *
 *  - `QUIZ_MODEL=haiku` → quiz만 Haiku로
 *  - `QUIZ_MODEL=sonnet` (또는 unset) → 기본값(Sonnet)
 *
 * 다른 tool은 영향 X. prod에서 한 줄 env로 즉시 롤백 가능.
 * 미지정·미인식 값이면 TOOL_MODEL 기본값 그대로.
 */
function resolveModel(tool: ToolKind): LanguageModel {
  if (tool === "quiz") {
    const override = process.env.QUIZ_MODEL?.toLowerCase();
    if (override === "haiku") return MODELS.haiku;
    if (override === "sonnet") return MODELS.sonnet;
  }
  if (tool === "exam-extract") {
    const override = process.env.EXTRACT_MODEL?.toLowerCase();
    if (override === "haiku") return MODELS.haiku;
    if (override === "sonnet") return MODELS.sonnet;
  }
  return TOOL_MODEL[tool];
}

/**
 * 실패 로그·UI 표시용으로 어떤 model이 선택될지 미리 확인.
 * AI 호출 자체가 throw하면 result.modelId를 못 받으므로 호출 전에 박아둔다.
 */
export function getModelIdFor(tool: ToolKind): string {
  const model = resolveModel(tool);
  return typeof model === "object" && "modelId" in model
    ? (model.modelId as string)
    : String(model);
}

const ANTHROPIC_CACHE_1H = {
  anthropic: { cacheControl: { type: "ephemeral", ttl: "1h" } as const },
};

/**
 * Anthropic prompt caching 최소 토큰 — 미만이면 cache_control 무시.
 *   - Haiku 4.5: 4096 토큰
 *   - Sonnet 4.6: 1024 토큰
 *   - Opus  계열: 1024 토큰
 *
 * (2026-01 docs)
 */
const CACHE_MIN_TOKENS = {
  haiku: 4096,
  sonnet: 1024,
  opus: 1024,
} as const;

/**
 * rulePrompt가 캐시 최소 토큰을 충족할지 거칠게 추정.
 *
 * 한국어/영어 혼합 자료에서 정확한 토큰 수는 Anthropic count_tokens API로만
 * 알 수 있다. 여기선 dev 환경 경고용으로만 쓰는 거친 추정.
 *
 *   - 한국어/한자 1자 ≈ 1 token (보수적)
 *   - 영문 1단어 ≈ 1.3 token, char 4개 ≈ 1 token
 *   - 그래서 "char count / 2.5" 정도면 token 수 근사치
 *
 * 실측이 필요한 경우 generate() 호출 후 result.usage로 검증.
 */
function estimateTokensFromChars(text: string): number {
  return Math.ceil(text.length / 2.5);
}

function modelTier(modelId: string): "haiku" | "sonnet" | "opus" {
  if (modelId.includes("haiku")) return "haiku";
  if (modelId.includes("opus")) return "opus";
  return "sonnet";
}

/**
 * dev 환경에서 한 번씩 경고. prod엔 노이즈만 키우니까 NODE_ENV 가드.
 * 같은 tool은 한 번만 경고하도록 cache로 dedupe.
 */
const warnedCacheMissTools = new Set<ToolKind>();
function warnIfBelowCacheMin(tool: ToolKind, modelId: string, rulePrompt: string): void {
  if (process.env.NODE_ENV === "production") return;
  if (warnedCacheMissTools.has(tool)) return;
  const tier = modelTier(modelId);
  const min = CACHE_MIN_TOKENS[tier];
  const est = estimateTokensFromChars(rulePrompt);
  if (est < min) {
    warnedCacheMissTools.add(tool);
    console.warn(
      `[claude.cache] tool="${tool}" model=${tier} rulePrompt ≈${est}t < ${min}t. ` +
        `prompt caching 비활성 가능 — 매 호출 정가 청구. ` +
        `프롬프트를 늘리거나 같은 tier 안에서 모델 격상 고려.`,
    );
  }
}

export interface GenerateInput {
  tool: ToolKind;
  rulePrompt: string;
  dynamicContext: string;
  userInput: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Vision 입력 — PDF 또는 이미지를 그대로 모델에 보낸다.
 *
 * 시간표처럼 "표 그리드의 행/열 위치가 의미"인 자료는 텍스트 추출만으론
 * 요일/교시 매칭이 무너진다. 모델이 그림을 그대로 읽게 한다.
 *
 * 비용: PDF/이미지는 텍스트보다 훨씬 비싸지만 (1페이지 ≈ 1500~2000 토큰)
 * 시간표는 1페이지짜리고 사용자가 학기당 1~2번 올림. 감수.
 */
export interface GenerateVisionInput {
  tool: ToolKind;
  rulePrompt: string;
  dynamicContext: string;
  /** 파일 바이트 — PDF 또는 이미지 */
  fileBytes: Uint8Array;
  /** "application/pdf" 또는 "image/png" 등 */
  mediaType: string;
  /** 파일 옆에 함께 보낼 텍스트 지시 (선택) */
  userText?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface GenerateUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface GenerateResult {
  text: string;
  usage: GenerateUsage;
  modelId: string;
}

export async function generate({
  tool,
  rulePrompt,
  dynamicContext,
  userInput,
  maxTokens = 4096,
  temperature = 0.4,
}: GenerateInput): Promise<GenerateResult> {
  const model = resolveModel(tool);
  const modelId =
    typeof model === "object" && "modelId" in model ? (model.modelId as string) : String(model);
  warnIfBelowCacheMin(tool, modelId, rulePrompt);
  const wrappedUserInput = `<user_input>\n${userInput}\n</user_input>`;

  const messages: ModelMessage[] = [
    {
      role: "system",
      content: rulePrompt,
      providerOptions: ANTHROPIC_CACHE_1H,
    },
    {
      role: "system",
      content: dynamicContext,
    },
    {
      role: "user",
      content: wrappedUserInput,
    },
  ];

  const result = await generateText({
    model,
    maxOutputTokens: maxTokens,
    temperature,
    messages,
  });

  const meta = (result.providerMetadata?.anthropic ?? {}) as Record<string, unknown>;
  const cacheRead = Number(meta.cacheReadInputTokens ?? 0);
  const cacheCreation = Number(meta.cacheCreationInputTokens ?? 0);
  const inputTokens = result.usage.inputTokens ?? 0;
  const outputTokens = result.usage.outputTokens ?? 0;
  logCacheStats(tool, modelId, { inputTokens, outputTokens, cacheRead, cacheCreation });

  return {
    text: result.text,
    modelId,
    usage: {
      inputTokens,
      outputTokens,
      cacheReadTokens: cacheRead,
      cacheCreationTokens: cacheCreation,
    },
  };
}

/**
 * dev 환경에서 매 호출의 캐시 stats를 한 줄로 표시 — 어디가 캐시 hit 안 하는지 즉시 보이게.
 *   - hit: 캐시 읽기 비율 (cacheRead / (inputTokens + cacheRead)) — 높을수록 좋음
 *   - 정가 input 비율이 높으면 prompt 구조 점검 필요
 */
function logCacheStats(
  tool: ToolKind,
  modelId: string,
  s: { inputTokens: number; outputTokens: number; cacheRead: number; cacheCreation: number },
): void {
  if (process.env.NODE_ENV === "production") return;
  const totalCached = s.cacheRead + s.cacheCreation;
  const hitRate = totalCached > 0 ? (s.cacheRead / totalCached) * 100 : 0;
  const tier = modelTier(modelId);
  console.log(
    `[claude.usage] ${tool} (${tier})  ` +
      `in=${s.inputTokens} out=${s.outputTokens}  ` +
      `cache: read=${s.cacheRead} write=${s.cacheCreation} hit=${hitRate.toFixed(0)}%`,
  );
}

/**
 * 파일 1개 + 지시 텍스트로 vision 모델 호출.
 * Anthropic은 PDF·이미지를 모두 file content block으로 받는다.
 */
export async function generateWithFile({
  tool,
  rulePrompt,
  dynamicContext,
  fileBytes,
  mediaType,
  userText,
  maxTokens = 4096,
  temperature = 0.1,
}: GenerateVisionInput): Promise<GenerateResult> {
  const model = resolveModel(tool);
  const modelId =
    typeof model === "object" && "modelId" in model ? (model.modelId as string) : String(model);
  warnIfBelowCacheMin(tool, modelId, rulePrompt);

  // AI SDK는 PDF·이미지를 모두 같은 file 블록으로 받는다.
  // - mediaType="application/pdf" → Anthropic provider가 document(pdfs-2024-09-25)로 변환
  // - mediaType="image/*"         → Anthropic provider가 image 블록으로 변환
  const fileBlock = {
    type: "file" as const,
    data: fileBytes,
    mediaType,
  };

  const messages: ModelMessage[] = [
    {
      role: "system",
      content: rulePrompt,
      providerOptions: ANTHROPIC_CACHE_1H,
    },
    {
      role: "system",
      content: dynamicContext,
    },
    {
      role: "user",
      content: [
        fileBlock,
        { type: "text" as const, text: userText ?? "위 파일을 룰대로 처리해 JSON으로 답하세요." },
      ],
    },
  ];

  const result = await generateText({
    model,
    maxOutputTokens: maxTokens,
    temperature,
    messages,
  });

  const meta = (result.providerMetadata?.anthropic ?? {}) as Record<string, unknown>;
  const cacheRead = Number(meta.cacheReadInputTokens ?? 0);
  const cacheCreation = Number(meta.cacheCreationInputTokens ?? 0);
  const inputTokens = result.usage.inputTokens ?? 0;
  const outputTokens = result.usage.outputTokens ?? 0;
  logCacheStats(tool, modelId, { inputTokens, outputTokens, cacheRead, cacheCreation });

  return {
    text: result.text,
    modelId,
    usage: {
      inputTokens,
      outputTokens,
      cacheReadTokens: cacheRead,
      cacheCreationTokens: cacheCreation,
    },
  };
}

const PRICING = {
  sonnet: { input: 3, cacheWrite1h: 6, cacheRead: 0.3, output: 15 },
  haiku: { input: 0.8, cacheWrite1h: 1.6, cacheRead: 0.08, output: 4 },
} as const;

export function estimateCost(usage: GenerateUsage, modelId: string): number {
  const tier = modelId.includes("haiku") ? PRICING.haiku : PRICING.sonnet;
  const M = 1_000_000;
  return (
    (usage.inputTokens * tier.input) / M +
    (usage.cacheCreationTokens * tier.cacheWrite1h) / M +
    (usage.cacheReadTokens * tier.cacheRead) / M +
    (usage.outputTokens * tier.output) / M
  );
}
