import type { QuizQuestionT } from "@/lib/schemas";

/** Kind quotas cost no extra model call. Rotate remainders across parallel batches. */
export function quizKindQuotas(
  count: number,
  kinds: readonly QuizQuestionT["kind"][] = ["multiple-choice"],
  batchIndex = 0,
): Partial<Record<QuizQuestionT["kind"], number>> {
  const selected = [...new Set(kinds.length ? kinds : ["multiple-choice" as const])];
  const quotas: Partial<Record<QuizQuestionT["kind"], number>> = {};
  for (const kind of selected) quotas[kind] = Math.floor(count / selected.length);
  for (let i = 0; i < count % selected.length; i++) {
    const kind = selected[(batchIndex + i) % selected.length];
    quotas[kind] = (quotas[kind] ?? 0) + 1;
  }
  return quotas;
}

/** Preserve requested kinds when trimming verified over-generation. */
export function selectQuizQuestions(
  candidates: readonly QuizQuestionT[],
  count: number,
  kinds?: readonly QuizQuestionT["kind"][],
): QuizQuestionT[] {
  const quotas = quizKindQuotas(count, kinds);
  const selected = new Set<QuizQuestionT>();
  for (const question of candidates) {
    const kind = question.kind ?? "multiple-choice";
    if ((quotas[kind] ?? 0) > 0) {
      selected.add(question);
      quotas[kind] = (quotas[kind] ?? 0) - 1;
    }
  }
  for (const question of candidates) {
    if (selected.size >= count) break;
    selected.add(question);
  }
  return candidates.filter((question) => selected.has(question)).slice(0, count);
}

export function missingQuizKinds(
  candidates: readonly QuizQuestionT[],
  count: number,
  kinds: readonly QuizQuestionT["kind"][] | undefined,
): QuizQuestionT["kind"][] {
  const quotas = quizKindQuotas(count, kinds);
  return (Object.keys(quotas) as QuizQuestionT["kind"][]).filter(
    (kind) =>
      candidates.filter((question) => (question.kind ?? "multiple-choice") === kind).length <
      (quotas[kind] ?? 0),
  );
}
