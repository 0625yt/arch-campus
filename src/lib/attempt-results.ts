import { z } from "zod";
import type { GradedResult } from "@/lib/services/grade-quiz";

const GradedResultSchema = z.object({
  questionId: z.number().int(),
  kind: z.enum(["multiple-choice", "short-answer", "essay"]).default("multiple-choice"),
  correct: z.boolean(),
  answer: z.string(),
  submitted: z.string().nullable(),
  explanation: z.string(),
  evidence: z.string().optional().default(""),
  evidencePage: z.number().int().nullable().optional(),
  gradingNote: z.string().optional(),
  partial: z
    .object({
      matchedParts: z.array(z.string()),
      missingParts: z.array(z.string()),
      requiredCount: z.number().int(),
    })
    .optional(),
  whyWrong: z.string().optional(),
  llmPromoted: z.boolean().optional(),
  llmGraded: z.boolean().optional(),
  gradedAt: z.string().datetime({ offset: true }).optional(),
});

const GradedResultsSchema = z.array(GradedResultSchema);

/** DB jsonb를 화면 계산에 써도 되는 채점 결과만 남긴다. */
export function parseAttemptResults(value: unknown): GradedResult[] {
  const parsed = GradedResultsSchema.safeParse(value);
  return parsed.success ? (parsed.data as GradedResult[]) : [];
}

/**
 * 한 풀이 세션의 누적 채점 결과를 문제 번호 기준으로 병합한다.
 *
 * `gradedAt`은 attempt 전체가 아니라 문제별 마지막 판정 시각이다. 오래된 풀이를
 * 이어서 일부 문제만 다시 풀어도, 다른 문제의 과거 판정 시각까지 최신으로 둔갑하지
 * 않게 해 오답 큐가 각 문제의 진짜 마지막 결과를 고를 수 있다.
 */
export function mergeAttemptResults(
  existing: GradedResult[],
  incoming: GradedResult[],
  gradedAt: string,
): GradedResult[] {
  const byId = new Map<number, GradedResult>();
  for (const result of existing) byId.set(result.questionId, result);
  for (const result of incoming) byId.set(result.questionId, { ...result, gradedAt });
  return [...byId.values()];
}

/** 레거시 부분 풀이의 저장 total이 전체 문제 수로 남은 경우 결과 배열을 단일 진실로 보정한다. */
export function reconcileAttemptTotals(
  storedScore: number,
  storedTotal: number,
  results: GradedResult[],
): { score: number; total: number } {
  if (results.length === 0) return { score: storedScore, total: storedTotal };
  return {
    score: results.filter((result) => result.correct).length,
    total: results.length,
  };
}

export interface AttemptResultBatch {
  attemptId: string;
  quizId: string;
  createdAt: string;
  results: GradedResult[];
}

export interface LatestQuestionResult {
  attemptId: string;
  quizId: string;
  attemptedAt: string;
  result: GradedResult;
}

/** DB 뷰 버전과 무관하게 문제별 가장 최근 판정을 gradedAt 기준으로 고른다. */
export function latestQuestionResults(batches: AttemptResultBatch[]): LatestQuestionResult[] {
  const latest = new Map<string, LatestQuestionResult>();
  for (const batch of batches) {
    for (const result of batch.results) {
      const attemptedAt = resultActivityTime(batch.createdAt, result);
      const candidate = {
        attemptId: batch.attemptId,
        quizId: batch.quizId,
        attemptedAt,
        result,
      };
      const key = `${batch.quizId}:${result.questionId}`;
      const previous = latest.get(key);
      if (
        !previous ||
        Date.parse(candidate.attemptedAt) > Date.parse(previous.attemptedAt) ||
        (candidate.attemptedAt === previous.attemptedAt && candidate.attemptId > previous.attemptId)
      ) {
        latest.set(key, candidate);
      }
    }
  }
  return [...latest.values()].sort(
    (left, right) => Date.parse(right.attemptedAt) - Date.parse(left.attemptedAt),
  );
}

/** 한 attempt의 마지막 활동 시각. 새 결과가 없으면 최초 생성 시각을 유지한다. */
export function attemptActivityTime(createdAt: string, results: GradedResult[]): string {
  let latestMs = Date.parse(createdAt);
  let latestIso = createdAt;
  for (const result of results) {
    const candidate = resultActivityTime(createdAt, result);
    const candidateMs = Date.parse(candidate);
    if (Number.isFinite(candidateMs) && (!Number.isFinite(latestMs) || candidateMs > latestMs)) {
      latestMs = candidateMs;
      latestIso = candidate;
    }
  }
  return latestIso;
}

function resultActivityTime(createdAt: string, result: GradedResult): string {
  if (result.gradedAt && Number.isFinite(Date.parse(result.gradedAt))) return result.gradedAt;
  return createdAt;
}
