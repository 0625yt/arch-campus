import { after, NextResponse } from "next/server";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { enqueueJob, markJobDone, markJobError, markJobRunning } from "@/lib/data/jobs";
import { guardRateLimit } from "@/lib/ratelimit";
import { runExamExtract } from "@/lib/services/exam-extract";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * 기출문제 자료 (type=exam)에서 본문에 적힌 문제·정답·해설을 그대로 추출 — 비동기.
 *
 * 동작:
 *  1) 자료 owner 검증 + type=exam 확인
 *  2) jobs에 pending 행 만들기 (같은 자료+tool active 있으면 재사용)
 *  3) 즉시 { ok, jobId } 응답
 *  4) after()로 백그라운드에서 runExamExtract → quizzes(mode='extracted') 저장 → markJobDone
 *
 * 차이점 (summarize와 비교):
 *  - type=exam이 아니면 422로 거절 (UI에서 분기되지만 서버에서도 가드)
 *  - 50쪽 초과 PDF는 비용 보호 위해 사전 거부 (CLAUDE.md §1 cost guard)
 *  - 결과는 materials.summary_payload가 아니라 quizzes 테이블에 저장
 *  - 풀이 페이지 redirect: /dashboard/quiz/{quizId}/wrong 패턴 재사용 (B-5 UI에서 처리)
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

  const blocked = await guardRateLimit("ai", ownerId);
  if (blocked) return blocked;

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

  // 가드 1: type=exam인지 확인. 잘못된 자료에 추출 호출 막음 (UI 분기 이중 가드)
  if (material.type !== "exam") {
    return NextResponse.json(
      {
        ok: false,
        error: "기출 추출은 자료 종류가 '기출문제'일 때만 가능해요. 자료 종류를 먼저 변경해주세요.",
      },
      { status: 422 },
    );
  }

  // 가드 2: 본문 비어있으면 거절
  const fullText = material.full_text ?? "";
  if (!fullText.trim()) {
    return NextResponse.json(
      { ok: false, error: "자료 본문이 비어있어 기출 추출을 시작할 수 없어요" },
      { status: 422 },
    );
  }

  // 가드 3: 50쪽 초과 PDF는 사전 거부 (Vision 토큰 폭주 방지 — Plan §3 비용 영향)
  if (material.page_count != null && material.page_count > 50) {
    return NextResponse.json(
      {
        ok: false,
        error: "기출 자료가 50쪽을 넘어 한 번에 추출이 어려워요. 더 짧은 자료로 다시 올려주세요.",
      },
      { status: 422 },
    );
  }

  // 작업 큐 등록
  const { job, isNew } = await enqueueJob({
    ownerId,
    materialId: material.id,
    tool: "exam-extract",
    inputParams: { materialId: material.id, title: material.title },
  });

  if (!isNew) {
    return NextResponse.json({
      ok: true,
      jobId: job.id,
      reused: true,
      status: job.status,
    });
  }

  // 백그라운드 실행
  after(async () => {
    try {
      await markJobRunning(job.id);
      const result = await runExamExtract({
        ownerId,
        materialId: material.id,
        title: material.title,
        fullText,
        sanitizedText: fullText,
        pageCount: material.page_count ?? null,
      });

      if (!result.ok) {
        await markJobError({ jobId: job.id, errorMessage: result.error });
        return;
      }

      await markJobDone({
        jobId: job.id,
        result: { quizId: result.quizId, extracted: result.result },
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
