import "server-only";
import { type ReviewRating, type StoredReviewCard, scheduleReview } from "@/lib/fsrs";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getQuizForSolving } from "./quizzes";

interface ReviewCardRow {
  id: string;
  owner_id: string;
  quiz_id: string;
  question_id: number;
  due_at: string;
  stability: number;
  difficulty: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review_at: string | null;
}

export interface ReviewQueueItem {
  id: string;
  quizId: string;
  quizTitle: string;
  materialId: string | null;
  courseId: string | null;
  questionId: number;
  dueAt: string;
  reps: number;
  lapses: number;
}

export async function ensureReviewCards(opts: {
  ownerId: string;
  quizId: string;
  questionIds: number[];
}) {
  const ids = Array.from(new Set(opts.questionIds));
  if (ids.length === 0) return;
  const admin = getAdminSupabase();
  const { error } = await admin.from("review_cards").upsert(
    ids.map((questionId) => ({
      owner_id: opts.ownerId,
      quiz_id: opts.quizId,
      question_id: questionId,
    })),
    { onConflict: "owner_id,quiz_id,question_id", ignoreDuplicates: true },
  );
  if (error) console.error("review card seed failed", error.message);
}

export async function rateReviewCard(opts: {
  ownerId: string;
  quizId: string;
  questionId: number;
  rating: ReviewRating;
  reviewedAt?: Date;
}) {
  const admin = getAdminSupabase();
  const quiz = await getQuizForSolving({ ownerId: opts.ownerId, quizId: opts.quizId });
  if (!quiz?.questions.some((question) => question.id === opts.questionId)) return null;

  const { data: existing } = await admin
    .from("review_cards")
    .select("*")
    .eq("owner_id", opts.ownerId)
    .eq("quiz_id", opts.quizId)
    .eq("question_id", opts.questionId)
    .maybeSingle();

  const current = existing ? rowToStored(existing as ReviewCardRow) : null;
  const scheduled = scheduleReview(current, opts.rating, opts.reviewedAt);
  const payload = {
    owner_id: opts.ownerId,
    quiz_id: opts.quizId,
    question_id: opts.questionId,
    due_at: scheduled.card.dueAt,
    stability: scheduled.card.stability,
    difficulty: scheduled.card.difficulty,
    scheduled_days: scheduled.card.scheduledDays,
    learning_steps: scheduled.card.learningSteps,
    reps: scheduled.card.reps,
    lapses: scheduled.card.lapses,
    state: scheduled.card.state,
    last_review_at: scheduled.card.lastReviewAt,
    updated_at: scheduled.log.reviewedAt,
  };
  const { data: saved, error } = await admin
    .from("review_cards")
    .upsert(payload, { onConflict: "owner_id,quiz_id,question_id" })
    .select("id")
    .single();
  if (error || !saved) return null;

  const { error: logError } = await admin.from("review_logs").insert({
    owner_id: opts.ownerId,
    card_id: saved.id,
    rating: scheduled.log.rating,
    previous_state: scheduled.log.previousState,
    previous_due_at: scheduled.log.previousDueAt,
    reviewed_at: scheduled.log.reviewedAt,
    scheduled_days: scheduled.log.scheduledDays,
    stability: scheduled.log.stability,
    difficulty: scheduled.log.difficulty,
  });
  if (logError) return null;
  return scheduled.card;
}

export async function listReviewQueue(ownerId: string): Promise<ReviewQueueItem[]> {
  const admin = getAdminSupabase();
  const { data: cards } = await admin
    .from("review_cards")
    .select("id, quiz_id, question_id, due_at, reps, lapses")
    .eq("owner_id", ownerId)
    .order("due_at", { ascending: true })
    .limit(5000);
  if (!cards?.length) return [];
  const quizIds = Array.from(new Set(cards.map((card) => card.quiz_id)));
  const { data: quizzes } = await admin
    .from("quizzes")
    .select("id, title, material_id, course_id")
    .eq("owner_id", ownerId)
    .in("id", quizIds);
  const quizById = new Map((quizzes ?? []).map((quiz) => [quiz.id, quiz]));
  return cards.flatMap((card) => {
    const quiz = quizById.get(card.quiz_id);
    return quiz
      ? [
          {
            id: card.id,
            quizId: card.quiz_id,
            quizTitle: quiz.title,
            materialId: quiz.material_id,
            courseId: quiz.course_id,
            questionId: card.question_id,
            dueAt: card.due_at,
            reps: card.reps,
            lapses: card.lapses,
          },
        ]
      : [];
  });
}

export async function listDueQuestionIds(opts: { ownerId: string; quizId: string; now?: Date }) {
  const admin = getAdminSupabase();
  const { data } = await admin
    .from("review_cards")
    .select("question_id")
    .eq("owner_id", opts.ownerId)
    .eq("quiz_id", opts.quizId)
    .lte("due_at", (opts.now ?? new Date()).toISOString())
    .order("due_at", { ascending: true })
    .limit(200);
  return Array.from(new Set((data ?? []).map((card) => card.question_id)));
}

function rowToStored(row: ReviewCardRow): StoredReviewCard {
  return {
    dueAt: row.due_at,
    stability: row.stability,
    difficulty: row.difficulty,
    scheduledDays: row.scheduled_days,
    learningSteps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    lastReviewAt: row.last_review_at,
  };
}
