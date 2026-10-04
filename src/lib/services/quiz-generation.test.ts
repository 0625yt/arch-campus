import { beforeEach, describe, expect, it, vi } from "vitest";
import { estimateCost } from "@/lib/claude";
import type { QuizQuestionT } from "@/lib/schemas";
import { runQuizGeneration } from "./quiz";

const { generate, verify, writes, commit } = vi.hoisted(() => ({
  generate: vi.fn(),
  verify: vi.fn(),
  commit: vi.fn(),
  writes: [] as Array<{ table: string; row: Record<string, unknown> }>,
}));
vi.mock("@/lib/data/material-job-result", () => ({ commitMaterialJobResult: commit }));
vi.mock("@/lib/claude", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/claude")>()),
  generate,
}));
vi.mock("@/lib/data/quizzes", () => ({ listPreviousQuizStems: async () => [] }));
vi.mock("@/lib/classify-material", () => ({
  classifyMaterial: async () => null,
  classificationToContext: () => "",
}));
vi.mock("./quiz-verifier", () => ({ verifyQuizQuestions: verify }));
vi.mock("./semantic-dedup", () => ({
  dedupeBySemanticsCached: async (existing: unknown[], incoming: unknown[]) => ({
    kept: [...existing, ...incoming.map((item) => ({ item, embedding: [] }))],
    dropped: [],
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getAdminSupabase: () => ({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        writes.push({ table, row });
        return {
          select: () => ({ single: async () => ({ data: { id: "fixture" }, error: null }) }),
        };
      },
      update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
    }),
  }),
}));

const usage = { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0 };
const modelId = "gemini-3.5-flash-lite";
const facts = [
  [
    "문서 번호는 어느 항목을 통해 각 원본을 식별하는 데 사용하는가요?",
    "문서 식별자는 각 원본을 구분하기 위해 기록한다.",
  ],
  [
    "실습 장비가 정상 작동하는지 확인하는 시점으로 적절한 것은 무엇인가요?",
    "장비 점검은 실습 시작 전과 종료 후에 수행한다.",
  ],
  [
    "인계할 때 완료하지 않은 작업을 어떻게 구분해서 전달해야 하나요?",
    "인계 기록에는 완료한 작업과 남은 작업을 구분한다.",
  ],
  [
    "측정한 사실을 적는 관찰 메모에 포함해서는 안 되는 내용은 무엇인가요?",
    "관찰 메모에는 관찰하지 않은 원인을 추정해서 적지 않는다.",
  ],
  [
    "자료 검토자의 역할을 접수 담당자와 분리하는 규칙을 고르세요.",
    "검토 담당자는 접수 담당자와 다른 사람이어야 한다.",
  ],
  [
    "교육용 장부의 이익을 계산할 때 매출과 비용은 어떻게 사용하는가요?",
    "이익은 같은 기간의 매출에서 비용을 뺀 금액이다.",
  ],
  [
    "출처 없는 거래 항목은 증빙 확인 과정에서 어떤 상태로 표시하나요?",
    "증빙이 없는 항목은 확인 필요로 표시한다.",
  ],
  [
    "보관된 원본 기록을 정정할 때 이전 내용은 어떻게 보존해야 하나요?",
    "정정은 원본을 지우지 않고 새 행과 연결해서 남긴다.",
  ],
];
const questions: QuizQuestionT[] = facts.map(([stem, evidence], index) => ({
  id: index + 1,
  kind: "multiple-choice",
  difficulty: "보통",
  topic: `규칙 ${index + 1}`,
  stem,
  evidence,
  evidencePage: 1,
  answer: "A",
  choices: [
    { key: "A", text: evidence },
    { key: "B", text: "원본을 삭제한다." },
    { key: "C", text: "확인 과정을 생략한다." },
    { key: "D", text: "추정한 값을 기록한다." },
  ],
  explanation: `원문에 명시된 규칙에 따르면 ${evidence}`,
}));
const input = {
  ownerId: "owner",
  courseId: null,
  parserWarnings: [],
  difficulty: "보통" as const,
  requestedCount: 6,
  materials: [
    {
      materialId: "material",
      title: "가상 기록 규칙",
      type: "lecture",
      fullText: `=== Page 1 ===\n${facts.map(([, evidence]) => evidence).join("\n")}`,
      pageCount: 1,
    },
  ],
};
function response(items: QuizQuestionT[]) {
  return {
    text: JSON.stringify({
      rejected: false,
      questions: items,
      watermark: "이 자료는 학습 보조용이므로 본인이 검토해야 합니다.",
    }),
    modelId,
    usage,
  };
}
beforeEach(() => {
  generate.mockReset();
  commit.mockReset();
  commit.mockResolvedValue({ quizId: "atomic-quiz" });
  verify.mockReset();
  writes.length = 0;
});

describe("quiz supplementation and rejection accounting", () => {
  it("sends verified questions to atomic job persistence and avoids direct quiz inserts", async () => {
    generate.mockResolvedValue(response(questions));
    verify.mockImplementation(
      async ({ questions: candidates }: { questions: QuizQuestionT[] }) => ({
        kept: candidates,
        dropped: [],
        technicalFailure: false,
        modelId,
        usage,
      }),
    );
    const output = await runQuizGeneration({
      ...input,
      jobExecution: { jobId: "job", retryCount: 1 },
    });
    expect(output).toMatchObject({ ok: true, quizId: "atomic-quiz" });
    expect(writes.filter((write) => write.table === "quizzes")).toHaveLength(0);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        execution: { jobId: "job", retryCount: 1 },
        ownerId: "owner",
        materialId: "material",
        quiz: expect.objectContaining({ questions: expect.any(Array) }),
        generationId: "fixture",
      }),
    );
  });

  it("reports a discarded attempt without writing a second quiz", async () => {
    generate.mockResolvedValue(response(questions));
    verify.mockImplementation(
      async ({ questions: candidates }: { questions: QuizQuestionT[] }) => ({
        kept: candidates,
        dropped: [],
        technicalFailure: false,
        modelId,
        usage,
      }),
    );
    commit.mockResolvedValue(null);
    const output = await runQuizGeneration({
      ...input,
      jobExecution: { jobId: "job", retryCount: 0 },
    });
    expect(output).toMatchObject({ ok: false, status: 500 });
    expect(writes.filter((write) => write.table === "quizzes")).toHaveLength(0);
    expect(writes.filter((write) => write.table === "generations")).toHaveLength(1);
  });
  it("records billed usage when every generation chunk rejects the material", async () => {
    generate.mockResolvedValue({
      text: JSON.stringify({
        rejected: true,
        questions: [],
        reason: "자료에 검증 가능한 본문이 부족합니다.",
        watermark: "이 자료는 학습 보조용이므로 본인이 검토해야 합니다.",
      }),
      modelId,
      usage,
    });
    const output = await runQuizGeneration(input);
    expect(output).toMatchObject({ ok: false, status: 422 });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      table: "generations",
      row: {
        status: "rejected",
        input_tokens: 200,
        output_tokens: 40,
        cost_usd: estimateCost({ ...usage, inputTokens: 200, outputTokens: 40 }, modelId),
      },
    });
    expect(verify).not.toHaveBeenCalled();
  });

  it("uses verified spares when final verification rejects one of six initial candidates", async () => {
    generate
      .mockResolvedValueOnce(response(questions.slice(0, 3)))
      .mockResolvedValueOnce(response(questions.slice(3, 6)))
      .mockResolvedValueOnce(response(questions.slice(6)));
    verify.mockImplementation(
      async ({ questions: candidates }: { questions: QuizQuestionT[] }) => ({
        kept: candidates.slice(1),
        dropped: [{ questionId: candidates[0].id, reason: "모호한 문항", evidence: "fixture" }],
        technicalFailure: false,
        modelId,
        usage,
      }),
    );
    const output = await runQuizGeneration(input);
    expect(output).toMatchObject({ ok: true, quality: { generated: 6, reason: "complete" } });
    expect(generate).toHaveBeenCalledTimes(3);
    expect(verify.mock.calls[0][0].questions).toHaveLength(8);
    const quizWrite = writes.find((entry) => entry.table === "quizzes");
    const saved = quizWrite?.row.questions as QuizQuestionT[];
    expect(saved).toHaveLength(6);
    expect(saved.some((question) => question.stem === questions[0].stem)).toBe(false);
    expect(writes.find((entry) => entry.table === "generations")?.row).toMatchObject({
      input_tokens: 400,
      output_tokens: 80,
      payload: { topupCount: 1, verifierRejectedCount: 1 },
    });
  });

  it("supplements only missing kinds when six candidates contain no essays", async () => {
    const mixed = questions.map((question, index) =>
      index < 3
        ? question
        : {
            ...question,
            kind: index < 6 ? ("short-answer" as const) : ("essay" as const),
            choices: null,
            answer: question.evidence,
          },
    );
    generate
      .mockResolvedValueOnce(response(mixed.slice(0, 3)))
      .mockResolvedValueOnce(response(mixed.slice(3, 6)))
      .mockResolvedValueOnce(response(mixed.slice(6)));
    verify.mockImplementation(
      async ({ questions: candidates }: { questions: QuizQuestionT[] }) => ({
        kept: candidates,
        dropped: [],
        technicalFailure: false,
        modelId,
        usage,
      }),
    );
    const output = await runQuizGeneration({
      ...input,
      kinds: ["multiple-choice", "short-answer", "essay"],
    });
    expect(output.ok).toBe(true);
    if (!output.ok) return;
    expect(output.quiz.questions.filter((question) => question.kind === "essay")).toHaveLength(2);
    expect(generate.mock.calls[2][0].dynamicContext).toContain("허용 kind: essay.");
  });
});
