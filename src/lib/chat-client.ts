const EMPTY_RESPONSE = "답변을 받지 못했어요. 잠시 후 다시 시도해 주세요.";
const INVALID_RESPONSE = "답변을 불러오다가 연결이 끊겼어요. 다시 시도해 주세요.";

/** Keep requests within /api/chat/free's limits without changing the displayed conversation. */
export function prepareChatHistory(
  messages: ReadonlyArray<{
    role: "user" | "assistant";
    text: string;
    pending?: boolean;
    error?: string;
  }>,
): Array<{ role: "user" | "assistant"; content: string }> {
  return messages
    .filter((message) => !message.pending && !message.error && message.text.trim())
    .slice(-20)
    .map((message) => ({
      role: message.role,
      // Avoid splitting an emoji at the UTF-16 length boundary used by the API schema.
      content: message.text.slice(0, 4000).replace(/[\uD800-\uDBFF]$/u, ""),
    }));
}

/** Read AI SDK UI-message SSE, retaining partial lines and UTF-8 bytes between chunks. */
export async function readChatResponse(
  response: Response,
  onText: (accumulated: string) => void,
): Promise<string> {
  if (!response.body) throw new Error(EMPTY_RESPONSE);

  const isSse = response.headers.get("content-type")?.includes("text/event-stream");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";
  let buffer = "";
  let eventData: string[] = [];
  let finished = false;

  function append(text: string) {
    if (!text) return;
    accumulated += text;
    onText(accumulated);
  }

  function dispatchEvent() {
    if (!eventData.length || finished) return;
    const payload = eventData.join("\n");
    eventData = [];
    if (payload.trim() === "[DONE]") {
      finished = true;
      return;
    }

    let event: unknown;
    try {
      event = JSON.parse(payload);
    } catch {
      throw new Error(INVALID_RESPONSE);
    }
    if (!event || typeof event !== "object") return;
    const part = event as Record<string, unknown>;
    if (part.type === "error") {
      throw new Error(typeof part.errorText === "string" ? part.errorText : INVALID_RESPONSE);
    }
    if (part.type === "abort") throw new Error(INVALID_RESPONSE);
    // Ignore reasoning, tool calls, usage, and other protocol metadata.
    if (part.type !== "text-delta") return;
    const delta = part.delta ?? part.textDelta;
    if (typeof delta !== "string") throw new Error(INVALID_RESPONSE);
    append(delta);
  }

  function acceptLine(line: string) {
    if (!line) {
      dispatchEvent();
    } else if (line === "data" || line.startsWith("data:")) {
      eventData.push(line.slice(5).replace(/^ /, ""));
    }
    // SSE comments and event/id/retry fields are not answer text.
  }

  function consume(text: string, final = false) {
    if (!isSse) {
      append(text);
      return;
    }
    buffer += text;
    while (!finished) {
      const index = buffer.search(/[\r\n]/);
      if (index < 0) break;
      // A CRLF separator can itself be split across network chunks.
      if (buffer[index] === "\r" && index === buffer.length - 1 && !final) break;
      const line = buffer.slice(0, index);
      const separatorLength = buffer.slice(index, index + 2) === "\r\n" ? 2 : 1;
      buffer = buffer.slice(index + separatorLength);
      acceptLine(line);
    }
    if (final && !finished) {
      if (buffer) acceptLine(buffer);
      buffer = "";
      dispatchEvent();
    }
  }

  try {
    while (!finished) {
      const { done, value } = await reader.read();
      if (done) {
        consume(decoder.decode(), true);
        break;
      }
      consume(decoder.decode(value, { stream: true }));
    }
    if (!accumulated.trim()) throw new Error(EMPTY_RESPONSE);
    return accumulated;
  } finally {
    // Stop unread data after [DONE] or an error and always release the stream lock.
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
