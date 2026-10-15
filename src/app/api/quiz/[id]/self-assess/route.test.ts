import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ owner: vi.fn(), get: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getOwnerId: mocks.owner,
  UnauthorizedError: class extends Error {},
}));
vi.mock("@/lib/data/attempts", () => ({
  getAttemptResults: mocks.get,
  upsertAttemptResults: mocks.save,
}));

import { POST } from "./route";

const attemptId = "00000000-0000-4000-8000-000000000001";
const req = (accepted = true) =>
  new Request("http://localhost/api/quiz/q/self-assess", {
    method: "POST",
    body: JSON.stringify({ attemptId, questionId: 7, accepted }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.owner.mockResolvedValue("owner-a");
});
it("does not write when the owner-scoped attempt cannot be read", async () => {
  mocks.get.mockResolvedValue(null);
  expect((await POST(req(), { params: Promise.resolve({ id: "quiz-a" }) })).status).toBe(404);
  expect(mocks.get).toHaveBeenCalledWith({ ownerId: "owner-a", quizId: "quiz-a", attemptId });
  expect(mocks.save).not.toHaveBeenCalled();
});
it("changes only the stored graded answer and retains the automatic verdict", async () => {
  mocks.get.mockResolvedValue([
    {
      questionId: 7,
      kind: "short-answer",
      correct: false,
      submitted: "제어",
      answer: "제어 결합도",
      evidence: "플래그를 전달한다.",
      explanation: "제어 결합도",
      evidencePage: null,
    },
  ]);
  mocks.save.mockResolvedValue({ score: 1, total: 1 });
  const response = await POST(req(), { params: Promise.resolve({ id: "quiz-a" }) });
  expect(response.status).toBe(200);
  expect(mocks.save).toHaveBeenCalledWith(
    expect.objectContaining({
      ownerId: "owner-a",
      quizId: "quiz-a",
      attemptId,
      newResults: [
        expect.objectContaining({
          correct: true,
          submitted: "제어",
          selfAssessment: expect.objectContaining({ originalCorrect: false }),
        }),
      ],
    }),
  );
});
