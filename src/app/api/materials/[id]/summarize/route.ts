import { after, NextResponse } from "next/server";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { enqueueJob, markJobDone, markJobError, markJobRunning } from "@/lib/data/jobs";
import { runSummarize } from "@/lib/services/summarize";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * 이미 업로드된 자료의 (재)요약 — 비동기.
 *
 * 동작:
 *  1) 자료 owner 검증
 *  2) jobs에 pending 행 만들기 (같은 자료+tool active 있으면 그걸 재사용)
 *  3) 즉시 { ok, jobId } 응답
 *  4) after()로 백그라운드에서 runSummarize → markJobDone/Error
 *
 * 클라이언트는 jobId 받자마자 다른 페이지 가도 됨.
 * 폴링: GET /api/jobs/{jobId}
 */
export async function POST(
  _req: Request,
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

  const admin = getAdminSupabase();
  const { data: material, error: fetchErr } = await admin
    .from("materials")
    .select("id, title, type, full_text, page_count")
    .eq("id", materialId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (fetchErr || !material) {
    return NextResponse.json({ ok: false, error: "자료를 찾을 수 없어요" }, { status: 404 });
  }

  const fullText = material.full_text ?? "";
  if (!fullText.trim()) {
    return NextResponse.json(
      { ok: false, error: "자료 본문이 비어있어 요약을 만들 수 없어요" },
      { status: 422 },
    );
  }

  // 작업 큐 등록
  const { job, isNew } = await enqueueJob({
    ownerId,
    materialId: material.id,
    tool: "summarize",
    inputParams: { materialId: material.id, title: material.title, type: material.type },
  });

  // 이미 진행 중인 작업이면 재실행 안 하고 같은 jobId 반환
  if (!isNew) {
    return NextResponse.json({
      ok: true,
      jobId: job.id,
      reused: true,
      status: job.status,
    });
  }

  // 백그라운드 실행 — 응답 보낸 뒤에도 함수 max duration 동안 계속
  after(async () => {
    try {
      await markJobRunning(job.id);
      const result = await runSummarize({
        ownerId,
        materialId: material.id,
        title: material.title,
        type: material.type,
        fullText,
        sanitizedText: fullText,
        pageCount: material.page_count ?? null,
        parserWarnings: [],
      });

      if (!result.ok) {
        await markJobError({ jobId: job.id, errorMessage: result.error });
        return;
      }

      await markJobDone({
        jobId: job.id,
        result: { summary: result.summary },
        modelId: result.modelId,
        usage: result.usage,
        costUsd: result.costUsd,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await markJobError({ jobId: job.id, errorMessage: msg });
    }
  });

  return NextResponse.json({
    ok: true,
    jobId: job.id,
    reused: false,
    status: "pending",
  });
}
