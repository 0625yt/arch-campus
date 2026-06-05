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
  /**
   * 복수 필수답(예: "둘 다 쓰세요") 부분 채점 결과.
   * 단일답·동의어형 단답에선 undefined.
   *   - matchedParts: 사용자가 맞힌 정답 조각들
   *   - missingParts: 빠뜨린 정답 조각들
   *   - requiredCount: 맞혀야 하는 총 개수
   */
  partial?: {
    matchedParts: string[];
    missingParts: string[];
    requiredCount: number;
  };
  /** 단답형 오답일 때 "내 답이 왜 틀렸는지" 한 줄 설명. */
  whyWrong?: string;
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
      partial: graded.partial,
      whyWrong: graded.whyWrong,
    };
  });

  return { score, total: questions.length, results };
}

function gradeQuestion(
  question: Question,
  submitted: { choice?: Choice; response?: string } | undefined,
): Pick<GradedResult, "correct" | "answer" | "submitted" | "gradingNote" | "partial" | "whyWrong"> {
  const kind = question.kind ?? "multiple-choice";

  if (kind === "multiple-choice") {
    const submittedChoice = submitted?.choice ?? null;
    return {
      correct: submittedChoice !== null && submittedChoice === question.answer,
      answer: question.answer,
      submitted: submittedChoice,
    };
  }

  const rawSubmitted = submitted?.response?.trim() ?? "";
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
    return gradeShortAnswer(question.answer, rawSubmitted, submittedText);
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

/**
 * 단답형 채점 — 단일답·동의어형(OR)과 복수 필수답(AND)을 구분해 부분 채점까지.
 *
 * 정답 표기 규약 (quiz.md):
 *   - 동의어 허용: `|` `/` `,` `또는` 로 구분 → 하나만 맞으면 정답.
 *     예) "임계 구역 | critical section"
 *   - 복수 필수답("둘 다 쓰세요"): `&` 로 구분 → 전부 맞아야 정답, 부분 채점 노출.
 *     각 슬롯 안에서 다시 `|`로 동의어 허용 가능. 예) "あの|あ & この|こ"
 */
function gradeShortAnswer(
  answerSpec: string,
  rawSubmitted: string,
  submittedText: string,
): Pick<GradedResult, "correct" | "answer" | "submitted" | "gradingNote" | "partial" | "whyWrong"> {
  const requiredSlots = parseRequiredSlots(answerSpec);

  // 복수 필수답 — "둘 다 쓰세요" 류.
  if (requiredSlots.length > 1) {
    const submittedParts = splitUserMultiAnswer(rawSubmitted);
    const matchedParts: string[] = [];
    const missingParts: string[] = [];
    for (const slot of requiredSlots) {
      // 슬롯 안 동의어 중 하나라도 사용자 입력 어딘가와 매칭되면 그 슬롯은 맞음.
      const hit = slot.accepted.some((cand) =>
        submittedParts.some((part) => isFreeTextMatch(cand, part)),
      );
      if (hit) matchedParts.push(slot.label);
      else missingParts.push(slot.label);
    }
    const correct = missingParts.length === 0;
    return {
      correct,
      answer: answerSpec,
      submitted: rawSubmitted || null,
      partial: {
        matchedParts,
        missingParts,
        requiredCount: requiredSlots.length,
      },
      gradingNote: correct
        ? `${requiredSlots.length}개 모두 맞았어요.`
        : matchedParts.length > 0
          ? `맞은 답: ${matchedParts.join(", ")} · 빠진 답: ${missingParts.join(", ")}`
          : `정답 ${requiredSlots.length}개를 모두 놓쳤어요: ${missingParts.join(", ")}`,
      whyWrong: correct
        ? undefined
        : matchedParts.length > 0
          ? `${matchedParts.join(", ")}는 맞았지만 ${missingParts.join(", ")}를 빠뜨렸어요.`
          : `요구한 ${requiredSlots.length}개 중 맞은 게 없어요. 정답은 ${requiredSlots
              .map((s) => s.label)
              .join(", ")}예요.`,
    };
  }

  // 단일답(동의어 허용) — 기존 동작.
  const accepted = requiredSlots[0]?.accepted ?? extractAcceptedAnswers(answerSpec);
  const correct = accepted.some((candidate) => isFreeTextMatch(candidate, submittedText));
  const primary = requiredSlots[0]?.label ?? accepted[0] ?? answerSpec;
  return {
    correct,
    answer: answerSpec,
    submitted: rawSubmitted || null,
    gradingNote: correct
      ? "자료 기준 정답 표현과 잘 맞아요."
      : accepted.length > 1
        ? `허용 표현 예시: ${accepted.slice(0, 3).join(", ")}`
        : "자료에 적힌 핵심 용어와 표기를 다시 확인해 보세요.",
    whyWrong: correct
      ? undefined
      : `적은 답 "${rawSubmitted}"은 정답 "${primary}"와 달라요. 표기·철자를 자료와 맞춰 보세요.`,
  };
}

/**
 * 정답 스펙을 "필수 슬롯" 배열로 파싱.
 *   - `&` 또는 한국어 "그리고" 로 슬롯 구분 (복수 필수답).
 *   - 슬롯 1개면 그게 곧 단일답(내부 accepted는 동의어 OR 목록).
 */
function parseRequiredSlots(answerSpec: string): Array<{ label: string; accepted: string[] }> {
  const stripped = answerSpec.replace(/^정답[:：]\s*/i, "").trim();
  // `&` 또는 " 그리고 " 로 명시적 복수답 구분. 그 외 구분자(|,/)는 동의어로 본다.
  const slotTexts = stripped
    .split(/\s*&\s*|\s+그리고\s+/g)
    .map((s) => s.trim())
    .filter(Boolean);
  return slotTexts.map((slotText) => {
    const accepted = extractAcceptedAnswers(slotText);
    return {
      // 라벨은 동의어 목록의 첫 표현(원문 가독성용) — 정규화 전 형태를 우선.
      label: firstReadableLabel(slotText),
      accepted: accepted.length > 0 ? accepted : [normalizeText(slotText)].filter(Boolean),
    };
  });
}

/** 동의어 묶음에서 사람이 읽기 좋은 첫 표현 (정규화 전 원문 기준). */
function firstReadableLabel(slotText: string): string {
  const first = slotText.split(/\n|\/|,|;|\||또는/gi)[0] ?? slotText;
  return first.replace(/^정답[:：]\s*/i, "").trim() || slotText.trim();
}

/** 사용자가 복수답을 입력할 때 쓰는 다양한 구분자로 split. */
function splitUserMultiAnswer(raw: string): string[] {
  const parts = raw
    // 한·일·영 구분자: 중점(・·) 쉼표(、，,) 슬래시 세미콜론 공백 "그리고/and".
    .split(/[、，,・·/;]|\s+그리고\s+|\s+and\s+|\s+/gi)
    .map((p) => normalizeText(p))
    .filter(Boolean);
  // 구분자 없이 붙여 쓴 경우(예: "あのこの")도 통째로 한 덩어리로 매칭 시도.
  if (parts.length === 0) {
    const whole = normalizeText(raw);
    return whole ? [whole] : [];
  }
  return [...new Set([...parts, normalizeText(raw)])].filter(Boolean);
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
  return (
    katakanaToHiragana(
      value
        // 전각→반각·가나 호환 통일 (NFKC). "Ａ" → "A", 반각 가나 → 전각 등.
        // 일본어 IME가 만든 전각 영숫자·구두점 차이로 인한 오판정을 근본 차단.
        .normalize("NFKC"),
    )
      .toLowerCase()
      .replace(/[“”"'"`「」『』]/g, "")
      .replace(/[(){}[\]（）【】]/g, " ")
      // 영문 + 일본어·한국어 구두점(중점·일본쉼표·마침표 등)을 공백으로.
      .replace(/[.,!?~。、・·…：:;；]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * 가타카나 → 히라가나. 같은 음(あ=ア)을 표기 종류만 다르게 쓴 답을 같게 본다.
 * 일본어 단답형에서 학생이 아무 표기로 써도 음이 맞으면 인정하기 위함.
 * 장음 부호(ー)는 NFKC가 유지하므로 그대로 둔다(음 구분에 의미 있음).
 */
function katakanaToHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}
