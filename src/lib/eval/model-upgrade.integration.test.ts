import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { estimateCost, generate, MODELS } from "@/lib/claude";
import { loadPrompt } from "@/lib/prompts";
import { QuizGenerationSchema } from "@/lib/quiz-generation-schema";
import {
  parseModelJson,
  parseQuizModelJson,
  SummarizeGenerationSchema,
  SummarizeOutput,
} from "@/lib/schemas";
import { verifyQuizQuestions } from "@/lib/services/quiz-verifier";
import { groundSummaryCitations } from "@/lib/summary-grounding";
import {
  areNearDuplicateStems,
  validateEvidence,
  validateQuestionIntegrity,
} from "@/lib/validate-quiz";
import { PROMPT_QUALITY_FIXTURES } from "./fixtures/prompt-quality";

// Synthetic notes only. Opt-in billable evaluation; no database writes.
describe.skipIf(process.env.RUN_MODEL_UPGRADE_EVAL !== "1")("model upgrade comparison", () => {
  it("compares source grounding, quiz validation, cost and latency", async () => {
    const rows: Record<string, unknown>[] = [];
    let costTotal = 0;
    mkdirSync(".tmp", { recursive: true });
    for (const fixture of PROMPT_QUALITY_FIXTURES) {
      for (const modelId of process.env.EVAL_MODEL_IDS?.split(",") ?? [
        MODELS.geminiFlashLite,
        MODELS.haiku55,
      ]) {
        for (const tool of ["summarize", "quiz"] as const) {
          if (costTotal >= 0.5) throw new Error("Evaluation estimate limit reached");
          const started = Date.now();
          const result = await generate({
            tool,
            modelIdOverride: modelId,
            rulePrompt: loadPrompt(tool),
            responseSchema: tool === "quiz" ? QuizGenerationSchema : SummarizeGenerationSchema,
            dynamicContext: `제목: ${fixture.title}\n난이도: ${fixture.difficulty}\n본문 전체. 문제 개수 6개, 객관식 3개와 단답형 3개. 허용 kind: multiple-choice, short-answer. 서로 다른 학습 목표를 평가. 원문의 페이지 표식과 인용만 사용.`,
            userInput: fixture.source,
            maxTokens: 8192,
          });
          let costUsd = estimateCost(result.usage, modelId);
          let accepted = 0;
          let generated = 0;
          let valid = false;
          try {
            if (tool === "summarize") {
              const output = groundSummaryCitations(
                parseModelJson(SummarizeOutput, result.text),
                fixture.source,
              );
              generated = output.blocks.length;
              accepted = output.blocks.filter((block) => block.sourceQuote).length;
              valid = accepted >= 3;
            } else {
              const parsed = parseQuizModelJson(result.text);
              if (!parsed.output.rejected) {
                generated = parsed.output.questions.length;
                const evidence = validateEvidence(parsed.output.questions, fixture.source, {
                  isMetadataOnly: false,
                });
                const integrity = validateQuestionIntegrity(evidence.kept, {
                  allowedKinds: ["multiple-choice", "short-answer"],
                  sourceText: fixture.source,
                });
                const unique = integrity.kept.filter(
                  (q, i, all) =>
                    !all.slice(0, i).some((p) => areNearDuplicateStems(p.stem, q.stem)),
                );
                const verified = await verifyQuizQuestions({
                  questions: unique,
                  sourceText: fixture.source,
                });
                if (verified.modelId) costUsd += estimateCost(verified.usage, verified.modelId);
                accepted = verified.kept.length;
                valid =
                  !verified.technicalFailure &&
                  parsed.invalidQuestions.length === 0 &&
                  accepted >= 5;
              }
            }
          } catch {
            valid = false;
          }
          costTotal += costUsd;
          rows.push({
            fixture: fixture.name,
            tool,
            modelId,
            rawText: result.text,
            generated,
            accepted,
            valid,
            costUsd,
            ms: Date.now() - started,
          });
          writeFileSync(
            process.env.EVAL_REPORT_PATH ?? ".tmp/model-upgrade.json",
            JSON.stringify({ costTotal, rows }, null, 2),
          );
          const { rawText: _rawText, ...metrics } = rows.at(-1) ?? {};
          console.info(metrics);
          // Comparison records failures; it is not a release quality gate.
        }
      }
    }
    expect(costTotal).toBeLessThan(0.5);
  }, 600_000);
});
