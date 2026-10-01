import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { enqueueJob, markJobDone, markJobError, markJobRunning } from "@/lib/data/jobs";
import { guardRateLimit } from "@/lib/ratelimit";
import {
  type PresentationAudience,
  type PresentationGoal,
  runPresentation,
} from "@/lib/services/presentation";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

const AUDIENCE: PresentationAudience[] = ["교수님", "동기", "신입생", "외부"];
const GOAL: PresentationGoal[] = ["이해", "설득", "공유", "토론 유도"];

const RequestSchema = z.object({
  topic: z.string().min(1).max(200),
  audience: z.enum(AUDIENCE as [PresentationAudience, ...PresentationAudience[]]),
  durationMin: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20)]),
  goal: z.enum(GOAL as [PresentationGoal, ...PresentationGoal[]]),
  constraints: z.string().max(400).optional(),
  /** 0~3개. 발표는 보통 자료 1건이라 cram보다 적게 */
  materialIds: z.array(z.string().min(1)).max(3),
});

/**
 * POST /api/wizards/presentation — 비동기.
 *
 * jobs 테이블에 presentation 작업 등록 → 즉시 jobId 반환 → after()에서 실행.
 * material_id는 null (자료가 0~N개라 단일 PK 못 박음. input_params.materialIds로 저장).
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

  // 자료 0건이면 본문 없이 진행. 1건 이상이면 본인 자료인지 확인.
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
    tool: "presentation",
    inputParams: {
      topic: body.topic,
      audience: body.audience,
      durationMin: body.durationMin,
      goal: body.goal,
      constraints: body.constraints ?? null,
      materialIds: body.materialIds,
    },
  });

  after(async () => {
    try {
      if (!(await markJobRunning({ jobId: job.id, ownerId }))) return;

      const result = await runPresentation({
        ownerId,
        topic: body.topic,
        audience: body.audience,
        durationMin: body.durationMin,
        goal: body.goal,
        constraints: body.constraints,
        materials: materials.map((m) => ({
          id: m.id,
          title: m.title,
          pages: m.page_count,
          fullText: m.full_text ?? "",
        })),
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
