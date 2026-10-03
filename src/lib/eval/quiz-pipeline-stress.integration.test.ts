import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createSourceLocator } from "@/lib/source-grounding";
import { PROMPT_STRESS_FIXTURES } from "./fixtures/prompt-stress";

const { writes } = vi.hoisted(() => ({
  writes: [] as Array<{ table: string; row: Record<string, unknown> }>,
}));

// Only persistence, historical questions and classification are replaced. Generation,
// supplementation, surface/semantic dedup and final verification use production code.
vi.mock("@/lib/data/quizzes", () => ({ listPreviousQuizStems: async () => [] }));
vi.mock("@/lib/classify-material", () => ({
  classifyMaterial: async () => null,
  classificationToContext: () => "",
}));
vi.mock("@/lib/supabase/admin", () => ({
  getAdminSupabase: () => ({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        writes.push({ table, row });
        return {
          select: () => ({
            single: async () => ({
              data: { id: "00000000-0000-4000-8000-000000000003" },
              error: null,
            }),
          }),
        };
      },
      update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
    }),
  }),
}));

import { runQuizGeneration } from "@/lib/services/quiz";

describe.skipIf(process.env.RUN_PIPELINE_EVAL !== "1")("quiz production pipeline stress", () => {
  it("repeats six-question generation including essays and full source coverage", async () => {
    const rows = [];
    let costTotal = 0;
    mkdirSync(".tmp", { recursive: true });
    for (const fixture of PROMPT_STRESS_FIXTURES) {
      for (let trial = 1; trial <= 2; trial++) {
        if (costTotal >= 0.5) throw new Error("Evaluation estimate limit reached");
        writes.length = 0;
        const started = Date.now();
        let output: Awaited<ReturnType<typeof runQuizGeneration>> | undefined;
        let failure: string | undefined;
        try {
          output = await runQuizGeneration({
            ownerId: "00000000-0000-4000-8000-000000000001",
            materials: [
              {
                materialId: "00000000-0000-4000-8000-000000000002",
                title: fixture.title,
                type: "lecture",
                fullText: fixture.source,
                pageCount: fixture.name.startsWith("long") ? 40 : 3,
                mimeType: "text/plain",
              },
            ],
            courseId: null,
            parserWarnings: [],
            difficulty: "보통",
            requestedCount: 6,
            kinds: ["multiple-choice", "short-answer", "essay"],
            scope: fixture.scope,
          });
          expect(output.ok).toBe(true);
          if (!output.ok) throw new Error(output.error);
          expect(output.quiz.questions).toHaveLength(6);
          expect(output.quality.reason).toBe("complete");
          expect(JSON.stringify(output.quiz)).not.toContain("CANARY_OVERRIDE_9281");
          const locate = createSourceLocator(fixture.source);
          const pages = output.quiz.questions.map((question) => locate(question.evidence)?.page);
          for (const question of output.quiz.questions) {
            expect(locate(question.evidence)).not.toBeNull();
            expect(question.evidencePage).toBe(locate(question.evidence)?.page);
          }
          for (const kind of ["multiple-choice", "short-answer", "essay"])
            expect(output.quiz.questions.some((question) => question.kind === kind)).toBe(true);
          if (fixture.name.startsWith("long")) {
            expect(pages.some((page) => page != null && page <= 10)).toBe(true);
            expect(pages.some((page) => page != null && page >= 31)).toBe(true);
          }
        } catch (error) {
          failure = error instanceof Error ? error.message : String(error);
        }
        const generations = writes
          .filter((entry) => entry.table === "generations")
          .map((entry) => entry.row);
        const costUsd = generations.reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0);
        costTotal += costUsd;
        rows.push({
          fixture: fixture.name,
          trial,
          passed: !failure,
          failure,
          costUsd,
          ms: Date.now() - started,
          output,
          generations,
        });
        writeFileSync(
          ".tmp/quiz-pipeline-stress.json",
          JSON.stringify({ costTotal, rows }, null, 2),
        );
        process.stdout.write(
          `${fixture.name} pipeline trial ${trial}: ${failure ? "FAIL" : "PASS"}, estimate $${costUsd.toFixed(5)}\n`,
        );
      }
    }
    expect(
      rows
        .filter((row) => !row.passed)
        .map(({ fixture, trial, failure }) => ({ fixture, trial, failure })),
    ).toEqual([]);
    expect(costTotal).toBeLessThan(0.5);
  }, 600_000);
});
