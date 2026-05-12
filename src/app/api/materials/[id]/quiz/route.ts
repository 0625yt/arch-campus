import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { enqueueJob, markJobDone, markJobError, markJobRunning } from "@/lib/data/jobs";
import { runQuizGeneration } from "@/lib/services/quiz";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

const RequestBody = z.object({
  difficulty: z.enum(["쉬움", "보통", "어려움"]).default("보통"),
  count: z.number().int().min(1).max(10).default(5),
});

/**
 * 자료 기반 퀴즈 생성 — 비동기.
 *
 * 동작:
 *  1) 자료 owner 검증
 *  2) jobs에 pending 행 등록 (같은 자료+quiz active 있으면 재사용)
 *  3) 즉시 jobId 응답
 *  4) after()에서 runQuizGeneration → markJobDone/Error
 *
 * 폴링: GET /api/jobs/{jobId}
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
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

  const { id: materialId } = await params;

  let body: z.infer<typeof RequestBody>;
  try {
    const json = await req.json();
    body = RequestBody.parse(json);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `요청 형식 오류: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 400 },
    );
  }

  const admin = getAdminSupabase();
  const { data: material, error: fetchErr } = await admin
    .from("materials")
    .select("id, course_id, title, type, full_text, page_count")
    .eq("id", materialId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (fetchErr || !material) {
    return NextResponse.json({ ok: false, error: "자료를 찾을 수 없어요" }, { status: 404 });
  }

  const fullText = material.full_text ?? "";

  // 작업 큐 등록 (난이도·개수 다른 요청도 같은 자료면 1개만)
  const { job, isNew } = await enqueueJob({
    ownerId,
    materialId: material.id,
    tool: "quiz",
    inputParams: {
      materialId: material.id,
      difficulty: body.difficulty,
      count: body.count,
    },
  });

  if (!isNew) {
    return NextResponse.json({ ok: true, jobId: job.id, reused: true, status: job.status });
  }

  after(async () => {
    try {
      await markJobRunning(job.id);
      const result = await runQuizGeneration({
        ownerId,
        materialId: material.id,
        courseId: material.course_id ?? null,
        title: material.title,
        type: material.type,
        fullText,
        sanitizedText: fullText,
        pageCount: material.page_count ?? null,
        parserWarnings: [],
        difficulty: body.difficulty,
        requestedCount: body.count,
      });

      if (!result.ok) {
        await markJobError({ jobId: job.id, errorMessage: result.error });
        return;
      }

      await markJobDone({
        jobId: job.id,
        result: { quizId: result.quizId },
        modelId: result.modelId,
        usage: result.usage,
        costUsd: result.costUsd,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await markJobError({ jobId: job.id, errorMessage: msg });
    }
  });

  return NextResponse.json({ ok: true, jobId: job.id, reused: false, status: "pending" });
}
