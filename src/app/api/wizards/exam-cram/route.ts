import { NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { runExamCram } from "@/lib/services/exam-cram";
import type { ExamCramOutputT } from "@/lib/schemas";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 90;

const RequestSchema = z.object({
  subject: z.string().min(1).max(120),
  remainingMin: z.coerce.number().int().min(1).max(10000),
  weakSpots: z.string().max(800).optional(),
  // 자료 ID 배열. UI에서 사용자가 고른 자료들. owner_id 강제 검증은 서버에서.
  materialIds: z.array(z.string().min(1)).min(1).max(8),
});

interface ResponseOk {
  ok: true;
  output: ExamCramOutputT;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    costUsd: number;
  };
}

interface ResponseError {
  ok: false;
  error: string;
}

/**
 * POST /api/wizards/exam-cram
 *
 * 라우트 책임: 인증 → 입력 검증 → materials 권한 확인 + 본문 로드 → 서비스 호출
 * 서비스 책임: AI 호출 + Zod 검증 + 사후 검증 + generations 기록
 */
export async function POST(req: Request): Promise<NextResponse<ResponseOk | ResponseError>> {
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

  // materials 권한 확인 + 본문 로드
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
    const status = result.stage === "input" ? 400 : result.stage === "ai" ? 502 : 502;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    output: result.output,
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cacheReadTokens: result.usage.cacheReadTokens,
      cacheCreationTokens: result.usage.cacheCreationTokens,
      costUsd: result.costUsd,
    },
  });
}
