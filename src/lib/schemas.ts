import { z } from "zod";

export const SummarizeOutput = z.object({
  leadSentence: z.string().min(10).max(140),
  blocks: z
    .array(
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("h2"), content: z.string().min(2).max(40) }),
        z.object({ type: z.literal("para"), content: z.string().min(40).max(280) }),
        z.object({
          type: z.literal("bullets"),
          items: z.array(z.string().min(3).max(160)).min(2).max(6),
        }),
        z.object({
          type: z.literal("callout"),
          tone: z.enum(["info", "warn", "tip"]),
          content: z.string().min(10).max(280),
        }),
      ]),
    )
    .min(3)
    .max(8),
  keywords: z.array(z.string().min(1).max(40)).min(3).max(12),
  reviewSpots: z
    .array(
      z.object({
        title: z.string().min(2).max(60),
        why: z.string().min(10).max(280),
      }),
    )
    .min(1)
    .max(4),
  watermark: z.string().min(10),
});
export type SummarizeOutputT = z.infer<typeof SummarizeOutput>;

export const QuizQuestion = z.object({
  id: z.number().int().positive(),
  difficulty: z.enum(["쉬움", "보통", "어려움"]),
  topic: z.string().min(1).max(60),
  stem: z.string().min(20).max(200),
  choices: z
    .array(
      z.object({
        key: z.enum(["A", "B", "C", "D"]),
        text: z.string().min(2).max(120),
      }),
    )
    .length(4),
  answer: z.enum(["A", "B", "C", "D"]),
  explanation: z.string().min(40).max(300),
  evidence: z.string().min(10),
  evidencePage: z.number().int().nullable().optional(),
  trapAnalysis: z.string().optional(),
});

export const QuizOutput = z.union([
  z.object({
    questions: z.array(QuizQuestion).min(1).max(10),
    rejected: z.literal(false).optional(),
    watermark: z.string().min(10),
  }),
  z.object({
    questions: z.array(QuizQuestion).length(0),
    rejected: z.literal(true),
    reason: z.string().min(10),
    watermark: z.string().min(10),
  }),
]);
export type QuizOutputT = z.infer<typeof QuizOutput>;

export const PresentationOutput = z.object({
  outline: z
    .array(
      z.object({
        slideNo: z.number().int().positive(),
        title: z.string().min(2).max(40),
        purpose: z.string().min(5).max(80),
        structure: z.array(z.string().min(5).max(160)).min(3).max(5),
        speakerNote: z.string().min(20).max(120),
        estimatedSec: z.number().int().min(20).max(600),
      }),
    )
    .min(4)
    .max(12),
  qaBank: z
    .array(
      z.object({
        question: z.string().min(10).max(200),
        intent: z.string().min(5).max(80),
        answerHint: z.string().min(20).max(300),
      }),
    )
    .length(5),
  deliveryTips: z.array(z.string().min(10).max(160)).min(2).max(8),
  watermark: z.string().min(10),
});
export type PresentationOutputT = z.infer<typeof PresentationOutput>;

export const BANNED_WORDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/효과적인/g, "좋은"],
  [/체계적인/g, "차근차근"],
  [/다양한/g, "여러"],
  [/중요합니다/g, "핵심이에요"],
  [/도움이 됩니다/g, "도와줘요"],
  [/활용하세요/g, "써보세요"],
  [/살펴보겠습니다/g, "한 번 볼게요"],
  [/알아보겠습니다/g, "짚어볼게요"],
  [/생각해드리겠습니다/g, ""],
  [/핵심적인/g, "가장 중요한"],
  [/본질적인/g, "근본"],
  [/전반적인/g, "전체적으로"],
  [/포괄적인/g, "두루두루"],
  [/이를 통해/g, "그래서"],
  [/결론적으로/g, "정리하면"],
  [/최적화된/g, "잘 맞춘"],
  [/진행해보겠습니다/g, "시작할게요"],
];

export interface BannedWordHit {
  word: string;
  count: number;
}

export function findBannedWords(text: string): BannedWordHit[] {
  const hits: BannedWordHit[] = [];
  for (const [pattern] of BANNED_WORDS) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      hits.push({ word: matches[0], count: matches.length });
    }
  }
  return hits;
}

export function replaceBannedWords(text: string): string {
  let out = text;
  for (const [pattern, replacement] of BANNED_WORDS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

export const WATERMARK = "이 자료는 학습 보조용이며" as const;

export function hasWatermark(output: { watermark?: string }): boolean {
  return typeof output.watermark === "string" && output.watermark.includes(WATERMARK);
}

export function evidenceMatches(materialFullText: string, evidence: string): boolean {
  if (!evidence || evidence.length < 10) return false;
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  return norm(materialFullText).includes(norm(evidence));
}

export function parseModelJson<T>(schema: z.ZodType<T>, raw: string): T {
  const body = extractJsonBody(raw);
  const parsed = JSON.parse(body);
  return schema.parse(parsed);
}

function extractJsonBody(raw: string): string {
  const trimmed = raw.trim();
  // case 1: 정상 ```json ... ``` 펜스
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1].trim();
  // case 2: 펜스 시작만 있고 닫힘 누락 (max_tokens 잘림 등) → ```json 이후부터
  const fencedOpen = trimmed.match(/```(?:json)?\s*([\s\S]*)$/i);
  if (fencedOpen) return fencedOpen[1].trim();
  // case 3: 펜스 없이 평문 — 첫 { 부터 마지막 } 까지
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}
