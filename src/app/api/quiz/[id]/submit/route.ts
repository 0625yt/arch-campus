import { NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { QuizQuestion } from "@/lib/schemas";
import { gradeQuiz, type Choice } from "@/lib/services/grade-quiz";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const SubmitBody = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.number().int(),
        choice: z.enum(["A", "B", "C", "D"]),
      }),
    )
    .min(1)
    .max(20),
  durationMs: z.number().int().nonnegative().optional(),
});

interface SubmitOk {
  ok: true;
  attemptId: string;
  score: number;
  total: number;
  results: Array<{
    questionId: number;
    correct: boolean;
    answer: Choice;
    submitted: Choice | null;
    explanation: string;
    evidence?: string;
    evidencePage?: number | null;
  }>;
  watermark: string;
}

/**
 * Quiz 제출 — 라우트는 인증 + 입력검증 + DB만 책임.
 * 채점 로직은 lib/services/grade-quiz.ts (순수 함수, 단위 테스트 가능).
 *
 * 0009 마이그레이션부터 results 컬럼에도 채점 결과를 영구 보관 →
 * Today·복습 큐·다시보기 페이지가 attempt 단건 select 한 번으로 결과를 복원.
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse<SubmitOk | { ok: false; error: string }>> {
  let ownerId: string;
  try {
    ownerId = await getOwnerId();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    throw e;
  }

  const { id: quizId } = await context.params;

  let body: z.infer<typeof SubmitBody>;
  try {
    const json = await req.json();
    body = SubmitBody.parse(json);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `요청 본문 형식이 잘못됐어요: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 400 },
    );
  }

  const admin = getAdminSupabase();
  const { data: quiz, error: quizErr } = await admin
    .from("quizzes")
    .select("id, owner_id, questions, watermark")
    .eq("id", quizId)
    .single();

  if (quizErr || !quiz) {
    return NextResponse.json({ ok: false, error: "문제를 찾을 수 없어요" }, { status: 404 });
  }
  if (quiz.owner_id !== ownerId) {
    return NextResponse.json({ ok: false, error: "다른 사용자의 문제예요" }, { status: 403 });
  }

  const questions = z.array(QuizQuestion).parse(quiz.questions);
  const graded = gradeQuiz(questions, body.answers);

  // GradedResult는 plain object 배열이라 직렬화 안전 — JSON 캐스트로 supabase 타입에 맞춤.
  const resultsJson = JSON.parse(JSON.stringify(graded.results));
  const answersJson = JSON.parse(JSON.stringify(body.answers));

  const { data: attempt, error: attemptErr } = await admin
    .from("quiz_attempts")
    .insert({
      owner_id: ownerId,
      quiz_id: quizId,
      answers: answersJson,
      results: resultsJson,
      score: graded.score,
      total: graded.total,
      duration_ms: body.durationMs ?? null,
      status: "completed",
    })
    .select("id")
    .single();

  if (attemptErr || !attempt) {
    return NextResponse.json(
      { ok: false, error: `시도 기록 실패: ${attemptErr?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    attemptId: attempt.id,
    score: graded.score,
    total: graded.total,
    results: graded.results.map((r) => ({
      questionId: r.questionId,
      correct: r.correct,
      answer: r.answer,
      submitted: r.submitted,
      explanation: r.explanation,
      evidence: r.evidence,
      evidencePage: r.evidencePage,
    })),
    watermark: quiz.watermark,
  });
}
