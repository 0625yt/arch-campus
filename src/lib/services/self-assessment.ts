import type { GradedResult } from "./grade-quiz";
/** Preserve the machine verdict so student corrections are identifiable and reversible. */
export function applySelfAssessment(result: GradedResult, accepted: boolean): GradedResult {
  const original = result.selfAssessment ?? {
    originalCorrect: result.correct,
    originalWhyWrong: result.whyWrong,
    originalGradingNote: result.gradingNote,
  };
  return {
    ...result,
    correct: accepted ? true : original.originalCorrect,
    whyWrong: accepted ? undefined : original.originalWhyWrong,
    gradingNote: accepted
      ? "원문과 해설을 확인한 뒤 직접 정답으로 인정했어요."
      : original.originalGradingNote,
    selfAssessment: accepted ? { ...original, accepted: true } : undefined,
  };
}
