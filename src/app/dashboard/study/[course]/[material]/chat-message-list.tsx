"use client";

export interface ChatBubble {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Array<{ page: number; quote: string }>;
  created_at: string;
}

export function ChatMessageList({
  messages,
  pendingAssistant,
  onJumpPage,
}: {
  messages: ChatBubble[];
  pendingAssistant: string;
  onJumpPage: (page: number) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {messages.map((m) => (
        <Bubble key={m.id} message={m} onJumpPage={onJumpPage} />
      ))}
      {pendingAssistant && (
        <Bubble
          message={{
            id: "pending",
            role: "assistant",
            content: pendingAssistant,
            citations: [],
            created_at: new Date().toISOString(),
          }}
          onJumpPage={onJumpPage}
          pending
        />
      )}
    </div>
  );
}

function Bubble({
  message,
  onJumpPage,
  pending = false,
}: {
  message: ChatBubble;
  onJumpPage: (page: number) => void;
  pending?: boolean;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[85%] rounded-[16px] rounded-tr-[6px] bg-[var(--color-apple-ink)] px-4 py-2.5 text-[14px] leading-[1.55] text-white"
          style={{ letterSpacing: "-0.012em" }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] rounded-[16px] rounded-tl-[6px] border border-[var(--color-apple-hairline)] bg-white px-4 py-3">
        <div
          className="whitespace-pre-wrap text-[14px] leading-[1.6] wght-450 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {message.content}
          {pending && (
            <span className="ml-1 inline-block h-3 w-2 animate-pulse bg-[var(--color-apple-muted)] align-baseline" />
          )}
        </div>

        {message.citations.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {message.citations.map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onJumpPage(c.page)}
                title={c.quote}
                className="inline-flex items-center rounded-[6px] border border-[var(--color-apple-hairline)] bg-white px-1.5 py-0.5 text-[11px] wght-560 tabular-nums text-[var(--color-apple-muted)] hover:border-[var(--color-apple-action)] hover:text-[var(--color-apple-action)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                p.{c.page}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
