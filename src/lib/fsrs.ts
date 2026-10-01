import { type Card, createEmptyCard, fsrs, type Grade, Rating, State } from "ts-fsrs";

export type ReviewRating = 1 | 2 | 3 | 4;

export interface StoredReviewCard {
  dueAt: string;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: number;
  lastReviewAt: string | null;
}

const scheduler = fsrs({
  request_retention: 0.9,
  maximum_interval: 365,
  enable_fuzz: true,
});

export function scheduleReview(
  stored: StoredReviewCard | null,
  rating: ReviewRating,
  reviewedAt = new Date(),
) {
  const current = stored ? fromStoredCard(stored) : createEmptyCard(reviewedAt);
  const result = scheduler.next(current, reviewedAt, rating as Grade);
  return {
    card: toStoredCard(result.card),
    log: {
      rating,
      previousState: current.state,
      previousDueAt: current.due.toISOString(),
      reviewedAt: reviewedAt.toISOString(),
      scheduledDays: result.log.scheduled_days,
      stability: result.log.stability,
      difficulty: result.log.difficulty,
    },
  };
}

export function ratingLabel(rating: ReviewRating) {
  return {
    [Rating.Again]: "다시",
    [Rating.Hard]: "어려움",
    [Rating.Good]: "보통",
    [Rating.Easy]: "쉬움",
  }[rating];
}

function fromStoredCard(card: StoredReviewCard): Card {
  return {
    due: new Date(card.dueAt),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: 0,
    scheduled_days: card.scheduledDays,
    learning_steps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: normalizeState(card.state),
    last_review: card.lastReviewAt ? new Date(card.lastReviewAt) : undefined,
  };
}

function toStoredCard(card: Card): StoredReviewCard {
  return {
    dueAt: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReviewAt: card.last_review?.toISOString() ?? null,
  };
}

function normalizeState(state: number): State {
  if (state === State.Learning || state === State.Review || state === State.Relearning)
    return state;
  return State.New;
}
