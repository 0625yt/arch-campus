import { NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { QuizQuestion } from "@/lib/schemas";
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
    answer: "A" | "B" | "C" | "D";
    submitted: "A" | "B" | "C" | "D";
    explanation: string;
    evidence?: string;
    evidencePage?: number | null;
  }>;
  watermark: string;
}

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

  // quiz 조회 (RLS: owner_id 본인만)
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
  const submittedMap = new Map(body.answers.map((a) => [a.questionId, a.choice]));

  let score = 0;
  const results = questions.map((q) => {
    const submitted = submittedMap.get(q.id) ?? "A";
    const correct = submitted === q.answer;
    if (correct) score++;
    return {
      questionId: q.id,
      correct,
      answer: q.answer,
      submitted,
      explanation: q.explanation,
      evidence: q.evidence,
      evidencePage: q.evidencePage ?? null,
    };
  });

  const { data: attempt, error: attemptErr } = await admin
    .from("quiz_attempts")
    .insert({
      owner_id: ownerId,
      quiz_id: quizId,
      answers: body.answers,
      score,
      total: questions.length,
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
    score,
    total: questions.length,
    results,
    watermark: quiz.watermark,
  });
}
