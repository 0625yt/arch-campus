import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { enqueueJob, markJobDone, markJobError, markJobRunning } from "@/lib/data/jobs";
import { guardRateLimit } from "@/lib/ratelimit";
import { runQuizGeneration } from "@/lib/services/quiz";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

const RequestBody = z.object({
  difficulty: z.enum(["쉬움", "보통", "어려움"]).default("보통"),
  // 최대 50 — UI는 1·3·5·10·20·30·50 chip + 자유 입력 1~50. 50개는 청크 분할·보충 호출로 생성.
  count: z.number().int().min(1).max(50).default(5),
  // kinds·scope는 옵션 — 빈 배열·빈 문자열이면 종전 동작(객관식만, 자료 전체)
  kinds: z
    .array(z.enum(["multiple-choice", "short-answer", "essay"]))
    .max(3)
    .default([]),
  scope: z.string().max(200).default(""),
  // 의도 조정 한 줄 요청 — scope(범위)와 분리. 강조·형식·톤 힌트. 자료 밖 생성은 서비스/프롬프트 가드가 거부.
  intentNote: z.string().max(120).default(""),
  // 묶음 출제 — primary 자료 외 추가 자료 UUID들. UI에서 같은 강의 안 자료 다중 선택.
  // 합쳐서 60,000자까지. owner 검증은 라우트에서 한 번 더.
  extraMaterialIds: z.array(z.string().uuid()).max(5).default([]),
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

  const blocked = await guardRateLimit("ai", ownerId);
  if (blocked) return blocked;

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
  // primary + extra 모두 한 번에 조회. owner 검증 자동.
  const allIds = [materialId, ...body.extraMaterialIds.filter((id) => id !== materialId)];
  const { data: materialsData, error: fetchErr } = await admin
    .from("materials")
    .select("id, course_id, title, type, full_text, page_count, mime_type")
    .in("id", allIds)
    .eq("owner_id", ownerId);

  if (fetchErr || !materialsData || materialsData.length === 0) {
    return NextResponse.json({ ok: false, error: "자료를 찾을 수 없어요" }, { status: 404 });
  }

  // primary가 첫 번째여야 함 (제목·course_id 박힐 자료). DB 순서 보장 X → 직접 정렬.
  const primary = materialsData.find((m) => m.id === materialId);
  if (!primary) {
    return NextResponse.json(
      { ok: false, error: "primary 자료를 찾을 수 없어요" },
      { status: 404 },
    );
  }
  const extras = materialsData.filter((m) => m.id !== materialId);
  const materialsInOrder = [primary, ...extras];

  // 작업 큐 등록 (난이도·개수·kinds·scope·extraIds 다른 요청도 primary 자료면 1개만)
  const { job, isNew } = await enqueueJob({
    ownerId,
    materialId: primary.id,
    tool: "quiz",
    inputParams: {
      materialId: primary.id,
      difficulty: body.difficulty,
      count: body.count,
      kinds: body.kinds,
      scope: body.scope,
      intentNote: body.intentNote,
      extraMaterialIds: extras.map((m) => m.id),
    },
  });

  if (!isNew) {
    return NextResponse.json({ ok: true, jobId: job.id, reused: true, status: job.status });
  }

  after(async () => {
    try {
      if (!(await markJobRunning({ jobId: job.id, ownerId }))) return;
      const result = await runQuizGeneration({
        ownerId,
        courseId: primary.course_id ?? null,
        materials: materialsInOrder.map((m) => ({
          materialId: m.id,
          title: m.title,
          type: m.type,
          fullText: m.full_text ?? "",
          pageCount: m.page_count ?? null,
          mimeType: m.mime_type ?? null,
        })),
        parserWarnings: [],
        difficulty: body.difficulty,
        requestedCount: body.count,
        kinds: body.kinds,
        scope: body.scope,
        intentNote: body.intentNote,
      });

      if (!result.ok) {
        await markJobError({ jobId: job.id, ownerId, errorMessage: result.error });
        return;
      }

      await markJobDone({
        jobId: job.id,
        ownerId,
        result: { quizId: result.quizId, quality: result.quality },
        modelId: result.modelId,
        usage: result.usage,
        costUsd: result.costUsd,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await markJobError({ jobId: job.id, ownerId, errorMessage: msg });
    }
  });

  return NextResponse.json({ ok: true, jobId: job.id, reused: false, status: "pending" });
}
