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
  | "post-mortem";

export const TOOL_MODEL: Record<ToolKind, LanguageModel> = {
  summarize: MODELS.haiku,
  quiz: MODELS.sonnet,
  presentation: MODELS.sonnet,
  "wizard-assignment": MODELS.sonnet,
  "wizard-exam": MODELS.sonnet,
  "wizard-cram": MODELS.haiku,
  "syllabus-extract": MODELS.haiku,
  "timetable-extract": MODELS.haiku,
  "post-mortem": MODELS.haiku,
};

const ANTHROPIC_CACHE_1H = {
  anthropic: { cacheControl: { type: "ephemeral", ttl: "1h" } as const },
};

export interface GenerateInput {
  tool: ToolKind;
  rulePrompt: string;
  dynamicContext: string;
  userInput: string;
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
  const model = TOOL_MODEL[tool];
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
  const modelId =
    typeof model === "object" && "modelId" in model ? (model.modelId as string) : String(model);

  return {
    text: result.text,
    modelId,
    usage: {
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
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
