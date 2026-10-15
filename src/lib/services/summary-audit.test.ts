import { beforeEach, expect, it, vi } from "vitest";

const generate = vi.hoisted(() => vi.fn());
vi.mock("@/lib/claude", async (original) => ({
  ...(await original<typeof import("@/lib/claude")>()),
  generate,
}));

import type { SummarizeOutputT } from "@/lib/schemas";
import { auditSummary } from "./summary-audit";

const source =
  "효과 크기는 차이나 관련성의 규모를 나타낸다. 통계적 유의성과 실용적 중요성은 다르다.";
const summary = {
  leadSentence: "통계적 유의성을 정리하는 요약입니다.",
  blocks: Array.from({ length: 5 }, () => ({ type: "h2", content: "핵심 내용" })),
  keywords: ["효과", "유의성", "중요성"],
  reviewSpots: [{ title: "핵심 확인", why: "자료의 주요 개념을 다시 확인하세요." }],
  watermark: "원문과 함께 확인하는 학습 자료입니다.",
} as SummarizeOutputT;
beforeEach(() =>
  generate.mockResolvedValue({
    modelId: "gemini-3.5-flash-lite",
    usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0 },
    text: JSON.stringify({
      faithful: true,
      complete: true,
      issues: [],
      additions: [{ type: "para", content: source, sourceQuote: source }],
    }),
  }),
);
it("adds missing definitions using a validated source quote", async () => {
  const result = await auditSummary({ summary, source: `=== Page 2 ===\n${source}` });
  expect(result.summary?.blocks.at(-1)).toMatchObject({
    content: source,
    sourceQuote: source,
    sourcePage: 2,
  });
});
it("does not publish contradictions or an incomplete audit", async () => {
  generate.mockResolvedValueOnce({
    modelId: "gemini-3.5-flash-lite",
    usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0 },
    text: JSON.stringify({ faithful: false, complete: true, issues: ["반대 의미"], additions: [] }),
  });
  expect((await auditSummary({ summary, source })).summary).toBeNull();
});
it("rejects fabricated citations on supplemental visuals", async () => {
  generate.mockResolvedValueOnce({
    modelId: "gemini-3.5-flash-lite",
    usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0 },
    text: JSON.stringify({
      faithful: true,
      complete: true,
      issues: [],
      additions: [
        {
          type: "table",
          caption: "거짓 비교",
          headers: ["기준", "값"],
          rows: [["수치", "100"]],
          sourceQuote: "원문에 없는 새로운 수치와 설명입니다.",
        },
      ],
    }),
  });
  expect((await auditSummary({ summary, source })).summary).toBeNull();
});
