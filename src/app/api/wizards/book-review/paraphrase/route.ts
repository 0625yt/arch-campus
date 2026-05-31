import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { enqueueJob, markJobDone, markJobError, markJobRunning } from "@/lib/data/jobs";
import { guardRateLimit } from "@/lib/ratelimit";
import { BookReviewOutput } from "@/lib/schemas";
import { runBookReview } from "@/lib/services/book-review";

export const runtime = "nodejs";
export const maxDuration = 300;

const RequestSchema = z.object({
  bookTitle: z.string().min(1).max(120),
  bookAuthor: z.string().max(80).default(""),
  notes: z.array(z.string().min(1).max(600)).min(1).max(8),
  lengthHint: z.enum(["short", "medium", "long"]).optional(),
  /** 이전 초안 */
  previous: BookReviewOutput,
  /** 다시 쓰기 톤 시드 (이전 결과의 paraphrasePromptSeed 그대로 또는 사용자 커스텀) */
  seed: z.string().min(5).max(400),
});

/**
 * POST /api/wizards/book-review/paraphrase — 다시 쓰기 (1급 액션).
 *
 * 이전 초안을 paraphrase한다. 사고 흐름·메모 인용 유지, 어휘 70%+ 교체.
 * 같은 jobs 큐 사용 (tool="book-review", inputParams.paraphrase=true).
 */
export async function POST(req: Request): Promise<NextResponse> {
  let ownerId: string;
  try {
    ownerId = await getOwnerId();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    throw e;
  }

  const blocked = await guardRateLimit("ai", ownerId);
  if (blocked) return blocked;

  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `입력 검증 실패: ${e instanceof Error ? e.message : String(e)}` },
      { status: 400 },
    );
  }

  const { job } = await enqueueJob({
    ownerId,
    materialId: null,
    tool: "book-review",
    inputParams: {
      paraphrase: true,
      bookTitle: body.bookTitle,
      bookAuthor: body.bookAuthor,
      notes: body.notes,
      lengthHint: body.lengthHint ?? "medium",
      seed: body.seed,
    },
  });

  after(async () => {
    try {
      await markJobRunning({ jobId: job.id, ownerId });

      const result = await runBookReview({
        ownerId,
        bookTitle: body.bookTitle,
        bookAuthor: body.bookAuthor,
        notes: body.notes,
        lengthHint: body.lengthHint,
        paraphraseFrom: {
          previous: body.previous,
          seed: body.seed,
        },
      });

      if (!result.ok) {
        await markJobError({ jobId: job.id, ownerId, errorMessage: result.error });
        return;
      }

      await markJobDone({
        jobId: job.id,
        ownerId,
        result: { output: result.output },
        modelId: result.modelId,
        usage: result.usage,
        costUsd: result.costUsd,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await markJobError({ jobId: job.id, ownerId, errorMessage: msg });
    }
  });

  return NextResponse.json({ ok: true, jobId: job.id, status: "pending" });
}
