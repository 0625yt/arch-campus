import { z } from "zod";

export const TARGET_TYPES = ["summary", "quiz_item"] as const;
export type FeedbackTargetType = (typeof TARGET_TYPES)[number];

export const SUMMARY_CATEGORIES = [
  { value: "accuracy", label: "정확도" },
  { value: "omission", label: "내용 누락" },
  { value: "format", label: "형식" },
  { value: "tone", label: "말투" },
  { value: "other", label: "기타" },
] as const;

export const QUIZ_ITEM_CATEGORIES = [
  { value: "answer_wrong", label: "정답 오류" },
  { value: "explanation_wrong", label: "해설 오류" },
  { value: "distractor_wrong", label: "보기 설명 오류" },
  { value: "unclear", label: "문제 모호함" },
  { value: "other", label: "기타" },
] as const;

const SUMMARY_VALUES = SUMMARY_CATEGORIES.map((c) => c.value) as readonly string[];
const QUIZ_VALUES = QUIZ_ITEM_CATEGORIES.map((c) => c.value) as readonly string[];

export function isValidCategoryFor(type: FeedbackTargetType, category: string): boolean {
  if (type === "summary") return SUMMARY_VALUES.includes(category);
  return QUIZ_VALUES.includes(category);
}

export const FeedbackInsertBody = z.object({
  targetType: z.enum(TARGET_TYPES),
  targetId: z.string().uuid(),
  generationId: z.string().uuid().optional(),
  rating: z.number().int().min(1).max(5),
  category: z.string().min(1).max(50),
  body: z.string().max(500).optional(),
  quizQuestionIndex: z.number().int().min(0).optional(),
});
export type FeedbackInsertBodyT = z.infer<typeof FeedbackInsertBody>;

export const FEEDBACK_STATUSES = ["new", "triaged", "accepted", "wontfix"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FeedbackPatchBody = z.object({
  status: z.enum(FEEDBACK_STATUSES),
  adminNote: z.string().max(500).optional(),
});
export type FeedbackPatchBodyT = z.infer<typeof FeedbackPatchBody>;
