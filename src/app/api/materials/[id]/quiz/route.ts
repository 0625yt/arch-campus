import { NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { runQuizGeneration } from "@/lib/services/quiz";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 90;

const RequestBody = z.object({
  difficulty: z.enum(["쉬움", "보통", "어려움"]).default("보통"),
  count: z.number().int().min(1).max(10).default(5),
});

interface OkResponse {
  ok: true;
  quizId: string;
}

interface ErrResponse {
  ok: false;
  error: string;
}

/**
 * 이미 업로드된 자료에 대해 새 퀴즈 생성.
 * 자료 페이지의 "문제 만들기" 버튼이 사용. multipart 안 받음 (파일은 이미 있음).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<OkResponse | ErrResponse>> {
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

  // owner_id 강제 — admin 우회하지만 본인 행만
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
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, quizId: result.quizId });
}
