import { z } from "zod";

// No preprocess/default/union at the root: keep the provider JSON schema simple.
// Evidence precedes the question to encourage evidence-first construction.
export const QuizGenerationSchema = z.object({
  rejected: z.boolean(),
  reason: z.string().nullable(),
  questions: z
    .array(
      z.object({
        id: z.number().int().positive(),
        kind: z.enum(["multiple-choice", "short-answer", "essay"]),
        difficulty: z.enum(["쉬움", "보통", "어려움"]),
        topic: z.string().min(1).max(60),
        evidence: z
          .string()
          .min(10)
          .max(2000)
          .describe("A contiguous verbatim source excerpt sufficient to decide the answer."),
        evidencePage: z
          .number()
          .int()
          .positive()
          .nullable()
          .describe("Only a page number explicitly identifiable in the source; otherwise null."),
        stem: z
          .string()
          .min(15)
          .max(400)
          .describe(
            "A complete question of 15–400 characters specifying the target and requested answer form.",
          ),
        choices: z
          .array(z.object({ key: z.enum(["A", "B", "C", "D"]), text: z.string().min(1).max(300) }))
          .length(4)
          .nullable(),
        answer: z.string().min(1).max(2000),
        explanation: z
          .string()
          .min(20)
          .max(500)
          .describe("Explain using option contents, never mutable option labels or positions."),
        trapAnalysis: z.string().nullable(),
        hint: z.string().min(5).max(200).nullable(),
      }),
    )
    .max(50),
  watermark: z.string().min(10),
});
