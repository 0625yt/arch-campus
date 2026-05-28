import { after, NextResponse } from "next/server";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { enqueueJob, markJobDone, markJobError, markJobRunning } from "@/lib/data/jobs";
import { guardRateLimit } from "@/lib/ratelimit";
import { runSummarize } from "@/lib/services/summarize";
import { getAdminSupabase } from "@/lib/supabase/admin";
import {
  type SummaryStyle,
  STYLE_ORDER,
  MAX_STYLES_PER_REQUEST,
} from "@/lib/material-policy";

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

  // Rate limit — AI 호출은 적자 위험 큼 (CLAUDE.md §1). 분당 6회 캡.
  const blocked = await guardRateLimit("ai", ownerId);
  if (blocked) return blocked;

  const { id: materialId } = await params;

  // body는 옵션 — { styles?: string[], intentNote?: string } 또는 빈 body 모두 허용
  let styles: SummaryStyle[] = [];
  let intentNote = "";
  try {
    const raw = await req.text();
    if (raw.trim()) {
      const parsed = JSON.parse(raw) as { styles?: unknown; intentNote?: unknown };
      if (Array.isArray(parsed.styles)) {
        styles = parsed.styles
          .filter((s): s is SummaryStyle =>
            typeof s === "string" && (STYLE_ORDER as readonly string[]).includes(s),
          )
          .slice(0, MAX_STYLES_PER_REQUEST);
      }
      // 의도 조정 한 줄 요청 — 120자 cap. 자료 밖 생성은 서비스/프롬프트 가드가 거부.
      if (typeof parsed.intentNote === "string") {
        intentNote = parsed.intentNote.trim().slice(0, 120);
      }
    }
  } catch {
    // body 파싱 실패해도 기본값으로 진행 — 종전 동작과 동일
  }

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

  // 작업 큐 등록 — styles도 inputParams에 넣어 jobs 디버깅에 도움
  const { job, isNew } = await enqueueJob({
    ownerId,
    materialId: material.id,
    tool: "summarize",
    inputParams: {
      materialId: material.id,
      title: material.title,
      type: material.type,
      styles,
      intentNote,
    },
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
        styles,
        intentNote,
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
