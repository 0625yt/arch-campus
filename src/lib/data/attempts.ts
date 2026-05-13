import "server-only";
import { z } from "zod";
import { QuizQuestion } from "@/lib/schemas";
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
  correct: z.boolean(),
  answer: z.enum(["A", "B", "C", "D"]),
  submitted: z.enum(["A", "B", "C", "D"]).nullable(),
  explanation: z.string(),
  evidence: z.string().optional().default(""),
  evidencePage: z.number().int().nullable().optional(),
});

const ResultsArrayZ = z.array(GradedResultZ);

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
    topic: string;
    difficulty: string;
    stem: string;
    choices: { key: "A" | "B" | "C" | "D"; text: string }[];
    answer: "A" | "B" | "C" | "D";
    explanation: string;
    evidence: string;
    evidencePage: number | null;
    /** 사용자 선택 (미응답이면 null) */
    submitted: "A" | "B" | "C" | "D" | null;
    correct: boolean;
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
        topic: q.topic,
        difficulty: q.difficulty,
        stem: q.stem,
        choices: q.choices,
        answer: q.answer,
        explanation: q.explanation,
        evidence: q.evidence ?? "",
        evidencePage: q.evidencePage ?? null,
        submitted: r?.submitted ?? null,
        correct: r?.correct ?? false,
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
  submitted: "A" | "B" | "C" | "D" | null;
  correctAnswer: "A" | "B" | "C" | "D";
  explanation: string;
  evidence: string | null;
  evidencePage: number | null;
}

const WRONG_CHOICE = z.enum(["A", "B", "C", "D"]);

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
    submitted: WRONG_CHOICE.safeParse(row.submitted).data ?? null,
    correctAnswer: WRONG_CHOICE.parse(row.correct_answer),
    explanation: row.explanation,
    evidence: row.evidence,
    evidencePage: row.evidence_page,
  }));
}

/**
 * 사용자별 오답 통계 — Today 카드의 한 줄용.
 */
export interface WrongStats {
  totalWrong: number;
  /** 자료별 오답 수 (상위 3) */
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
  const items = await listWrongItems({ ownerId: opts.ownerId, sinceDays: opts.sinceDays, limit: 200 });
  const byKey = new Map<string, { materialId: string | null; quizTitle: string; count: number }>();
  for (const it of items) {
    const key = it.materialId ?? `quiz:${it.quizId}`;
    const cur = byKey.get(key);
    if (cur) {
      cur.count++;
    } else {
      byKey.set(key, { materialId: it.materialId, quizTitle: it.quizTitle, count: 1 });
    }
  }
  const byMaterial = Array.from(byKey.values()).sort((a, b) => b.count - a.count).slice(0, 3);
  return { totalWrong: items.length, byMaterial };
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
