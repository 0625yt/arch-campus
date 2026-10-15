import { describe, expect, it, vi } from "vitest";
import { MODELS } from "@/lib/claude";
import { PROMPT_QUALITY_FIXTURES } from "./fixtures/prompt-quality";

const { logGenerationMock } = vi.hoisted(() => ({
  logGenerationMock: vi.fn(async (_row: Record<string, unknown>) => ({ error: null })),
}));

// Real generation and service validation; replace only persistence. Synthetic inputs only.
vi.mock("@/lib/supabase/admin", () => ({
  getAdminSupabase: () => ({ from: () => ({ insert: logGenerationMock }) }),
}));

import { runBookReview } from "@/lib/services/book-review";
import { runExamCram } from "@/lib/services/exam-cram";
import { runPresentation } from "@/lib/services/presentation";

const fixture = PROMPT_QUALITY_FIXTURES[1];
const materials = [{ id: "synthetic-cs", title: fixture.title, fullText: fixture.source }];

describe.skipIf(process.env.RUN_WIZARD_UPGRADE_EVAL !== "1")(
  "wizard upgrade service checks",
  () => {
    it("presentation validates slide count, timing and source quotations", async () => {
      const result = await runPresentation({
        ownerId: "synthetic",
        topic: "탐색과 동기화",
        audience: "동기",
        durationMin: 10,
        goal: "이해",
        materials,
      });
      expect(result, JSON.stringify(result)).toMatchObject({
        ok: true,
        modelId: MODELS.gemini38Flash,
      });
    }, 120_000);

    it("cram plan validates source IDs, evidence and available time", async () => {
      logGenerationMock.mockClear();
      const result = await runExamCram({
        ownerId: "synthetic",
        subject: "탐색과 동기화",
        remainingMin: 120,
        materials,
      });
      expect(
        result,
        JSON.stringify({
          result,
          diagnostics: logGenerationMock.mock.calls.map(([row]) => row.error_message),
        }),
      ).toMatchObject({
        ok: true,
        modelId: MODELS.gemini36Flash,
      });
      if (result.ok) expect(result.output.rejected).not.toBe(true);
    }, 120_000);

    it("book review validates student note quotations and structure", async () => {
      const result = await runBookReview({
        ownerId: "synthetic",
        bookTitle: "가상의 도서관 이야기",
        bookAuthor: "가상 작가",
        notes: [
          "주인공은 오래된 도서관에서 이웃들의 편지를 정리하며 서로 다른 기억을 발견한다.",
          "마지막에 편지를 돌려주는 장면에서 기록을 소유하는 일과 공유하는 일이 다르다고 느꼈다.",
        ],
        lengthHint: "short",
      });
      expect(result, JSON.stringify(result)).toMatchObject({
        ok: true,
        modelId: MODELS.gemini38Flash,
      });
    }, 120_000);
  },
);
