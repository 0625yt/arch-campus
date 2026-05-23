import "server-only";
import { z } from "zod";
import { getAdminSupabase } from "@/lib/supabase/admin";
import {
  ExamExtractedQuestion,
  type ExamExtractedQuestionT,
  QuizQuestion,
} from "@/lib/schemas";

/**
 * Quizzes DAL — server pages·route handlers 공통 입구.
 * RLS 우회하지 않게 항상 owner_id 강제.
 */

const QuestionsArray = z.array(QuizQuestion);

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
  // 솔버는 객관식만 처리. 단답/서술은 getQuizForSolving 안에서 미리 걸러진 채로 들어온다.
  questions: Array<{
    id: number;
    difficulty: string;
    topic: string;
    stem: string;
    choices: { key: "A" | "B" | "C" | "D"; text: string }[];
    hint?: string;
  }>;
  total: number;
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
    .select("id, material_id, course_id, title, difficulty, watermark, questions, question_count")
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
  // 풀이 UI는 이번 sprint에서 객관식만 동작. short-answer/essay는 자동 채점·풀이 화면이
  // 아직 없어서 솔버에 넣으면 깨짐. 추출된 quiz row 안에 섞여 있어도 솔버는 객관식만 본다.
  const filtered = (filterSet
    ? parsed.data.filter((q) => filterSet.has(q.id))
    : parsed.data
  ).filter((q) => (q.kind ?? "multiple-choice") === "multiple-choice");

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

  return {
    id: data.id,
    materialId: data.material_id,
    courseId: data.course_id,
    courseName,
    title: data.title,
    difficulty: data.difficulty,
    watermark: data.watermark,
    questions: filtered.map((q) => ({
      id: q.id,
      difficulty: q.difficulty,
      topic: q.topic,
      stem: q.stem,
      // filter에서 객관식만 통과시켰으니 q.choices는 length-4 array 보장
      choices: q.choices ?? [],
      hint: q.hint,
    })),
    total: filtered.length,
  };
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
