import type { SummarizeOutputT } from "./schemas";
import { createSourceLocator } from "./source-grounding";

/** Check citations without an extra model call; this does not verify every summary claim. */
export function groundSummaryCitations(
  summary: SummarizeOutputT,
  source: string,
): SummarizeOutputT {
  const locate = createSourceLocator(source);
  return {
    ...summary,
    blocks: summary.blocks.map((block) => {
      if (!block.sourceQuote?.trim()) return { ...block, sourcePage: null, sourceQuote: null };
      const location = locate(block.sourceQuote);
      if (!location) throw new Error("요약 인용의 실제 원문 위치를 확인하지 못했어요.");
      return { ...block, sourcePage: location.page, sourceQuote: location.quote };
    }),
  };
}
