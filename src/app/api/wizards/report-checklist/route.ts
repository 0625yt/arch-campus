import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { enqueueJob, markJobDone, markJobError, markJobRunning } from "@/lib/data/jobs";
import { runReportChecklist } from "@/lib/services/report-checklist";

export const runtime = "nodejs";
export const maxDuration = 300;

const RequestSchema = z.object({
  assignmentTitle: z.string().min(1).max(120),
  /** ISO date string. 학생이 모르면 null. */
  dueAt: z.string().min(1).max(40).nullable().optional(),
  /** LMS·이메일 본문 — 30~12000자 (서비스에서 재검증). */
  noticeText: z.string().min(1).max(20_000),
  extraNotes: z.string().max(2000).optional(),
});

/**
 * POST /api/wizards/report-checklist — 비동기.
 *
 * 자료 의존 X (공지 텍스트만으로 동작) → materialId=null로 jobs 등록.
 * 같은 조합 dedupe 안 함 (공지가 매번 다르므로).
 *
 * 폴링: GET /api/jobs/{jobId}
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

  const { job } = await enqueueJob({
    ownerId,
    materialId: null,
    tool: "wizard-assignment",
    inputParams: {
      assignmentTitle: body.assignmentTitle,
      dueAt: body.dueAt ?? null,
      noticeLength: body.noticeText.length,
    },
  });

  after(async () => {
    try {
      await markJobRunning(job.id);
      const result = await runReportChecklist({
        ownerId,
        assignmentTitle: body.assignmentTitle,
        noticeText: body.noticeText,
        dueAt: body.dueAt ?? null,
        extraNotes: body.extraNotes,
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
