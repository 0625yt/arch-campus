import "server-only";
import { z } from "zod";
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
 *   - wrong_items_v 뷰
 *   - attempt_summary_v 뷰
 *
 * 0009 이전 attempt(results=[])는 다시보기에서 빈 결과로 보이고,
 * 오답 큐에는 안 잡힌다. 그게 의도 — 과거 데이터는 "되살릴 수 없는 채점 결과".
 */

const GradedResultZ = z.object({
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
});

const ResultsArrayZ = z.array(GradedResultZ);

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

  // 1) 기존 results 로드 (이어쓰기) — attemptId가 본인 것인지 owner_id로 가드.
  let existing: GradedResult[] = [];
  if (opts.attemptId) {
    const { data } = await admin
      .from("quiz_attempts")
      .select("results")
      .eq("id", opts.attemptId)
      .eq("owner_id", opts.ownerId)
      .maybeSingle();
    if (data) {
      const parsed = ResultsArrayZ.safeParse(data.results);
      if (parsed.success) existing = parsed.data as GradedResult[];
    }
  }

  // 2) questionId 기준 병합 — 같은 문제를 다시 풀면 최신 결과로 교체.
  const byId = new Map<number, GradedResult>();
  for (const r of existing) byId.set(r.questionId, r);
  for (const r of opts.newResults) byId.set(r.questionId, r);
  const merged = [...byId.values()];
  const score = merged.filter((r) => r.correct).length;
  // total은 "실제 채점된 문제 수" — 부분 풀이(2문제만)도 "2문제 중 1개"로 정확하게.
  // sessionTotal(세션 전체)로 total을 잡으면 안 푼 문제가 오답처럼 보여 오해를 준다.
  const total = Math.max(merged.length, 1);

  const resultsJson = JSON.parse(JSON.stringify(merged));

  // 3) UPSERT — attemptId 있으면 UPDATE, 없으면 INSERT.
  if (opts.attemptId) {
    const { data, error } = await admin
      .from("quiz_attempts")
      .update({
        results: resultsJson,
        score,
        total,
        duration_ms: opts.durationMs ?? null,
        status: "completed",
      })
      .eq("id", opts.attemptId)
      .eq("owner_id", opts.ownerId)
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

  const resultsParsed = ResultsArrayZ.safeParse(data.results);
  // 0009 이전 데이터는 results=[] — questions만 살리고 결과는 빈 채로 매핑
  const resultsByQid = new Map(
    (resultsParsed.success ? resultsParsed.data : []).map((r) => [r.questionId, r]),
  );

  return {
    attemptId: data.attempt_id,
    quizId: data.quiz_id,
    materialId: data.material_id ?? null,
    courseId: data.course_id ?? null,
    quizTitle: data.quiz_title,
    difficulty: data.quiz_difficulty,
    attemptedAt: data.attempted_at,
    durationMs: data.duration_ms,
    score: data.score,
    total: data.total,
    watermark: data.watermark,
    questions: questionsParsed.data.map((q) => {
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
      };
    }),
  };
}

/**
 * 한 row = 한 오답 문제. 같은 문제를 여러 번 틀렸으면 row 여러 개.
 * Today·복습 큐가 사용. RLS는 view가 quiz_attempts에서 상속.
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
  /** 최근 N일 — 디폴트 14일 (학기 중 잊을만한 주기) */
  sinceDays?: number;
  limit?: number;
}): Promise<WrongItem[]> {
  const admin = getAdminSupabase();
  const sinceDays = opts.sinceDays ?? 14;
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from("wrong_items_v")
    .select("*")
    .eq("owner_id", opts.ownerId)
    .gte("attempted_at", since)
    .order("attempted_at", { ascending: false })
    .limit(opts.limit ?? 30);

  if (error || !data) return [];

  return data.map((row) => ({
    attemptId: row.attempt_id,
    quizId: row.quiz_id,
    materialId: row.material_id ?? null,
    courseId: row.course_id ?? null,
    quizTitle: row.quiz_title,
    attemptedAt: row.attempted_at,
    questionId: row.question_id,
    submitted: typeof row.submitted === "string" ? row.submitted : null,
    correctAnswer: typeof row.correct_answer === "string" ? row.correct_answer : "",
    explanation: row.explanation,
    evidence: row.evidence,
    evidencePage: row.evidence_page,
    // 0022 마이그레이션 적용 전이면 row에 topic 컬럼이 없음 → undefined → null로 정규화.
    // Supabase 타입이 strict라 row.topic 직접 접근은 cast 필요.
    topic:
      typeof (row as { topic?: unknown }).topic === "string"
        ? ((row as { topic?: string }).topic as string)
        : null,
  }));
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
    limit: 200,
  });

  // 전체 unique 오답 — (quizId, questionId) 조합으로 dedupe.
  // 0024 이후 wrong_items_v가 이미 "문제당 최신 시도 1행"이라 사실상 중복이 안 들어오지만,
  // 0024 적용 전 데이터·안전망으로 dedupe는 유지 (다시 맞힌 문제는 뷰에서 자동으로 빠짐).
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
  // Relationships 메타가 비어 있어서 nested select가 타입 추론을 깨뜨림.
  // attempt_summary_v 한 select로 대체 — view가 quiz join까지 같이 들고 옴.
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from("attempt_summary_v")
    .select("attempt_id, quiz_id, material_id, quiz_title, score, total, attempted_at")
    .eq("owner_id", opts.ownerId)
    .order("attempted_at", { ascending: false })
    .limit(opts.limit ?? 10);

  if (error || !data) return [];

  return data.map((row) => ({
    attemptId: row.attempt_id,
    quizId: row.quiz_id,
    materialId: row.material_id ?? null,
    quizTitle: row.quiz_title,
    score: row.score,
    total: row.total,
    attemptedAt: row.attempted_at,
  }));
}
