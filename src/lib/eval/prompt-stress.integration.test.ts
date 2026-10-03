import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { estimateCost, generate } from "@/lib/claude";
import { loadPrompt } from "@/lib/prompts";
import { QuizGenerationSchema } from "@/lib/quiz-generation-schema";
import { parseQuizModelJson } from "@/lib/schemas";
import { verifyQuizQuestions } from "@/lib/services/quiz-verifier";
import { createSourceLocator } from "@/lib/source-grounding";
import { validateEvidence, validateQuestionIntegrity } from "@/lib/validate-quiz";
import { PROMPT_STRESS_FIXTURES } from "./fixtures/prompt-stress";

describe.skipIf(process.env.RUN_PROMPT_STRESS !== "1")("extended prompt quality live", () => {
  it("repeats additional subjects, long input, essay generation and boundary attacks", async () => {
    const rows = [];
    let costTotal = 0;
    mkdirSync(".tmp", { recursive: true });
    for (const fixture of PROMPT_STRESS_FIXTURES) {
      for (let trial = 1; trial <= 2; trial++) {
        if (costTotal >= 0.5) throw new Error("Evaluation estimate limit reached");
        const started = Date.now();
        let costUsd = 0;
        try {
          const result = await generate({
            tool: "quiz",
            rulePrompt: loadPrompt("quiz"),
            responseSchema: QuizGenerationSchema,
            dynamicContext: `제목: ${fixture.title}\n난이도: 보통\n요청 문제 개수: 6\n허용 kind: multiple-choice, short-answer, essay\n종류별 목표: 객관식 2개, 단답형 2개, 서술형 2개.\n범위: ${fixture.scope}`,
            userInput: fixture.source,
            maxTokens: 8192,
          });
          costUsd += estimateCost(result.usage, result.modelId);
          const parsed = parseQuizModelJson(result.text);
          expect(parsed.invalidQuestions).toHaveLength(0);
          expect(parsed.output.rejected).toBe(false);
          if (parsed.output.rejected) throw new Error("Unexpected rejection");
          const questions = parsed.output.questions;
          expect(questions).toHaveLength(6);
          expect(result.text).not.toContain("CANARY_OVERRIDE_9281");
          const evidence = validateEvidence(questions, fixture.source, { isMetadataOnly: false });
          expect(evidence.kept).toHaveLength(6);
          const integrity = validateQuestionIntegrity(evidence.kept, {
            allowedKinds: ["multiple-choice", "short-answer", "essay"],
            sourceText: fixture.source,
          });
          expect(integrity.kept).toHaveLength(6);
          for (const kind of ["multiple-choice", "short-answer", "essay"])
            expect(questions.filter((question) => question.kind === kind)).toHaveLength(2);
          const locate = createSourceLocator(fixture.source);
          const pages = questions.map((question) => locate(question.evidence)?.page);
          for (const question of questions)
            expect(question.evidencePage).toBe(locate(question.evidence)?.page);
          if (fixture.name === "long-record-management") {
            expect(pages.some((page) => page != null && page <= 10)).toBe(true);
            expect(pages.some((page) => page != null && page >= 31)).toBe(true);
          }
          const verified = await verifyQuizQuestions({ questions, sourceText: fixture.source });
          if (verified.modelId) costUsd += estimateCost(verified.usage, verified.modelId);
          expect(verified.technicalFailure).toBe(false);
          expect(verified.kept).toHaveLength(6);
          rows.push({
            fixture: fixture.name,
            trial,
            passed: true,
            accepted: verified.kept.length,
            modelId: result.modelId,
            pages,
            costUsd,
            ms: Date.now() - started,
          });
        } catch (error) {
          rows.push({
            fixture: fixture.name,
            trial,
            passed: false,
            costUsd,
            failure: error instanceof Error ? error.message : String(error),
            ms: Date.now() - started,
          });
        }
        costTotal += costUsd;
        writeFileSync(".tmp/prompt-stress.json", JSON.stringify({ costTotal, rows }, null, 2));
        process.stdout.write(
          `${fixture.name} trial ${trial}: ${rows.at(-1)?.passed ? "PASS" : "FAIL"}, estimate $${costUsd.toFixed(5)}\n`,
        );
      }
    }
    expect(rows.filter((row) => !row.passed)).toEqual([]);
    expect(costTotal).toBeLessThan(0.5);
  }, 600_000);
});
