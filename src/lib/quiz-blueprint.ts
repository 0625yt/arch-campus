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
