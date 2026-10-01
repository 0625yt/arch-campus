import { NoObjectGeneratedError } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { generateTextMock } = vi.hoisted(() => ({ generateTextMock: vi.fn() }));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: generateTextMock,
}));

import { generate } from "./claude";

const input = {
  tool: "quiz" as const,
  rulePrompt: "근거로 판단",
  dynamicContext: "문항 생성",
  userInput: "가상 자료",
};
const usage = {
  inputTokens: 100,
  outputTokens: 20,
  totalTokens: 120,
  inputTokenDetails: { noCacheTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0 },
  outputTokenDetails: { textTokens: 20, reasoningTokens: 0 },
};
describe("native structured generation", () => {
  beforeEach(() => {
    vi.stubEnv("QUIZ_MODEL_VENDOR", "google");
    generateTextMock.mockReset();
    generateTextMock.mockResolvedValue({ text: '{"ok":true}', usage, finishReason: "stop" });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("요청한 schema를 SDK 객체 출력으로 전달한다", async () => {
    const result = await generate({ ...input, responseSchema: z.object({ ok: z.boolean() }) });
    const output = generateTextMock.mock.calls[0][0].output;
    expect(output).toBeDefined();
    expect(await output.responseFormat).toMatchObject({ type: "json", schema: { type: "object" } });
    expect(result.usage).toMatchObject({ inputTokens: 100, outputTokens: 20 });
  });
  it("일반 텍스트 도구는 기존 호출 방식을 유지한다", async () => {
    await generate(input);
    expect(generateTextMock.mock.calls[0][0].output).toBeUndefined();
  });
  it("형식 오류의 원문과 청구 토큰을 보존해 후속 검증에 맡긴다", async () => {
    generateTextMock.mockRejectedValue(
      new NoObjectGeneratedError({
        text: '{"ok":"wrong type"}',
        usage,
        finishReason: "stop",
        response: { id: "synthetic", modelId: "synthetic", timestamp: new Date() },
      }),
    );
    const result = await generate({ ...input, responseSchema: z.object({ ok: z.boolean() }) });
    expect(result).toMatchObject({
      text: '{"ok":"wrong type"}',
      finishReason: "error",
      usage: { inputTokens: 100, outputTokens: 20 },
    });
  });
  it("제공자 인증 실패를 정상 출력으로 둔갑시키지 않는다", async () => {
    generateTextMock.mockRejectedValue(new Error("synthetic provider failure"));
    await expect(generate(input)).rejects.toThrow("synthetic provider failure");
  });
});
