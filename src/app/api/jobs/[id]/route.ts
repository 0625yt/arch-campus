import { NextResponse } from "next/server";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { getJob } from "@/lib/data/jobs";

export const runtime = "nodejs";

/**
 * GET /api/jobs/[id]
 *
 * 클라이언트가 폴링해서 작업 상태 받는 단일 진입점.
 * - 200 + { status, result, errorMessage, ... } 진행 상태
 * - 404 본인 작업 아님 또는 삭제됨
 * - 401 미인증
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  let ownerId: string;
  try {
    ownerId = await getOwnerId();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    throw e;
  }

  const { id } = await ctx.params;
  const job = await getJob({ ownerId, jobId: id });
  if (!job) {
    return NextResponse.json({ ok: false, error: "job not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    job: {
      id: job.id,
      tool: job.tool,
      status: job.status,
      materialId: job.materialId,
      result: job.result,
      errorMessage: job.errorMessage,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      cost: job.costUsd,
    },
  });
}
