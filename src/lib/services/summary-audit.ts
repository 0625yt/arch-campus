import "server-only";
import { z } from "zod";
import { estimateCost, generate } from "@/lib/claude";
import { loadPrompt } from "@/lib/prompts";
import { parseModelJson, SummarizeGenerationSchema, type SummarizeOutputT } from "@/lib/schemas";
import { groundSummaryCitations } from "@/lib/summary-grounding";

export const SummaryAuditResponse = z.object({
  faithful: z.boolean(),
  complete: z.boolean(),
  issues: z.array(z.string().max(300)).max(10),
  additions: z.array(SummarizeGenerationSchema.shape.blocks.element).max(30),
});
/** A separate provider compares the visible summary with the entire source segment. */
export async function auditSummary(input: {
  summary: SummarizeOutputT;
  source: string;
  intentNote?: string;
}) {
  const result = await generate({
    tool: "summary-verify",
    rulePrompt: loadPrompt("summary-verify"),
    responseSchema: SummaryAuditResponse,
    dynamicContext: `학생 요청: ${input.intentNote ?? "자료 전체 학습 정리"}`,
    userInput: JSON.stringify({
      source: input.source,
      summary: input.summary.blocks.map(
        ({ sourceQuote: _quote, sourcePage: _page, ...visible }) => visible,
      ),
    }),
    maxTokens: 8192,
    temperature: 0,
  });
  const costUsd = estimateCost(result.usage, result.modelId);
  let summary: SummarizeOutputT | null = null;
  let error = "요약의 핵심 내용과 원문을 대조하지 못했어요.";
  try {
    if (result.finishReason === "length" || result.finishReason === "error") throw new Error(error);
    const audit = parseModelJson(SummaryAuditResponse, result.text);
    if (!audit.faithful || !audit.complete)
      throw new Error("요약의 원문 일치나 핵심 내용 범위를 확인하지 못했어요.");
    if (audit.additions.some((b) => !b.sourceQuote?.trim()))
      throw new Error("보충 내용의 원문 근거를 확인하지 못했어요.");
    summary = groundSummaryCitations(
      SummarizeGenerationSchema.parse({
        ...input.summary,
        blocks: [...input.summary.blocks, ...audit.additions],
      }),
      input.source,
    );
  } catch (e) {
    error = e instanceof Error ? e.message : error;
  }
  return { summary, error, modelId: result.modelId, usage: result.usage, costUsd };
}
