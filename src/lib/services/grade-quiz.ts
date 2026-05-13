/**
 * Quiz 채점 — 순수 함수.
 *
 * 라우트(/api/quiz/[id]/submit)와 단위 테스트가 공유.
 * DB·인증·HTTP 의존 없음 — 그래서 `server-only` 안 박았다.
 *
 * 입력: questions(zod-검증된 정답), answers(사용자 선택)
 * 출력: results 배열 (저장·UI 표시용 단일 진실)
 */

import type { z } from "zod";
import { QuizQuestion } from "@/lib/schemas";

export type Choice = "A" | "B" | "C" | "D";

type Question = z.infer<typeof QuizQuestion>;

export interface SubmittedAnswer {
  questionId: number;
  choice: Choice;
}

export interface GradedResult {
  questionId: number;
  correct: boolean;
  /** 정답 키 */
  answer: Choice;
  /** 사용자가 낸 답 — 미응답이면 null */
  submitted: Choice | null;
  explanation: string;
  evidence: string;
  evidencePage: number | null;
}

export interface GradedQuiz {
  score: number;
  total: number;
  results: GradedResult[];
}

/**
 * 한 attempt 채점.
 *
 * 미응답(submittedMap에 없음)은 submitted=null·correct=false로 처리.
 * 기존 동작은 미응답을 'A'로 강제했지만, 그러면 통계가 왜곡되고
 * UI에서 "내 답: A"라고 잘못 표시됨. 미응답은 미응답으로 명시.
 */
export function gradeQuiz(
  questions: Question[],
  answers: SubmittedAnswer[],
): GradedQuiz {
  const submittedMap = new Map<number, Choice>(answers.map((a) => [a.questionId, a.choice]));

  let score = 0;
  const results: GradedResult[] = questions.map((q) => {
    const submitted = submittedMap.get(q.id) ?? null;
    const correct = submitted !== null && submitted === q.answer;
    if (correct) score++;
    return {
      questionId: q.id,
      correct,
      answer: q.answer,
      submitted,
      explanation: q.explanation,
      evidence: q.evidence ?? "",
      evidencePage: q.evidencePage ?? null,
    };
  });

  return { score, total: questions.length, results };
}
