import { NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { upsertAttemptResults } from "@/lib/data/attempts";
import { QuizQuestion } from "@/lib/schemas";
import { gradeQuiz } from "@/lib/services/grade-quiz";
import { gradeWithLlmAssist } from "@/lib/services/grade-quiz-llm";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const SubmitBody = z.object({
  answers: z
    .array(
      z.union([
        z.object({
          questionId: z.number().int(),
          choice: z.enum(["A", "B", "C", "D"]),
        }),
        z.object({
          questionId: z.number().int(),
          response: z.string().max(4000),
        }),
      ]),
    )
    // 부분 제출 허용 — 답한 문제만 옴(안 푼 문제 빈 답 강제 X). grade-one이 이미 누적
    // 저장했으니 0개여도 마감만 하면 됨.
    .max(30),
  /** grade-one이 만든 진행 attempt — 같은 attempt를 마감해 중복 INSERT 방지. */
  attemptId: z.string().uuid().optional(),
  durationMs: z.number().int().nonnegative().optional(),
});

interface SubmitOk {
  ok: true;
  attemptId: string;
  score: number;
  total: number;
  results: Array<{
    questionId: number;
    kind: "multiple-choice" | "short-answer" | "essay";
    correct: boolean;
    answer: string;
    submitted: string | null;
    explanation: string;
    evidence?: string;
    evidencePage?: number | null;
    gradingNote?: string;
    llmPromoted?: boolean;
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
      {
        ok: false,
        error: `요청 본문 형식이 잘못됐어요: ${e instanceof Error ? e.message : "unknown"}`,
      },
      { status: 400 },
    );
  }

  const admin = getAdminSupabase();
  // owner 가드를 쿼리 단계에 — 다른 사용자 quiz 존재 정보 누출 방지.
  const { data: quiz, error: quizErr } = await admin
    .from("quizzes")
    .select("id, owner_id, questions, watermark")
    .eq("id", quizId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (quizErr || !quiz) {
    return NextResponse.json({ ok: false, error: "문제를 찾을 수 없어요" }, { status: 404 });
  }

  let questions: z.infer<typeof QuizQuestion>[];
  try {
    questions = z.array(QuizQuestion).parse(quiz.questions);
  } catch (e) {
    // 0009 이전 또는 손상된 스키마의 quiz.questions가 통과되면 500 throw → 사용자 풀이 결과 날아감.
    return NextResponse.json(
      {
        ok: false,
        error: `문제 데이터가 손상됐어요: ${e instanceof Error ? e.message : "unknown"}`,
      },
      { status: 500 },
    );
  }
  // 답한 문제만 채점 (부분 제출). 안 푼 문제는 results에 안 들어가 오답으로 안 박힌다.
  const answeredIds = new Set(body.answers.map((a) => a.questionId));
  const answeredQuestions = questions.filter((q) => answeredIds.has(q.id));
  const baseGraded = gradeQuiz(answeredQuestions, body.answers);

  // 단답형 LLM 보조 — 정확 매칭 실패한 short-answer만 Haiku에 의미 등가 확인.
  // 정답 없는 case는 빠르게 반환(no-op)이라 비용은 단답 오답이 있을 때만 발생.
  // 모델 실패 시 baseGraded 그대로 반환 (실패 안전).
  const graded = await gradeWithLlmAssist(baseGraded, answeredQuestions);

  // grade-one이 만든 attempt를 마감(UPSERT) — 새 INSERT 안 함(중복 attempt 방지).
  // 이번 제출분을 기존 누적 results에 병합하고, 마감된 전체 results를 받아 결과 화면에 쓴다.
  const saved = await upsertAttemptResults({
    ownerId,
    quizId,
    newResults: graded.results,
    attemptId: body.attemptId ?? null,
    durationMs: body.durationMs ?? null,
  });

  if (!saved) {
    return NextResponse.json(
      { ok: false, error: "시도 기록 실패 — 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    attemptId: saved.attemptId,
    score: saved.score,
    total: saved.total,
    results: saved.results.map((r) => ({
      questionId: r.questionId,
      kind: r.kind,
      correct: r.correct,
      answer: r.answer,
      submitted: r.submitted,
      explanation: r.explanation,
      evidence: r.evidence,
      evidencePage: r.evidencePage,
      gradingNote: r.gradingNote,
      partial: r.partial,
      whyWrong: r.whyWrong,
    })),
    watermark: quiz.watermark,
  });
}
