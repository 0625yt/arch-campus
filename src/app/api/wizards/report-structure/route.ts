import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { enqueueJob, markJobDone, markJobError, markJobRunning } from "@/lib/data/jobs";
import { guardRateLimit } from "@/lib/ratelimit";
import {
  runReportStructure,
  type ReportAudience,
  type ReportType,
} from "@/lib/services/report-structure";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

const TYPE: ReportType[] = ["분석", "비평", "주장", "비교", "사례 연구", "조사 보고"];
const AUDIENCE: ReportAudience[] = ["교수님", "조교", "학우 발표용"];

const RequestSchema = z.object({
  topic: z.string().min(1).max(200),
  reportType: z.enum(TYPE as [ReportType, ...ReportType[]]),
  targetPages: z.number().min(1).max(20),
  audience: z.enum(AUDIENCE as [ReportAudience, ...ReportAudience[]]),
  constraints: z.string().max(400).optional(),
  materialIds: z.array(z.string().min(1)).max(3),
});

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
    const json = await req.json();
    body = RequestSchema.parse(json);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `입력 검증 실패: ${e instanceof Error ? e.message : String(e)}` },
      { status: 400 },
    );
  }

  let materials: Array<{
    id: string;
    title: string;
    page_count: number | null;
    full_text: string | null;
  }> = [];
  if (body.materialIds.length > 0) {
    const admin = getAdminSupabase();
    const { data, error: materialErr } = await admin
      .from("materials")
      .select("id, title, page_count, full_text")
      .eq("owner_id", ownerId)
      .in("id", body.materialIds);
    if (materialErr) {
      return NextResponse.json(
        { ok: false, error: `자료 조회 실패: ${materialErr.message}` },
        { status: 500 },
      );
    }
    if (!data || data.length === 0) {
      return NextResponse.json(
        { ok: false, error: "선택한 자료가 본인 자료가 아니거나 삭제됐어요" },
        { status: 404 },
      );
    }
    materials = data;
  }

  const { job } = await enqueueJob({
    ownerId,
    materialId: null,
    tool: "report-structure",
    inputParams: {
      topic: body.topic,
      reportType: body.reportType,
      targetPages: body.targetPages,
      audience: body.audience,
      constraints: body.constraints ?? null,
      materialIds: body.materialIds,
    },
  });

  after(async () => {
    try {
      await markJobRunning(job.id);
      const result = await runReportStructure({
        ownerId,
        topic: body.topic,
        reportType: body.reportType,
        targetPages: body.targetPages,
        audience: body.audience,
        constraints: body.constraints,
        materials: materials.map((m) => ({
          id: m.id,
          title: m.title,
          pages: m.page_count,
          fullText: m.full_text ?? "",
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
