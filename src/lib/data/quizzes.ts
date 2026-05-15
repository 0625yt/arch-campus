import "server-only";
import { z } from "zod";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { QuizQuestion } from "@/lib/schemas";

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
  // 풀이 단계에선 정답·해설·증거 빠짐 — 서버에서 안 내려감
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
  const filtered = filterSet
    ? parsed.data.filter((q) => filterSet.has(q.id))
    : parsed.data;

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
      choices: q.choices,
      hint: q.hint,
    })),
    total: filtered.length,
  };
}
