import { NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { QuizQuestion } from "@/lib/schemas";
import { gradeQuiz, type SubmittedAnswer } from "@/lib/services/grade-quiz";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * 단건 채점 — Duolingo식 step-by-step 풀이 화면용.
 *
 * 동작:
 *   1) quizId 인증 + 본인 소유 확인
 *   2) 요청에 담긴 questionId 하나만 gradeQuiz로 채점
 *   3) attempt 기록은 만들지 X — 풀이가 끝나면 클라이언트가 모은 답으로 /submit 한 번 더 호출.
 *      여기서 INSERT하면 30문제마다 attempt가 30개 쌓여 점수·복습 큐가 망가짐.
 *
 * AI 호출 없음(순수 함수) — rate limit 미부착. /submit과 동일 정책.
 */
const Body = z.object({
  answer: z.union([
    z.object({
      questionId: z.number().int(),
      choice: z.enum(["A", "B", "C", "D"]),
    }),
    z.object({
      questionId: z.number().int(),
      response: z.string().max(4000),
    }),
  ]),
});

interface OkResponse {
  ok: true;
  result: {
    questionId: number;
    kind: "multiple-choice" | "short-answer" | "essay";
    correct: boolean;
    answer: string;
    submitted: string | null;
    explanation: string;
    evidence: string;
    evidencePage: number | null;
    gradingNote?: string;
  };
}

interface ErrResponse {
  ok: false;
  error: string;
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
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

  const { id: quizId } = await context.params;

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `요청 형식 오류: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 400 },
    );
  }

  const admin = getAdminSupabase();
  // owner 가드를 쿼리 단계에 넣어 다른 사용자 quiz 존재 정보 누출 방지.
  const { data: quiz, error: quizErr } = await admin
    .from("quizzes")
    .select("id, owner_id, questions")
    .eq("id", quizId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (quizErr || !quiz) {
    return NextResponse.json({ ok: false, error: "문제를 찾을 수 없어요" }, { status: 404 });
  }

  const questions = z.array(QuizQuestion).parse(quiz.questions);
  // 해당 questionId만 추출 — gradeQuiz는 questions 배열 + answers 배열 받으니 single로 좁힘
  const target = questions.find((q) => q.id === body.answer.questionId);
  if (!target) {
    return NextResponse.json({ ok: false, error: "잘못된 문제 번호예요" }, { status: 400 });
  }

  const graded = gradeQuiz([target], [body.answer as SubmittedAnswer]);
  const r = graded.results[0];
  if (!r) {
    return NextResponse.json({ ok: false, error: "채점 실패" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    result: {
      questionId: r.questionId,
      kind: r.kind,
      correct: r.correct,
      answer: r.answer,
      submitted: r.submitted,
      explanation: r.explanation,
      evidence: r.evidence,
      evidencePage: r.evidencePage,
      gradingNote: r.gradingNote,
    },
  });
}
