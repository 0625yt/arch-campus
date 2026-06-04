import { describe, expect, it } from "vitest";
import {
  FeedbackInsertBody,
  isValidCategoryFor,
  QUIZ_ITEM_CATEGORIES,
  SUMMARY_CATEGORIES,
} from "./feedback";

describe("FeedbackInsertBody", () => {
  it("summary 카테고리 정상 통과", () => {
    const out = FeedbackInsertBody.parse({
      targetType: "summary",
      targetId: "550e8400-e29b-41d4-a716-446655440000",
      rating: 4,
      category: "accuracy",
      body: "좋아요",
    });
    expect(out.rating).toBe(4);
  });

  it("rating 0이면 거부", () => {
    expect(() =>
      FeedbackInsertBody.parse({
        targetType: "summary",
        targetId: "550e8400-e29b-41d4-a716-446655440000",
        rating: 0,
        category: "accuracy",
      }),
    ).toThrow();
  });

  it("body 500자 초과 거부", () => {
    expect(() =>
      FeedbackInsertBody.parse({
        targetType: "summary",
        targetId: "550e8400-e29b-41d4-a716-446655440000",
        rating: 3,
        category: "accuracy",
        body: "ㅋ".repeat(501),
      }),
    ).toThrow();
  });

  it("isValidCategoryFor: summary와 quiz_item 카테고리가 섞이면 X", () => {
    expect(isValidCategoryFor("summary", "accuracy")).toBe(true);
    expect(isValidCategoryFor("summary", "answer_wrong")).toBe(false);
    expect(isValidCategoryFor("quiz_item", "answer_wrong")).toBe(true);
    expect(isValidCategoryFor("quiz_item", "accuracy")).toBe(false);
  });

  it("카테고리 목록 노출", () => {
    expect(SUMMARY_CATEGORIES.length).toBeGreaterThan(0);
    expect(QUIZ_ITEM_CATEGORIES.length).toBeGreaterThan(0);
  });
});
