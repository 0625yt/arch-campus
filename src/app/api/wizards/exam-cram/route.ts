import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { enqueueJob, markJobDone, markJobError, markJobRunning } from "@/lib/data/jobs";
import { runExamCram } from "@/lib/services/exam-cram";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

const RequestSchema = z.object({
  subject: z.string().min(1).max(120),
  remainingMin: z.coerce.number().int().min(1).max(10000),
  weakSpots: z.string().max(800).optional(),
  materialIds: z.array(z.string().min(1)).min(1).max(8),
});

/**
 * POST /api/wizards/exam-cram — 비동기.
 *
 * jobs 테이블에 wizard-cram 작업 등록 → 즉시 jobId 반환 → after()에서 실행.
 * material_id는 null (자료 N개를 input_params.materialIds에 저장).
 * 같은 사용자가 진행 중인 wizard-cram이 이미 있어도 새 작업으로 만든다
 * (자료 묶음·시간 조합이 매번 다르므로 dedupe X — UNIQUE index도 material_id null이라 빠짐).
 *
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

  let body: z.infer<typeof RequestSchema>;
  try {
    const json = await req.json();
    body = RequestSchema.parse(json);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `입력 검증 실패: ${e instanceof Error ? e.message : String(e)}` },
      { status: 400 },
    );
  }

  const admin = getAdminSupabase();
  const { data: materials, error: materialErr } = await admin
    .from("materials")
    .select("id, title, page_count, full_text, summary_keywords")
    .eq("owner_id", ownerId)
    .in("id", body.materialIds);

  if (materialErr) {
    return NextResponse.json(
      { ok: false, error: `자료 조회 실패: ${materialErr.message}` },
      { status: 500 },
    );
  }
  if (!materials || materials.length === 0) {
    return NextResponse.json(
      { ok: false, error: "선택한 자료가 본인 자료가 아니거나 삭제됐어요" },
      { status: 404 },
    );
  }

  const { job } = await enqueueJob({
    ownerId,
    materialId: null, // 위저드는 자료 N개라 단일 material_id가 없음
    tool: "wizard-cram",
    inputParams: {
      subject: body.subject,
      remainingMin: body.remainingMin,
      weakSpots: body.weakSpots ?? null,
      materialIds: body.materialIds,
    },
  });

  after(async () => {
    try {
      await markJobRunning(job.id);
      const result = await runExamCram({
        ownerId,
        subject: body.subject,
        remainingMin: body.remainingMin,
        weakSpots: body.weakSpots,
        materials: materials.map((m) => ({
          id: m.id,
          title: m.title,
          pages: m.page_count,
          fullText: m.full_text ?? "",
          extractedKeywords: m.summary_keywords,
        })),
      });

      if (!result.ok) {
        await markJobError({ jobId: job.id, errorMessage: result.error });
        return;
      }

      await markJobDone({
        jobId: job.id,
        result: { output: result.output },
        modelId: result.modelId,
        usage: result.usage,
        costUsd: result.costUsd,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await markJobError({ jobId: job.id, errorMessage: msg });
    }
  });

  return NextResponse.json({ ok: true, jobId: job.id, status: "pending" });
}
