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
import type { QuizQuestion } from "@/lib/schemas";

export type Choice = "A" | "B" | "C" | "D";

type Question = z.infer<typeof QuizQuestion>;

export type SubmittedAnswer =
  | {
      questionId: number;
      choice: Choice;
      response?: never;
    }
  | {
      questionId: number;
      response: string;
      choice?: never;
    };

export interface GradedResult {
  questionId: number;
  kind: "multiple-choice" | "short-answer" | "essay";
  correct: boolean;
  /** 정답 또는 채점 기준 */
  answer: string;
  /** 사용자가 낸 답 — 미응답이면 null */
  submitted: string | null;
  explanation: string;
  evidence: string;
  evidencePage: number | null;
  gradingNote?: string;
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
export function gradeQuiz(questions: Question[], answers: SubmittedAnswer[]): GradedQuiz {
  const submittedMap = new Map<
    number,
    {
      choice?: Choice;
      response?: string;
    }
  >(
    answers.map((a) => [
      a.questionId,
      "choice" in a ? { choice: a.choice } : { response: a.response },
    ]),
  );

  let score = 0;
  const results: GradedResult[] = questions.map((q) => {
    const submitted = submittedMap.get(q.id);
    const kind = q.kind ?? "multiple-choice";
    const graded = gradeQuestion(q, submitted);
    if (graded.correct) score++;
    return {
      questionId: q.id,
      kind,
      correct: graded.correct,
      answer: graded.answer,
      submitted: graded.submitted,
      explanation: q.explanation,
      evidence: q.evidence ?? "",
      evidencePage: q.evidencePage ?? null,
      gradingNote: graded.gradingNote,
    };
  });

  return { score, total: questions.length, results };
}

function gradeQuestion(
  question: Question,
  submitted: { choice?: Choice; response?: string } | undefined,
): Pick<GradedResult, "correct" | "answer" | "submitted" | "gradingNote"> {
  const kind = question.kind ?? "multiple-choice";

  if (kind === "multiple-choice") {
    const submittedChoice = submitted?.choice ?? null;
    return {
      correct: submittedChoice !== null && submittedChoice === question.answer,
      answer: question.answer,
      submitted: submittedChoice,
    };
  }

  const submittedText = normalizeText(submitted?.response ?? "");
  if (!submittedText) {
    return {
      correct: false,
      answer: question.answer,
      submitted: null,
      gradingNote:
        kind === "essay"
          ? "핵심 포인트를 직접 적어보면 더 정확하게 점검할 수 있어요."
          : "짧게라도 직접 적어보면 헷갈리는 부분을 더 빨리 잡을 수 있어요.",
    };
  }

  if (kind === "short-answer") {
    const accepted = extractAcceptedAnswers(question.answer);
    const correct = accepted.some((candidate) => isFreeTextMatch(candidate, submittedText));
    return {
      correct,
      answer: question.answer,
      submitted: submitted?.response?.trim() ?? null,
      gradingNote: correct
        ? "자료 기준 정답 표현과 잘 맞아요."
        : accepted.length > 1
          ? `허용 표현 예시: ${accepted.slice(0, 3).join(", ")}`
          : "자료에 적힌 핵심 용어와 표기를 다시 확인해 보세요.",
    };
  }

  const keywords = extractEssayKeywords(question.answer);
  if (keywords.length === 0) {
    const fallbackCorrect = isFreeTextMatch(question.answer, submittedText);
    return {
      correct: fallbackCorrect,
      answer: question.answer,
      submitted: submitted?.response?.trim() ?? null,
      gradingNote: fallbackCorrect
        ? "핵심 방향을 잘 짚었어요."
        : "모범답안의 핵심 방향과 빠진 포인트를 비교해 보세요.",
    };
  }

  const matched = keywords.filter((keyword) => submittedText.includes(keyword));
  const required = Math.max(1, Math.ceil(keywords.length * 0.6));
  const correct = matched.length >= required;
  const missing = keywords.filter((keyword) => !matched.includes(keyword)).slice(0, 3);

  return {
    correct,
    answer: question.answer,
    submitted: submitted?.response?.trim() ?? null,
    gradingNote: correct
      ? `핵심 포인트 ${matched.length}개를 챙겼어요.`
      : missing.length > 0
        ? `보완 포인트: ${missing.join(", ")}`
        : "핵심 포인트를 조금 더 구체적으로 적어보세요.",
  };
}

function extractAcceptedAnswers(answer: string): string[] {
  return Array.from(
    new Set(
      answer
        .split(/\n|\/|,|;|\||또는/gi)
        .map((part) => part.replace(/^정답[:：]\s*/i, "").trim())
        .filter(Boolean)
        .map(normalizeText)
        .filter(Boolean),
    ),
  );
}

function extractEssayKeywords(answer: string): string[] {
  const normalized = answer
    .replace(/^핵심 키워드[:：]\s*/i, "")
    .replace(/^필수 포인트[:：]\s*/i, "")
    .split(/\n|,|;|\||•|-/)
    .map((part) => normalizeText(part))
    .filter((part) => part.length >= 2);

  return Array.from(new Set(normalized)).slice(0, 8);
}

function isFreeTextMatch(candidate: string, submitted: string): boolean {
  const normalizedCandidate = normalizeText(candidate);
  if (!normalizedCandidate || !submitted) return false;
  return (
    submitted === normalizedCandidate ||
    submitted.includes(normalizedCandidate) ||
    normalizedCandidate.includes(submitted)
  );
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[“”"'"`]/g, "")
    .replace(/[(){}[\]]/g, " ")
    .replace(/[.,!?~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
