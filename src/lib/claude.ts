import Anthropic from "@anthropic-ai/sdk";

/**
 * arch-campus Anthropic SDK wrapper.
 *
 * Canonical pattern for every wizard / generator route. New tools must
 * replicate this shape (CLAUDE.md §4-2 4-Layer, layer 2).
 *
 * Caching strategy (1h ephemeral):
 *   system[0] = static rule prompt (CACHED)
 *   system[1] = dynamic context: persona + course + user metadata (NOT cached)
 *   messages  = user_input wrapped in <user_input>…</user_input>  (NOT cached)
 */

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey && process.env.NODE_ENV === "production") {
  throw new Error("ANTHROPIC_API_KEY is required in production");
}

export const anthropic = new Anthropic({
  apiKey: apiKey ?? "missing-key-dev",
});

export const CLAUDE_MODEL = "claude-sonnet-4-6" as const;

export type ToolKind =
  | "summary"
  | "questions"
  | "wizard-presentation"
  | "wizard-assignment"
  | "wizard-exam"
  | "wizard-cram"
  | "syllabus-extract"
  | "post-mortem";

export interface GenerateInput {
  /** Static rule prompt for the tool. Loaded from src/prompts/<tool>.md */
  rulePrompt: string;
  /** Dynamic context: persona, course, semester. Concatenated, NOT cached. */
  dynamicContext: string;
  /** Free-text from the user — wrapped in <user_input> on our side. */
  userInput: string;
  /** Optional override (defaults below). */
  maxTokens?: number;
  temperature?: number;
}

export interface GenerateResult {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
}

/**
 * Single source of truth for Anthropic message construction.
 * Always go through this — never call anthropic.messages.create directly
 * from a route, so caching + usage logging stay consistent.
 */
export async function generate({
  rulePrompt,
  dynamicContext,
  userInput,
  maxTokens = 4096,
  temperature = 0.4,
}: GenerateInput): Promise<GenerateResult> {
  const wrappedUserInput = `<user_input>\n${userInput}\n</user_input>`;

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    temperature,
    system: [
      {
        type: "text",
        text: rulePrompt,
        cache_control: { type: "ephemeral", ttl: "1h" },
      },
      {
        type: "text",
        text: dynamicContext,
      },
    ],
    messages: [{ role: "user", content: wrappedUserInput }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((b) => b.text)
    .join("\n");

  return {
    text,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
    },
  };
}

/**
 * Estimate cost in USD for one generate() call.
 * Sonnet 4.6 pricing (verify quarterly):
 *   - input:        $3.00 / 1M
 *   - cache write:  $3.75 / 1M (1h ephemeral)
 *   - cache read:   $0.30 / 1M (90% off)
 *   - output:       $15.00 / 1M
 */
export function estimateCost(usage: GenerateResult["usage"]): number {
  const M = 1_000_000;
  return (
    (usage.inputTokens * 3.0) / M +
    (usage.cacheCreationTokens * 3.75) / M +
    (usage.cacheReadTokens * 0.3) / M +
    (usage.outputTokens * 15.0) / M
  );
}
