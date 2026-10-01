import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { estimateCost, generate, getModelIdFor } from "@/lib/claude";
import { loadPrompt } from "@/lib/prompts";
import { QuizGenerationSchema } from "@/lib/quiz-generation-schema";
import { parseQuizModelJson } from "@/lib/schemas";
import { verifyQuizQuestions } from "@/lib/services/quiz-verifier";
import {
  areNearDuplicateStems,
  validateEvidence,
  validateQuestionIntegrity,
} from "@/lib/validate-quiz";
import { PROMPT_QUALITY_FIXTURES } from "./fixtures/prompt-quality";

const runLive = process.env.RUN_PROMPT_EVAL === "1";
const requested = 6;

describe.skipIf(!runLive)("prompt quality live comparison", () => {
  it("synthetic notes: grounding, valid answers, diversity, cost and latency", async () => {
    const baselineRef = process.env.BASELINE_PROMPT_REF ?? "4f3279c";
    const baseline = ["_shared/persona-schema", "_shared/master-rules", "quiz"]
      .map((name) =>
        execFileSync("git", ["show", `${baselineRef}:src/prompts/${name}.md`], {
          encoding: "utf8",
        }),
      )
      .join("\n\n---\n\n");
    const rows = [];
    let costTotal = 0;
    for (const fixture of PROMPT_QUALITY_FIXTURES) {
      for (const version of ["baseline", "candidate"] as const) {
        // Stop starting new samples over the estimate; not a provider billing cap.
        if (costTotal > 0.8) throw new Error("Prompt evaluation spending limit reached");
        const started = Date.now();
        const candidate = version === "candidate";
        const result = await generate({
          tool: "quiz",
          rulePrompt: candidate ? loadPrompt("quiz") : baseline,
          responseSchema: candidate ? QuizGenerationSchema : undefined,
          dynamicContext: `제목: ${fixture.title}\n요청 난이도: ${fixture.difficulty}\n요청 문제 개수: ${requested}\n허용 kind: multiple-choice, short-answer\n종류별 목표: 객관식 3개, 단답형 3개. 각 종류를 골고루 사용한다.\n쉬움 어학 자료는 stem·explanation 한국어, choices는 원어. 같은 학습 목표는 한 번만 묻는다.\n실제 페이지 표식만 사용한다.`,
          userInput: fixture.source,
          maxTokens: 8192,
          cacheUserInput: true,
        });
        let parsed: ReturnType<typeof parseQuizModelJson>;
        try {
          parsed = parseQuizModelJson(result.text);
        } catch {
          const costUsd = estimateCost(result.usage, result.modelId);
          costTotal += costUsd;
          rows.push({
            version,
            fixture: fixture.name,
            modelId: result.modelId,
            requested,
            generated: 0,
            accepted: 0,
            costUsd,
            ms: Date.now() - started,
            usage: result.usage,
            failure: "Response failed JSON/schema parsing",
          });
          mkdirSync(".tmp", { recursive: true });
          writeFileSync(
            ".tmp/prompt-quality.json",
            JSON.stringify(
              { baselineRef, modelId: getModelIdFor("quiz"), costTotal, rows },
              null,
              2,
            ),
          );
          if (candidate) throw new Error(`Candidate ${fixture.name} failed JSON/schema parsing`);
          process.stdout.write(
            `baseline ${fixture.name}: invalid response, $${costUsd.toFixed(5)}\n`,
          );
          continue;
        }
        expect(parsed.output.rejected).toBe(false);
        if (parsed.output.rejected) continue;
        const evidence = validateEvidence(parsed.output.questions, fixture.source, {
          isMetadataOnly: false,
        });
        const integrity = validateQuestionIntegrity(evidence.kept, {
          allowedKinds: ["multiple-choice", "short-answer"],
          sourceText: fixture.source,
        });
        const unique = integrity.kept.filter(
          (q, i, all) => !all.slice(0, i).some((p) => areNearDuplicateStems(p.stem, q.stem)),
        );
        const verified = await verifyQuizQuestions({
          questions: unique,
          sourceText: fixture.source,
        });
        const costUsd =
          estimateCost(result.usage, result.modelId) +
          (verified.modelId ? estimateCost(verified.usage, verified.modelId) : 0);
        costTotal += costUsd;
        const row = {
          version,
          fixture: fixture.name,
          modelId: result.modelId,
          requested,
          generated: parsed.output.questions.length,
          invalid: parsed.invalidQuestions.length,
          invalidQuestions: parsed.invalidQuestions,
          rawText: result.text,
          exactEvidence: parsed.output.questions.filter((q) =>
            fixture.source.includes(q.evidence.trim()),
          ).length,
          evidencePassed: evidence.kept.length,
          integrityPassed: integrity.kept.length,
          unique: unique.length,
          accepted: verified.kept.length,
          costUsd,
          costPerAccepted: verified.kept.length ? costUsd / verified.kept.length : null,
          ms: Date.now() - started,
          usage: result.usage,
          verifierUsage: verified.usage,
          questions: verified.kept,
          rejected: verified.dropped,
        };
        rows.push(row);
        mkdirSync(".tmp", { recursive: true });
        writeFileSync(
          ".tmp/prompt-quality.json",
          JSON.stringify({ baselineRef, modelId: getModelIdFor("quiz"), costTotal, rows }, null, 2),
        );
        process.stdout.write(
          `${version} ${fixture.name}: ${row.accepted}/${requested} accepted, exact evidence ${row.exactEvidence}/${row.generated}, $${costUsd.toFixed(5)}, ${(row.ms / 1000).toFixed(1)}s\n`,
        );
        if (candidate) {
          expect(verified.technicalFailure).toBe(false);
          expect(row.invalid).toBe(0);
          expect(row.exactEvidence).toBe(row.generated);
          expect(row.integrityPassed).toBe(row.generated);
          expect(row.unique).toBe(row.generated);
          expect(row.accepted).toBeGreaterThanOrEqual(5);
          expect(new Set(row.questions.map((q) => q.kind)).size).toBe(2);
        }
      }
    }
    expect(costTotal).toBeLessThan(0.8);
  }, 600_000);
});
