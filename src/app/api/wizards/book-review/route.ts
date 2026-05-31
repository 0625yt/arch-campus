import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { enqueueJob, markJobDone, markJobError, markJobRunning } from "@/lib/data/jobs";
import { guardRateLimit } from "@/lib/ratelimit";
import { runBookReview } from "@/lib/services/book-review";

export const runtime = "nodejs";
export const maxDuration = 300;

const RequestSchema = z.object({
  bookTitle: z.string().min(1).max(120),
  bookAuthor: z.string().max(80).default(""),
  notes: z.array(z.string().min(1).max(600)).min(1).max(8),
  feeling: z.string().max(200).optional(),
  lengthHint: z.enum(["short", "medium", "long"]).optional(),
});

/**
 * POST /api/wizards/book-review — 비동기.
 *
 * jobs 테이블에 등록 → jobId 반환 → after()에서 runBookReview 실행.
 * 폴링: GET /api/jobs/{jobId} 에서 result.output 받기.
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
      bookTitle: body.bookTitle,
      bookAuthor: body.bookAuthor,
      notes: body.notes,
      feeling: body.feeling ?? null,
      lengthHint: body.lengthHint ?? "medium",
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
        feeling: body.feeling,
        lengthHint: body.lengthHint,
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
