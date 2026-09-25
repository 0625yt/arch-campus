import { NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { upsertAttemptResults } from "@/lib/data/attempts";
import { QuizQuestion } from "@/lib/schemas";
import { gradeQuiz, type SubmittedAnswer } from "@/lib/services/grade-quiz";
import { gradeWithLlmAssist } from "@/lib/services/grade-quiz-llm";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * 단건 채점 — Duolingo식 step-by-step 풀이 화면용.
 *
 * 동작:
 *   1) quizId 인증 + 본인 소유 확인
 *   2) 요청에 담긴 questionId 하나만 gradeQuiz로 채점
 *   3) 첫 문제에서 attempt 하나를 만들고 이후 결과는 같은 attempt에 문제별로 누적.
 *      중간에 나가도 푼 문제의 오답은 남고, 문제마다 attempt가 늘어나지는 않는다.
 *
 * 단답형 의미 등가 판정이 필요할 때만 보조 모델을 호출. /submit과 동일 정책.
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
  /** 이어쓸 attempt — 첫 채점이면 없음(서버가 새로 만들어 반환). */
  attemptId: z.string().uuid().optional(),
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
    partial?: {
      matchedParts: string[];
      missingParts: string[];
      requiredCount: number;
    };
    whyWrong?: string;
    /** 정확 매칭 실패였는데 LLM이 의미 등가로 정답 인정 (단답형). 최종 제출과 동일 판정. */
    llmPromoted?: boolean;
    /** 서술형을 모범답안 기준으로 의미 채점한 경우. */
    llmGraded?: boolean;
  };
  /** 이 풀이 세션의 attempt id — 클라이언트가 이후 채점에 이어쓰기 위해 들고 다님. */
  attemptId: string;
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

  const parsedQuestions = z.array(QuizQuestion).safeParse(quiz.questions);
  if (!parsedQuestions.success) {
    return NextResponse.json(
      { ok: false, error: "문제 데이터가 손상되어 채점할 수 없어요." },
      { status: 500 },
    );
  }
  const questions = parsedQuestions.data;
  // 해당 questionId만 추출 — gradeQuiz는 questions 배열 + answers 배열 받으니 single로 좁힘
  const target = questions.find((q) => q.id === body.answer.questionId);
  if (!target) {
    return NextResponse.json({ ok: false, error: "잘못된 문제 번호예요" }, { status: 400 });
  }

  const base = gradeQuiz([target], [body.answer as SubmittedAnswer]);
  // ★ 최종 제출(/submit)과 동일한 판정을 위해 여기서도 LLM 보조 채점을 적용.
  // 안 하면 step에서 "틀렸어요" 본 단답형이 최종 결과에선 "맞았어요"로 뒤바뀌어 신뢰가 깨진다.
  // gradeWithLlmAssist는 단답형 오답(복수답 아님)만 후보라, 객관식·정답·복수답은 즉시 통과(무비용).
  const graded = await gradeWithLlmAssist(base, [
    { id: target.id, kind: target.kind, stem: target.stem },
  ]);
  const r = graded.results[0];
  if (!r) {
    return NextResponse.json({ ok: false, error: "채점 실패" }, { status: 500 });
  }

  // ★ 푼 즉시 attempt에 반영 — 1문제 풀고 나가도 오답 큐가 갱신된다.
  // attemptId 없으면 새로 만들고, 있으면 그 attempt에 이 문제 결과를 병합한다.
  const saved = await upsertAttemptResults({
    ownerId,
    quizId,
    newResults: [r],
    attemptId: body.attemptId ?? null,
  });
  if (!saved) {
    return NextResponse.json(
      { ok: false, error: "채점 결과를 저장하지 못했어요. 잠시 후 다시 눌러주세요." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    attemptId: saved.attemptId,
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
      partial: r.partial,
      whyWrong: r.whyWrong,
      llmPromoted: r.llmPromoted,
      llmGraded: r.llmGraded,
    },
  });
}
