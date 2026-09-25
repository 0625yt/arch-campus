import "server-only";
import { z } from "zod";
import type { SemesterTerm } from "@/lib/academic";
import {
  attemptActivityTime,
  parseAttemptResults,
  reconcileAttemptTotals,
} from "@/lib/attempt-results";
import { listWrongItems } from "@/lib/data/attempts";
import { ExamExtractedQuestion, type ExamExtractedQuestionT, QuizQuestion } from "@/lib/schemas";
import { getAdminSupabase } from "@/lib/supabase/admin";

/**
 * Quizzes DAL — server pages·route handlers 공통 입구.
 * RLS 우회하지 않게 항상 owner_id 강제.
 */

const QuestionsArray = z.array(QuizQuestion);
const GenerationQuality = z.object({
  requested: z.number().int().positive(),
  generated: z.number().int().positive(),
  dropped: z.number().int().nonnegative(),
  limitedBySource: z.boolean(),
  reason: z.enum(["complete", "source-limited", "generation-limited"]),
});

export interface QuizSolveView {
  id: string;
  materialId: string | null;
  courseId: string | null;
  /** "자료로 돌아가기" 라우트용 — material detail이 강의 슬러그를 path에 받음. */
  courseName: string | null;
  title: string;
  difficulty: "쉬움" | "보통" | "어려움";
  watermark: string;
  // 풀이 단계에선 정답·해설·증거 빠짐 — 서버에서 안 내려감.
  questions: Array<
    | {
        id: number;
        kind: "multiple-choice";
        difficulty: string;
        topic: string;
        stem: string;
        choices: { key: "A" | "B" | "C" | "D"; text: string }[];
        hint?: string | null;
      }
    | {
        id: number;
        kind: "short-answer" | "essay";
        difficulty: string;
        topic: string;
        stem: string;
        placeholder: string;
        answerGuide: string;
        hint?: string | null;
      }
  >;
  total: number;
  generationQuality: z.infer<typeof GenerationQuality> | null;
}

export async function getQuizForSolving(opts: {
  ownerId: string;
  quizId: string;
  /** 주어지면 그 question_id만 추려서 반환. 오답 다시 풀기에서 사용. */
  onlyQuestionIds?: number[];
}): Promise<QuizSolveView | null> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from("quizzes")
    .select(
      "id, material_id, course_id, title, difficulty, watermark, questions, question_count, generation_id",
    )
    .eq("id", opts.quizId)
    .eq("owner_id", opts.ownerId)
    .maybeSingle();

  if (error || !data) return null;

  // questions 컬럼은 jsonb — 신뢰 X, Zod 재검증
  const parsed = QuestionsArray.safeParse(data.questions);
  if (!parsed.success) {
    console.error("quizzes.questions 파싱 실패:", parsed.error.message);
    return null;
  }

  const filterSet = opts.onlyQuestionIds ? new Set(opts.onlyQuestionIds) : null;
  const filtered = filterSet ? parsed.data.filter((q) => filterSet.has(q.id)) : parsed.data;

  // 강의명도 같이 — material detail 라우트가 슬러그를 path에 받는다.
  let courseName: string | null = null;
  if (data.course_id) {
    const { data: c } = await admin
      .from("courses")
      .select("name")
      .eq("id", data.course_id)
      .eq("owner_id", opts.ownerId)
      .maybeSingle();
    courseName = c?.name ?? null;
  }

  let generationQuality: z.infer<typeof GenerationQuality> | null = null;
  if (data.generation_id) {
    const { data: generation } = await admin
      .from("generations")
      .select("payload")
      .eq("id", data.generation_id)
      .eq("owner_id", opts.ownerId)
      .maybeSingle();
    const parsedQuality = GenerationQuality.safeParse(generation?.payload?.quality);
    if (parsedQuality.success) generationQuality = parsedQuality.data;
  }

  return {
    id: data.id,
    materialId: data.material_id,
    courseId: data.course_id,
    courseName,
    title: data.title,
    difficulty: data.difficulty,
    watermark: data.watermark,
    questions: filtered.map((q) =>
      (q.kind ?? "multiple-choice") === "multiple-choice"
        ? {
            id: q.id,
            kind: "multiple-choice" as const,
            difficulty: q.difficulty,
            topic: q.topic,
            stem: q.stem,
            choices: q.choices ?? [],
            hint: q.hint,
          }
        : {
            id: q.id,
            kind: q.kind === "essay" ? "essay" : "short-answer",
            difficulty: q.difficulty,
            topic: q.topic,
            stem: q.stem,
            placeholder:
              q.kind === "essay" ? "핵심 포인트를 직접 정리해 보세요" : "짧게 직접 적어보세요",
            answerGuide: q.answer,
            hint: q.hint,
          },
    ),
    total: filtered.length,
    generationQuality,
  };
}

/**
 * 사용자가 만든 모든 퀴즈 목록 — /dashboard/quiz 인덱스용.
 *
 * 만든 직후 페이지를 떠나면 다시 찾아갈 길이 없던 동선 결함을 메우는 진입점.
 * Today 카드(오답 기반)와 다른 시각 — "내가 만든 모든 문제"가 시간역순으로 박힘.
 *
 * mode='extracted'는 기출 추출이라 일반 퀴즈와 같이 보이면 혼란 — 별도 분리.
 * 여기는 mode='generated' + null(기존 row, 0013 이전) 모두 포함해서 "내가 만든 문제".
 */
export interface QuizListItem {
  id: string;
  title: string;
  materialId: string | null;
  courseName: string | null;
  courseColor: string | null;
  semesterYear: number | null;
  semesterTerm: SemesterTerm | null;
  difficulty: "쉬움" | "보통" | "어려움";
  questionCount: number;
  createdAt: string;
  /** 한 번이라도 시도한 적 있나 — 카드에 "아직 안 풀었어요" 표시용 */
  attemptCount: number;
  /** 가장 최근 시도 점수 (없으면 null) */
  lastScore: number | null;
  /** 가장 최근 시도에서 실제로 채점한 문제 수. 부분 풀이를 전체 문제 수로 보이지 않게 한다. */
  lastAttemptTotal: number | null;
  /** 지금 틀린 채로 남은 문제 수. 문제별 gradedAt의 최신 판정이 정답이면 빠진다. */
  wrongCount: number;
}

interface QuizAttemptRow {
  quiz_id: string;
  score: number;
  total: number;
  created_at: string;
  results: unknown;
}

interface QuizAttemptAggregate {
  count: number;
  lastScore: number | null;
  lastAttemptTotal: number | null;
  lastAttemptedAt: string | null;
}

/** 이어 푼 오래된 attempt도 실제 마지막 채점 시각을 기준으로 최신 점수로 잡는다. */
function aggregateAttempts(rows: QuizAttemptRow[]): Map<string, QuizAttemptAggregate> {
  const aggregated = new Map<string, QuizAttemptAggregate>();

  for (const row of rows) {
    const results = parseAttemptResults(row.results);
    const totals = reconcileAttemptTotals(row.score, row.total, results);
    const attemptedAt = attemptActivityTime(row.created_at, results);
    const current = aggregated.get(row.quiz_id) ?? {
      count: 0,
      lastScore: null,
      lastAttemptTotal: null,
      lastAttemptedAt: null,
    };
    current.count += 1;

    if (
      current.lastAttemptedAt === null ||
      Date.parse(attemptedAt) > Date.parse(current.lastAttemptedAt)
    ) {
      current.lastScore = totals.score;
      current.lastAttemptTotal = totals.total;
      current.lastAttemptedAt = attemptedAt;
    }
    aggregated.set(row.quiz_id, current);
  }

  return aggregated;
}

/**
 * quizId별 "지금 틀린 채로 남은" 문제 수.
 * questionCount - lastScore는 부분 풀이에서 안 푼 문제까지 오답으로 만들므로 쓰지 않는다.
 *
 * 시간 필터(sinceDays)는 의도적으로 안 건다 — 카드는 "이 퀴즈에 남은 오답"을
 * 보여줘야 하므로 오래된 오답도 다시 안 맞혔으면 그대로 카운트.
 */
async function countWrongByQuiz(ownerId: string, quizIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (quizIds.length === 0) return counts;

  const allowed = new Set(quizIds);
  const items = await listWrongItems({ ownerId, sinceDays: null, limit: 5000 });
  for (const item of items) {
    if (!allowed.has(item.quizId)) continue;
    counts.set(item.quizId, (counts.get(item.quizId) ?? 0) + 1);
  }
  return counts;
}

export async function listGeneratedQuizzes(opts: {
  ownerId: string;
  /** UI 페이지네이션 — 기본 30개. /dashboard/quiz는 1페이지로 충분, 추후 무한스크롤 가능 */
  limit?: number;
}): Promise<QuizListItem[]> {
  const admin = getAdminSupabase();
  const limit = opts.limit ?? 30;

  // mode='extracted'만 제외 — 'generated' + null(0013 이전 row) 모두 포함
  const { data: quizzes, error } = await admin
    .from("quizzes")
    .select("id, title, material_id, course_id, difficulty, question_count, created_at, mode")
    .eq("owner_id", opts.ownerId)
    .neq("mode", "extracted")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !quizzes || quizzes.length === 0) return [];

  // course 정보 한 번에 — IN 쿼리. course_id가 모두 다를 수 있어 set으로 묶음.
  const courseIds = Array.from(
    new Set(quizzes.map((q) => q.course_id).filter((id): id is string => id !== null)),
  );
  const courseMap = new Map<
    string,
    {
      name: string;
      color: string | null;
      semesterYear: number | null;
      semesterTerm: SemesterTerm | null;
    }
  >();
  if (courseIds.length > 0) {
    const { data: courses } = await admin
      .from("courses")
      .select("id, name, color, semester_year, semester_term")
      .eq("owner_id", opts.ownerId)
      .in("id", courseIds);
    for (const c of courses ?? []) {
      courseMap.set(c.id, {
        name: c.name,
        color: c.color,
        semesterYear: c.semester_year,
        semesterTerm: c.semester_term,
      });
    }
  }

  // attempts 집계 — quiz_id별 count + 가장 최근 score.
  // 작은 N(<=30)이라 별도 RPC 안 만들고 클라이언트 측에서 group by.
  const quizIds = quizzes.map((q) => q.id);
  const [{ data: attempts }, wrongByQuiz] = await Promise.all([
    admin
      .from("quiz_attempts")
      .select("quiz_id, score, total, created_at, results")
      .eq("owner_id", opts.ownerId)
      .in("quiz_id", quizIds)
      .order("created_at", { ascending: false }),
    countWrongByQuiz(opts.ownerId, quizIds),
  ]);

  const attemptAgg = aggregateAttempts(attempts ?? []);

  return quizzes.map((q) => {
    const course = q.course_id ? courseMap.get(q.course_id) : null;
    const agg = attemptAgg.get(q.id) ?? {
      count: 0,
      lastScore: null,
      lastAttemptTotal: null,
      lastAttemptedAt: null,
    };
    return {
      id: q.id,
      title: q.title,
      materialId: q.material_id,
      courseName: course?.name ?? null,
      courseColor: course?.color ?? null,
      semesterYear: course?.semesterYear ?? null,
      semesterTerm: course?.semesterTerm ?? null,
      difficulty: q.difficulty,
      questionCount: q.question_count,
      createdAt: q.created_at,
      attemptCount: agg.count,
      lastScore: agg.lastScore,
      lastAttemptTotal: agg.lastAttemptTotal,
      wrongCount: wrongByQuiz.get(q.id) ?? 0,
    };
  });
}

/**
 * 한 자료(material)에서 만든 모든 퀴즈 목록 — material detail 페이지 하단 섹션용.
 *
 * 사용자 동선: 자료 페이지 → 요약 읽기 → 문제 생성 → 풀이 → 다시 자료로 돌아옴
 *              → 이전에 만든 다른 문제도 그 자리에서 골라 풀 수 있어야 함.
 *
 * listGeneratedQuizzes를 owner+material로 좁힌 형태지만 course join이 필요 없어 별도 함수.
 */
export async function listQuizzesForMaterial(opts: {
  ownerId: string;
  materialId: string;
  limit?: number;
}): Promise<
  Array<{
    id: string;
    title: string;
    difficulty: "쉬움" | "보통" | "어려움";
    questionCount: number;
    createdAt: string;
    attemptCount: number;
    lastScore: number | null;
    lastAttemptTotal: number | null;
    /** 문제별 최신 판정 기준 실제 남은 오답 수. QuizListItem.wrongCount와 동일 의미. */
    wrongCount: number;
  }>
> {
  const admin = getAdminSupabase();
  const limit = opts.limit ?? 10;

  const { data: quizzes, error } = await admin
    .from("quizzes")
    .select("id, title, difficulty, question_count, created_at, mode")
    .eq("owner_id", opts.ownerId)
    .eq("material_id", opts.materialId)
    .neq("mode", "extracted")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !quizzes || quizzes.length === 0) return [];

  const quizIds = quizzes.map((q) => q.id);
  const [{ data: attempts }, wrongByQuiz] = await Promise.all([
    admin
      .from("quiz_attempts")
      .select("quiz_id, score, total, created_at, results")
      .eq("owner_id", opts.ownerId)
      .in("quiz_id", quizIds)
      .order("created_at", { ascending: false }),
    countWrongByQuiz(opts.ownerId, quizIds),
  ]);

  const attemptAgg = aggregateAttempts(attempts ?? []);

  return quizzes.map((q) => {
    const agg = attemptAgg.get(q.id) ?? {
      count: 0,
      lastScore: null,
      lastAttemptTotal: null,
      lastAttemptedAt: null,
    };
    return {
      id: q.id,
      title: q.title,
      difficulty: q.difficulty,
      questionCount: q.question_count,
      createdAt: q.created_at,
      attemptCount: agg.count,
      lastScore: agg.lastScore,
      lastAttemptTotal: agg.lastAttemptTotal,
      wrongCount: wrongByQuiz.get(q.id) ?? 0,
    };
  });
}

/**
 * 한 자료에서 이전에 출제된 모든 stem을 가져온다.
 *
 * 용도: 중복 출제 방지 — 같은 자료에서 N번 quiz를 생성할 때 모델에게
 * "이런 stem은 이미 만들었다, 다른 각도로 출제해라" 힌트로 박는다.
 *
 * 프롬프트에는 서비스 레이어가 일부만 노출하지만, 반환값 전체는 생성 후 결정론적
 * 중복 검사에도 사용한다. 오래 사용한 학생에게 예전 문제가 되살아나지 않도록 최근
 * 50개 quiz까지 조회하고, 비정상적으로 큰 호출은 100개로 제한한다.
 */
export async function listPreviousQuizStems(opts: {
  ownerId: string;
  materialIds: string[];
  limit?: number;
}): Promise<string[]> {
  if (opts.materialIds.length === 0) return [];
  const admin = getAdminSupabase();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);

  const { data, error } = await admin
    .from("quizzes")
    .select("questions")
    .eq("owner_id", opts.ownerId)
    .in("material_id", opts.materialIds)
    .neq("mode", "extracted")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  const stems: string[] = [];
  for (const row of data) {
    const parsed = QuestionsArray.safeParse(row.questions);
    if (!parsed.success) continue;
    for (const q of parsed.data) {
      if (q.stem) stems.push(q.stem);
    }
  }
  return stems;
}

const ExtractedArray = z.array(ExamExtractedQuestion);

export interface ExtractedExamView {
  quizId: string;
  title: string;
  watermark: string;
  questions: ExamExtractedQuestionT[];
  createdAt: string;
}

/**
 * 가장 최근 기출 추출 결과 (mode='extracted')를 가져옴.
 *
 * 같은 자료에 여러 번 추출하면 최신 한 건만 반환.
 * 풀이 모드에서 사용자가 답을 입력하기 전까지 정답·해설을 UI가 가려야 한다 (B-6 게이트).
 *
 * 마이그레이션 0013 안 돌렸으면 mode 컬럼 없어서 query 실패 → null 반환.
 */
export async function getExtractedExam(opts: {
  ownerId: string;
  materialId: string;
}): Promise<ExtractedExamView | null> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from("quizzes")
    .select("id, title, watermark, questions, created_at, mode")
    .eq("owner_id", opts.ownerId)
    .eq("material_id", opts.materialId)
    .eq("mode", "extracted")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const parsed = ExtractedArray.safeParse(data.questions);
  if (!parsed.success) {
    console.error("extracted exam questions 파싱 실패:", parsed.error.message);
    return null;
  }

  return {
    quizId: data.id,
    title: data.title,
    watermark: data.watermark,
    questions: parsed.data,
    createdAt: data.created_at,
  };
}
