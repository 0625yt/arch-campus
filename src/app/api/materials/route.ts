import { NextResponse } from "next/server";
import { markJobDone, markJobError, markJobRunning } from "@/lib/data/jobs";
import { type Difficulty, runQuizGeneration } from "@/lib/services/quiz";
import { runSummarize } from "@/lib/services/summarize";

export const runtime = "nodejs";
export const maxDuration = 300;

interface PipelineErr {
  ok: false;
  error: string;
  reason?: string;
}

/**
 * @deprecated 2026-05-31 — multipart 단일 업로드는 더 이상 지원하지 않음.
 *
 * 새 흐름: upload-url → 클라가 직접 PUT → finalize / finalize-merged.
 * 본 핸들러는 410 Gone — 외부에서 잘못 호출해도 새 엔드포인트로 안내.
 * runSummarizeJob·runQuizJob·stripExt는 finalize·finalize-merged가 재사용 중이라 유지.
 */
export async function POST(_req: Request): Promise<NextResponse<PipelineErr>> {
  return NextResponse.json(
    {
      ok: false,
      error:
        "이 엔드포인트는 더 이상 지원하지 않아요. /api/materials/upload-url → PUT → /api/materials/finalize 흐름을 사용해주세요.",
      reason: "deprecated",
    },
    { status: 410 },
  );
}

export async function runSummarizeJob(opts: {
  jobId: string;
  ownerId: string;
  materialId: string;
  title: string;
  type: string;
  fullText: string;
  sanitizedText: string;
  pageCount: number | null;
  parserWarnings: string[];
  /** 업로드 시 사용자가 입력한 한 줄 요청 — 첫 요약부터 반영. 120자 cap은 라우트에서. */
  intentNote?: string;
}): Promise<void> {
  try {
    if (!(await markJobRunning({ jobId: opts.jobId, ownerId: opts.ownerId }))) return;
    const result = await runSummarize({
      ownerId: opts.ownerId,
      materialId: opts.materialId,
      title: opts.title,
      type: opts.type,
      fullText: opts.fullText,
      sanitizedText: opts.sanitizedText,
      pageCount: opts.pageCount,
      parserWarnings: opts.parserWarnings,
      intentNote: opts.intentNote,
    });
    if (!result.ok) {
      await markJobError({ jobId: opts.jobId, ownerId: opts.ownerId, errorMessage: result.error });
      return;
    }
    await markJobDone({
      jobId: opts.jobId,
      ownerId: opts.ownerId,
      result: { summary: result.summary },
      modelId: result.modelId,
      usage: result.usage,
      costUsd: result.costUsd,
    });
  } catch (e) {
    await markJobError({
      jobId: opts.jobId,
      ownerId: opts.ownerId,
      errorMessage: e instanceof Error ? e.message : String(e),
    });
  }
}

export async function runQuizJob(opts: {
  jobId: string;
  ownerId: string;
  materialId: string;
  courseId: string | null;
  title: string;
  type: string;
  fullText: string;
  sanitizedText: string;
  pageCount: number | null;
  mimeType?: string | null;
  parserWarnings: string[];
  difficulty: Difficulty;
  requestedCount: number;
}): Promise<void> {
  try {
    if (!(await markJobRunning({ jobId: opts.jobId, ownerId: opts.ownerId }))) return;
    const result = await runQuizGeneration({
      ownerId: opts.ownerId,
      courseId: opts.courseId,
      materials: [
        {
          materialId: opts.materialId,
          title: opts.title,
          type: opts.type,
          fullText: opts.sanitizedText,
          pageCount: opts.pageCount,
          mimeType: opts.mimeType ?? null,
        },
      ],
      parserWarnings: opts.parserWarnings,
      difficulty: opts.difficulty,
      requestedCount: opts.requestedCount,
    });
    if (!result.ok) {
      await markJobError({ jobId: opts.jobId, ownerId: opts.ownerId, errorMessage: result.error });
      return;
    }
    await markJobDone({
      jobId: opts.jobId,
      ownerId: opts.ownerId,
      result: { quizId: result.quizId, quality: result.quality },
      modelId: result.modelId,
      usage: result.usage,
      costUsd: result.costUsd,
    });
  } catch (e) {
    await markJobError({
      jobId: opts.jobId,
      ownerId: opts.ownerId,
      errorMessage: e instanceof Error ? e.message : String(e),
    });
  }
}

export function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}
