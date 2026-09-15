import "server-only";
import { z } from "zod";
import {
  attemptActivityTime,
  latestQuestionResults,
  mergeAttemptResults,
  parseAttemptResults,
  reconcileAttemptTotals,
} from "@/lib/attempt-results";
import { QuizQuestion } from "@/lib/schemas";
import type { GradedResult } from "@/lib/services/grade-quiz";
import { getAdminSupabase } from "@/lib/supabase/admin";

/**
 * Attempts DAL — 풀이 시도·오답 조회 단일 진입점.
 *
 * RLS 우회 X: 모든 select에 owner_id 강제. service-role을 쓰는 이유는
 * RLS-on-view 정책 일관성 + jsonb 캐스팅 안정성 때문.
 *
 * 의존: 0009_attempt_review.sql
 *   - quiz_attempts.results (jsonb) 컬럼
 *   - attempt_summary_v 뷰
 *
 * 0009 이전 attempt(results=[])는 다시보기에서 빈 결과로 보이고,
 * 오답 큐에는 안 잡힌다. 그게 의도 — 과거 데이터는 "되살릴 수 없는 채점 결과".
 */

/**
 * 풀이 결과를 attempt에 점진적으로 누적 — "푼 문제는 즉시 DB 반영".
 *
 * 왜:
 *   step-by-step에서 1문제 풀고 나가면 예전엔 /submit을 안 거쳐 attempt가 안 만들어졌고,
 *   그래서 오답 큐가 갱신되지 않았다(맞혀도 안 줄어듦). 이제 grade-one이 채점할 때마다
 *   이 함수로 그 문제 결과를 attempt에 병합 → 어느 시점에 나가도 푼 만큼 반영된다.
 *
 * 동작:
 *   - attemptId 없음 → 새 attempt INSERT (이 quiz의 새 풀이 세션 시작).
 *   - attemptId 있음 → 그 attempt의 results에 newResults를 questionId 기준 병합(교체) 후 UPDATE.
 *   - score = results 중 correct 개수. total = 실제 채점된 문제 수(부분 풀이도 정확).
 *   - 안 푼 문제는 results에 없으므로 wrong_items_v(오답 큐)에 안 들어간다 → 부분 풀이 안전.
 *
 * owner 가드: admin(service-role)이라 RLS 우회 — 모든 쿼리에 owner_id 강제 + UPDATE 시
 * attemptId가 본인 것인지 owner_id로 재확인(ARCHITECTURE §4-1).
 */
export async function upsertAttemptResults(opts: {
  ownerId: string;
  quizId: string;
  /** 새로 채점된 결과들 (보통 1개, submit 마감 시 여러 개). */
  newResults: GradedResult[];
  /** 이어쓸 attempt. 없으면 새로 만든다. */
  attemptId?: string | null;
  durationMs?: number | null;
}): Promise<{
  attemptId: string;
  score: number;
  total: number;
  results: GradedResult[];
} | null> {
  const admin = getAdminSupabase();

  // 답도 없고 이어 쓸 attempt도 없으면 0/1짜리 가짜 시도를 만들지 않는다.
  if (!opts.attemptId && opts.newResults.length === 0) return null;

  // 1) 기존 results 로드 (이어쓰기) — attemptId가 본인 것인지 owner_id로 가드.
  let existing: GradedResult[] = [];
  if (opts.attemptId) {
    const { data } = await admin
      .from("quiz_attempts")
      .select("results")
      .eq("id", opts.attemptId)
      .eq("owner_id", opts.ownerId)
      .eq("quiz_id", opts.quizId)
      .maybeSingle();
    if (data) {
      existing = parseAttemptResults(data.results);
    }
  }

  // 2) questionId 기준 병합 — 같은 문제를 다시 풀면 최신 결과로 교체.
  const merged = mergeAttemptResults(existing, opts.newResults, new Date().toISOString());
  const score = merged.filter((r) => r.correct).length;
  // total은 "실제 채점된 문제 수" — 부분 풀이(2문제만)도 "2문제 중 1개"로 정확하게.
  // sessionTotal(세션 전체)로 total을 잡으면 안 푼 문제가 오답처럼 보여 오해를 준다.
  const total = merged.length;

  const resultsJson = JSON.parse(JSON.stringify(merged));

  // 3) UPSERT — attemptId 있으면 UPDATE, 없으면 INSERT.
  if (opts.attemptId) {
    const { data, error } = await admin
      .from("quiz_attempts")
      .update({
        results: resultsJson,
        score,
        total,
        ...(opts.durationMs !== undefined ? { duration_ms: opts.durationMs } : {}),
        status: "completed",
      })
      .eq("id", opts.attemptId)
      .eq("owner_id", opts.ownerId)
      .eq("quiz_id", opts.quizId)
      .select("id")
      .maybeSingle();
    if (error || !data) return null;
    return { attemptId: opts.attemptId, score, total, results: merged };
  }

  const { data, error } = await admin
    .from("quiz_attempts")
    .insert({
      owner_id: opts.ownerId,
      quiz_id: opts.quizId,
      answers: [], // step별 누적이라 answers는 results로 대체 — 빈 배열로 둠.
      results: resultsJson,
      score,
      total,
      duration_ms: opts.durationMs ?? null,
      status: "completed",
    })
    .select("id")
    .single();
  if (error || !data) return null;
  return { attemptId: data.id, score, total, results: merged };
}

/**
 * 마지막 제출에서 이미 단건 채점한 같은 답을 다시 AI에 보내지 않기 위한 조회.
 * attemptId뿐 아니라 ownerId·quizId를 모두 묶어 다른 퀴즈의 시도를 재사용하지 못하게 한다.
 */
export async function getAttemptResults(opts: {
  ownerId: string;
  quizId: string;
  attemptId: string;
}): Promise<GradedResult[] | null> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from("quiz_attempts")
    .select("results")
    .eq("id", opts.attemptId)
    .eq("owner_id", opts.ownerId)
    .eq("quiz_id", opts.quizId)
    .maybeSingle();

  if (error || !data) return null;
  return parseAttemptResults(data.results);
}

/**
 * 다시보기 페이지가 쓰는 단일 진실.
 * attempt_summary_v 한 row → 풀이 화면을 그대로 복원할 수 있는 모든 정보.
 */
export interface AttemptSummary {
  attemptId: string;
  quizId: string;
  materialId: string | null;
  courseId: string | null;
  quizTitle: string;
  difficulty: "쉬움" | "보통" | "어려움";
  attemptedAt: string;
  durationMs: number | null;
  score: number;
  total: number;
  watermark: string;
  questions: Array<{
    id: number;
    kind: "multiple-choice" | "short-answer" | "essay";
    topic: string;
    difficulty: string;
    stem: string;
    choices: { key: "A" | "B" | "C" | "D"; text: string }[] | null;
    answer: string;
    explanation: string;
    evidence: string;
    evidencePage: number | null;
    /** 사용자 선택 (미응답이면 null) */
    submitted: string | null;
    correct: boolean;
    gradingNote?: string;
    partial?: {
      matchedParts: string[];
      missingParts: string[];
      requiredCount: number;
    };
    whyWrong?: string;
    llmPromoted?: boolean;
    llmGraded?: boolean;
  }>;
}

export async function getAttemptSummary(opts: {
  ownerId: string;
  attemptId: string;
}): Promise<AttemptSummary | null> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from("attempt_summary_v")
    .select("*")
    .eq("attempt_id", opts.attemptId)
    .eq("owner_id", opts.ownerId)
    .maybeSingle();

  if (error || !data) return null;

  const questionsParsed = z.array(QuizQuestion).safeParse(data.questions);
  if (!questionsParsed.success) {
    console.error("attempt_summary_v.questions 파싱 실패:", questionsParsed.error.message);
    return null;
  }

  // 0009 이전 데이터는 results=[] — questions만 살리고 결과는 빈 채로 매핑
  const parsedResults = parseAttemptResults(data.results);
  const resultsByQid = new Map(parsedResults.map((r) => [r.questionId, r]));
  const reconciled = reconcileAttemptTotals(data.score, data.total, parsedResults);

  return {
    attemptId: data.attempt_id,
    quizId: data.quiz_id,
    materialId: data.material_id ?? null,
    courseId: data.course_id ?? null,
    quizTitle: data.quiz_title,
    difficulty: data.quiz_difficulty,
    attemptedAt: attemptActivityTime(data.attempted_at, parsedResults),
    durationMs: data.duration_ms,
    score: reconciled.score,
    total: reconciled.total,
    watermark: data.watermark,
    // 부분 풀이 attempt에는 실제로 채점한 문제만 보여준다. 결과가 없는 문제를
    // correct=false로 꾸며 오답처럼 보이게 하면 점수·복습 신뢰가 깨진다.
    questions: questionsParsed.data
      .filter((q) => resultsByQid.has(q.id))
      .map((q) => {
        const r = resultsByQid.get(q.id);
        return {
          id: q.id,
          kind: q.kind ?? "multiple-choice",
          topic: q.topic,
          difficulty: q.difficulty,
          stem: q.stem,
          choices: q.choices ?? null,
          answer: r?.answer ?? q.answer,
          explanation: q.explanation,
          evidence: q.evidence ?? "",
          evidencePage: q.evidencePage ?? null,
          submitted: r?.submitted ?? null,
          correct: r?.correct ?? false,
          gradingNote: r?.gradingNote,
          partial: r?.partial,
          whyWrong: r?.whyWrong,
          llmPromoted: r?.llmPromoted,
          llmGraded: r?.llmGraded,
        };
      }),
  };
}

/**
 * 한 row = 한 (quiz, question)의 최신 오답. 다시 맞힌 문제는 결과에서 빠진다.
 * Today·복습 큐가 사용하며, DB 뷰 버전과 무관하게 results[].gradedAt을 직접 비교한다.
 */
export interface WrongItem {
  attemptId: string;
  quizId: string;
  materialId: string | null;
  courseId: string | null;
  quizTitle: string;
  attemptedAt: string;
  questionId: number;
  submitted: string | null;
  correctAnswer: string;
  explanation: string;
  evidence: string | null;
  evidencePage: number | null;
  /**
   * 문제의 주제(단원·키워드). quiz.questions[].topic에서 join.
   * 마이그레이션 0022 이전 데이터·매칭 실패 시 null — UI는 "기타" fallback.
   */
  topic: string | null;
}

export async function listWrongItems(opts: {
  ownerId: string;
  /** 최근 N일. null이면 아직 해결하지 않은 오답 전체. 디폴트 14일. */
  sinceDays?: number | null;
  /** 한 퀴즈의 오답만 필요할 때 DB에서 먼저 좁힌다. */
  quizId?: string;
  limit?: number;
}): Promise<WrongItem[]> {
  const requestedLimit = Math.min(Math.max(opts.limit ?? 30, 1), 5000);
  const attempts = await loadAttemptRows({ ownerId: opts.ownerId, quizId: opts.quizId });
  if (!attempts) return [];

  const sinceDays = opts.sinceDays === undefined ? 14 : opts.sinceDays;
  const sinceMs =
    sinceDays === null ? Number.NEGATIVE_INFINITY : Date.now() - sinceDays * 86_400_000;
  const latestWrong = latestQuestionResults(
    attempts.map((attempt) => ({
      attemptId: attempt.id,
      quizId: attempt.quizId,
      createdAt: attempt.createdAt,
      results: attempt.results,
    })),
  )
    .filter((activity) => !activity.result.correct && Date.parse(activity.attemptedAt) >= sinceMs)
    .slice(0, requestedLimit);

  const quizMap = await loadQuizMetadata(
    opts.ownerId,
    Array.from(new Set(latestWrong.map((activity) => activity.quizId))),
  );

  return latestWrong.flatMap((activity): WrongItem[] => {
    const quiz = quizMap.get(activity.quizId);
    if (!quiz) return [];
    const question = quiz.questions.find((item) => item.id === activity.result.questionId);
    return [
      {
        attemptId: activity.attemptId,
        quizId: activity.quizId,
        materialId: quiz.materialId,
        courseId: quiz.courseId,
        quizTitle: quiz.title,
        attemptedAt: activity.attemptedAt,
        questionId: activity.result.questionId,
        submitted: activity.result.submitted,
        correctAnswer: activity.result.answer,
        explanation: activity.result.explanation,
        evidence: activity.result.evidence || null,
        evidencePage: activity.result.evidencePage ?? null,
        topic: question?.topic ?? null,
      },
    ];
  });
}

/**
 * 사용자별 오답 통계 — Today 카드의 한 줄용.
 *
 * 정책 (2026-05-28 수정):
 *   - "오답 N문제" = 같은 (quizId, questionId)는 한 번만 카운트.
 *     사용자가 같은 문제를 두 번 틀리면 row가 두 개 들어오지만 통계는 1로 친다.
 *   - 종전엔 row 수를 그대로 노출해 "같은 문제 5번 틀림 = 5문제"로 보였음 → 신뢰성 깎임.
 *   - 자료별 카드도 같은 원칙 — 자료마다 "서로 다른 오답 문제 수"로 표시.
 */
export interface WrongStats {
  totalWrong: number;
  /** 자료별 unique 오답 문제 수 (상위 3) */
  byMaterial: Array<{
    materialId: string | null;
    quizTitle: string;
    count: number;
  }>;
}

export async function getWrongStats(opts: {
  ownerId: string;
  sinceDays?: number;
}): Promise<WrongStats> {
  const items = await listWrongItems({
    ownerId: opts.ownerId,
    sinceDays: opts.sinceDays,
    limit: 5000,
  });

  // 전체 unique 오답 — (quizId, questionId) 조합으로 dedupe.
  // listWrongItems가 이미 "문제당 최신 판정 1행"만 주지만 집계 안전망으로 dedupe는 유지한다.
  const uniqueKeys = new Set<string>();
  for (const it of items) uniqueKeys.add(`${it.quizId}:${it.questionId}`);

  // 자료별 — 같은 문제는 한 번만 카운트하기 위해 자료key 안에 question set을 둠.
  const byKey = new Map<
    string,
    {
      materialId: string | null;
      quizTitle: string;
      questionIds: Set<string>;
    }
  >();
  for (const it of items) {
    const key = it.materialId ?? `quiz:${it.quizId}`;
    const cur = byKey.get(key);
    const qKey = `${it.quizId}:${it.questionId}`;
    if (cur) {
      cur.questionIds.add(qKey);
    } else {
      byKey.set(key, {
        materialId: it.materialId,
        quizTitle: it.quizTitle,
        questionIds: new Set([qKey]),
      });
    }
  }
  const byMaterial = Array.from(byKey.values())
    .map((v) => ({
      materialId: v.materialId,
      quizTitle: v.quizTitle,
      count: v.questionIds.size,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return { totalWrong: uniqueKeys.size, byMaterial };
}

/**
 * 최근 시도 목록 — history 페이지·이어보기 카드.
 */
export interface RecentAttempt {
  attemptId: string;
  quizId: string;
  materialId: string | null;
  quizTitle: string;
  score: number;
  total: number;
  attemptedAt: string;
}

export async function listRecentAttempts(opts: {
  ownerId: string;
  limit?: number;
}): Promise<RecentAttempt[]> {
  const attempts = await loadAttemptRows({ ownerId: opts.ownerId });
  if (!attempts) return [];

  const ordered = attempts
    .map((attempt) => ({
      ...attempt,
      attemptedAt: attemptActivityTime(attempt.createdAt, attempt.results),
      ...reconcileAttemptTotals(attempt.score, attempt.total, attempt.results),
    }))
    .sort((left, right) => Date.parse(right.attemptedAt) - Date.parse(left.attemptedAt));
  const quizMap = await loadQuizMetadata(
    opts.ownerId,
    Array.from(new Set(ordered.map((attempt) => attempt.quizId))),
  );

  return ordered
    .flatMap((attempt): RecentAttempt[] => {
      const quiz = quizMap.get(attempt.quizId);
      if (!quiz) return [];
      return [
        {
          attemptId: attempt.id,
          quizId: attempt.quizId,
          materialId: quiz.materialId,
          quizTitle: quiz.title,
          score: attempt.score,
          total: attempt.total,
          attemptedAt: attempt.attemptedAt,
        },
      ];
    })
    .slice(0, opts.limit ?? 10);
}

interface AttemptRow {
  id: string;
  quizId: string;
  score: number;
  total: number;
  createdAt: string;
  results: GradedResult[];
}

async function loadAttemptRows(opts: {
  ownerId: string;
  quizId?: string;
}): Promise<AttemptRow[] | null> {
  const admin = getAdminSupabase();
  const pageSize = 1000;
  const rows: AttemptRow[] = [];

  for (let offset = 0; offset < 10_000; offset += pageSize) {
    let query = admin
      .from("quiz_attempts")
      .select("id, quiz_id, score, total, created_at, results")
      .eq("owner_id", opts.ownerId)
      .order("created_at", { ascending: false });
    if (opts.quizId) query = query.eq("quiz_id", opts.quizId);
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error || !data) return null;

    for (const row of data) {
      rows.push({
        id: row.id,
        quizId: row.quiz_id,
        score: row.score,
        total: row.total,
        createdAt: row.created_at,
        results: parseAttemptResults(row.results),
      });
    }
    if (data.length < pageSize) break;
  }
  return rows;
}

interface QuizAttemptMetadata {
  materialId: string | null;
  courseId: string | null;
  title: string;
  questions: Array<z.infer<typeof QuizQuestion>>;
}

async function loadQuizMetadata(
  ownerId: string,
  quizIds: string[],
): Promise<Map<string, QuizAttemptMetadata>> {
  const result = new Map<string, QuizAttemptMetadata>();
  if (quizIds.length === 0) return result;
  const admin = getAdminSupabase();

  for (let offset = 0; offset < quizIds.length; offset += 200) {
    const ids = quizIds.slice(offset, offset + 200);
    const { data, error } = await admin
      .from("quizzes")
      .select("id, material_id, course_id, title, questions")
      .eq("owner_id", ownerId)
      .in("id", ids);
    if (error || !data) continue;
    for (const row of data) {
      const parsed = z.array(QuizQuestion).safeParse(row.questions);
      result.set(row.id, {
        materialId: row.material_id,
        courseId: row.course_id,
        title: row.title,
        questions: parsed.success ? parsed.data : [],
      });
    }
  }
  return result;
}
