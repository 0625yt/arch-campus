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

  return {
    id: data.id,
    materialId: data.material_id,
    courseId: data.course_id,
    title: data.title,
    difficulty: data.difficulty,
    watermark: data.watermark,
    questions: parsed.data.map((q) => ({
      id: q.id,
      difficulty: q.difficulty,
      topic: q.topic,
      stem: q.stem,
      choices: q.choices,
      hint: q.hint,
    })),
    total: parsed.data.length,
  };
}
