import { describe, expect, it, vi } from "vitest";
import { prepareChatHistory, readChatResponse } from "./chat-client";

function streamResponse(
  text: string,
  chunkSize = 1,
  contentType = "text/event-stream; charset=utf-8",
) {
  const bytes = new TextEncoder().encode(text);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        controller.enqueue(bytes.slice(offset, offset + chunkSize));
      }
      controller.close();
    },
  });
  return new Response(body, { headers: { "Content-Type": contentType } });
}

function event(type: string, fields: Record<string, unknown> = {}) {
  return `data: ${JSON.stringify({ type, ...fields })}\n\n`;
}

describe("readChatResponse", () => {
  it("buffers split SSE prefixes, JSON, and Korean/emoji UTF-8 bytes", async () => {
    const onText = vi.fn();
    const response = streamResponse(
      event("start") +
        event("text-start", { id: "answer" }) +
        event("text-delta", { id: "answer", delta: "안녕하세요 🎓\n" }) +
        event("text-delta", { id: "answer", delta: "\n두 번째 문단" }) +
        event("text-end", { id: "answer" }) +
        "data: [DONE]\n\n",
    );

    await expect(readChatResponse(response, onText)).resolves.toBe("안녕하세요 🎓\n\n두 번째 문단");
    expect(onText.mock.calls).toEqual([["안녕하세요 🎓\n"], ["안녕하세요 🎓\n\n두 번째 문단"]]);
    expect(response.body?.locked).toBe(false);
  });

  it("ignores metadata, comments, and non-answer deltas", async () => {
    const response = streamResponse(
      ": keep-alive\nevent: message\nid: 42\nretry: 1000\n\n" +
        event("reasoning-delta", { delta: "hidden reasoning" }) +
        event("data-sources", { delta: "internal metadata" }) +
        event("text-delta", { textDelta: "정답" }) +
        "data: [DONE]\n\n" +
        event("text-delta", { delta: "ignored after completion" }),
      10_000,
    );
    await expect(readChatResponse(response, vi.fn())).resolves.toBe("정답");
  });

  it.each([
    "\n",
    "\r\n",
    "\r",
  ])("accepts multi-line SSE data with fragmented %j separators", async (separator) => {
    const response = streamResponse(
      ['data:{"type":"text-delta",', 'data: "delta":"공부 시작"}', "", ""].join(separator),
    );
    await expect(readChatResponse(response, vi.fn())).resolves.toBe("공부 시작");
  });

  it("flushes an event without a trailing newline", async () => {
    const response = streamResponse('data: {"type":"text-delta","delta":"마지막 문장"}');
    await expect(readChatResponse(response, vi.fn())).resolves.toBe("마지막 문장");
  });

  it("preserves plain text whitespace and protocol-like text exactly", async () => {
    const text = " 첫 문단 🎓\n\n  - 항목\r\n\ndata: 일반 텍스트\n ";
    await expect(
      readChatResponse(streamResponse(text, 1, "text/plain; charset=utf-8"), vi.fn()),
    ).resolves.toBe(text);
  });

  it("reports explicit stream errors while retaining already delivered text", async () => {
    const onText = vi.fn();
    const response = streamResponse(
      event("text-delta", { delta: "받은 내용" }) +
        event("error", { errorText: "잠시 후 다시 시도해 주세요." }),
    );
    await expect(readChatResponse(response, onText)).rejects.toThrow("잠시 후 다시 시도해 주세요.");
    expect(onText).toHaveBeenLastCalledWith("받은 내용");
    expect(response.body?.locked).toBe(false);
  });

  it("rejects malformed or aborted streams instead of exposing protocol fragments", async () => {
    for (const text of ['data: {"type":"text-delta","delta":"broken\n\n', event("abort")]) {
      const onText = vi.fn();
      await expect(readChatResponse(streamResponse(text), onText)).rejects.toThrow(
        "연결이 끊겼어요",
      );
      expect(onText).not.toHaveBeenCalled();
    }
  });

  it("reports missing bodies and streams that complete without an answer", async () => {
    for (const response of [
      new Response(null),
      streamResponse(""),
      streamResponse(`${event("start")}data: [DONE]\n\n`),
    ]) {
      await expect(readChatResponse(response, vi.fn())).rejects.toThrow("답변을 받지 못했어요");
    }
  });

  it("surfaces interrupted network reads and releases the reader", async () => {
    const response = new Response(
      new ReadableStream({
        pull(controller) {
          controller.error(new Error("offline"));
        },
      }),
      { headers: { "Content-Type": "text/event-stream" } },
    );
    await expect(readChatResponse(response, vi.fn())).rejects.toThrow("offline");
    expect(response.body?.locked).toBe(false);
  });
});

describe("prepareChatHistory", () => {
  it("keeps the latest 20 completed nonempty messages and excludes failures", () => {
    const messages = Array.from({ length: 24 }, (_, index) => ({
      role: index % 2 ? ("assistant" as const) : ("user" as const),
      text: `message ${index}`,
    }));
    const history = prepareChatHistory([
      ...messages,
      { role: "assistant", text: "in progress", pending: true },
      { role: "assistant", text: "incomplete", error: "offline" },
      { role: "assistant", text: " \n" },
    ]);
    expect(history).toHaveLength(20);
    expect(history[0]).toEqual({ role: "user", content: "message 4" });
    expect(history.at(-1)).toEqual({ role: "assistant", content: "message 23" });
  });

  it("caps API content at 4000 characters without mutating messages or splitting emojis", () => {
    const text = `${"가".repeat(3999)}🎓추가 내용`;
    const messages = [{ role: "assistant" as const, text }];
    expect(prepareChatHistory(messages)[0].content).toBe("가".repeat(3999));
    expect(messages[0].text).toBe(text);
    expect(
      prepareChatHistory([{ role: "assistant", text: "a".repeat(5000) }])[0].content,
    ).toHaveLength(4000);
  });
});
