"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChatComposer } from "./chat-composer";
import { ChatMessageList, type ChatBubble } from "./chat-message-list";
import { ChatEmptyState } from "./chat-empty-state";
import { ChatThreadMenu, type ChatThreadSummary } from "./chat-thread-menu";

/**
 * 자료 상세 페이지의 우측 사이드 챗 패널.
 *
 * 데스크탑(md+): fixed right slide-in, 380px.
 * 모바일(<md): fixed inset-0 풀스크린 모달.
 *
 * 상태 책임:
 *   - 현재 thread (없으면 첫 메시지 전송 시 자동 생성)
 *   - 메시지 목록 (서버 fetch + stream 누적)
 *   - composer 입력
 *
 * 인용 chip 클릭 → 부모(`MaterialView`)의 page state 변경 (onJumpPage prop).
 *
 * 스트리밍: useChat 훅 대신 fetch + ReadableStream 직접 처리 — toUIMessageStreamResponse는
 * 클라이언트 useChat에 잘 맞는데, MVP는 raw text stream으로 단순화. 첫 토큰 즉시 표시.
 */
export function ChatPanel({
  open,
  onClose,
  materialId,
  materialTitle,
  onJumpPage,
}: {
  open: boolean;
  onClose: () => void;
  materialId: string;
  materialTitle: string;
  onJumpPage: (page: number) => void;
}) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [pendingAssistant, setPendingAssistant] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 특정 thread의 메시지 로드 — 선택 변경 시 재사용
  const loadMessagesFor = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/chat/threads/${id}/messages`);
      const body = (await res.json()) as {
        ok: boolean;
        messages?: ChatBubble[];
        error?: string;
      };
      if (body.ok) setMessages(body.messages ?? []);
    } catch {
      // 일시 오류는 빈 상태로 둠
      setMessages([]);
    }
  }, []);

  // open 시점에 기존 thread 목록 fetch → 가장 최근 하나 자동 선택
  useEffect(() => {
    if (!open || hydrated) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/chat/threads?materialId=${materialId}`);
        const body = (await res.json()) as {
          ok: boolean;
          threads?: ChatThreadSummary[];
          error?: string;
        };
        if (cancelled) return;
        if (!body.ok) {
          setError(body.error ?? "스레드 조회 실패");
          setHydrated(true);
          return;
        }
        const list = body.threads ?? [];
        setThreads(list);
        const recent = list[0];
        if (recent) {
          setThreadId(recent.id);
          await loadMessagesFor(recent.id);
        }
        setHydrated(true);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "조회 실패");
          setHydrated(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, materialId, hydrated, loadMessagesFor]);

  // thread 선택 — 다른 대화로 전환
  const selectThread = useCallback(
    async (id: string) => {
      if (id === threadId) return;
      setThreadId(id);
      setMessages([]);
      setPendingAssistant("");
      setError(null);
      await loadMessagesFor(id);
    },
    [threadId, loadMessagesFor],
  );

  // 새 대화 시작 — thread 없는 상태로 reset. 첫 메시지 보낼 때 POST /threads로 생성됨.
  const startNewThread = useCallback(() => {
    setThreadId(null);
    setMessages([]);
    setPendingAssistant("");
    setError(null);
  }, []);

  const renameThread = useCallback(async (id: string, nextTitle: string) => {
    try {
      const res = await fetch(`/api/chat/threads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: nextTitle }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!body.ok) {
        setError(body.error ?? "이름 변경 실패");
        return;
      }
      setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, title: nextTitle } : t)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    }
  }, []);

  const deleteThread = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/chat/threads/${id}`, { method: "DELETE" });
        const body = (await res.json()) as { ok: boolean; error?: string };
        if (!body.ok) {
          setError(body.error ?? "삭제 실패");
          return;
        }
        setThreads((prev) => prev.filter((t) => t.id !== id));
        // 지금 보고 있던 thread가 삭제됐으면 다른 thread로 이동 또는 빈 상태
        if (id === threadId) {
          const next = threads.find((t) => t.id !== id);
          if (next) {
            setThreadId(next.id);
            await loadMessagesFor(next.id);
          } else {
            setThreadId(null);
            setMessages([]);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "네트워크 오류");
      }
    },
    [threadId, threads, loadMessagesFor],
  );

  // 새 메시지 들어올 때마다 스크롤 내림
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, pendingAssistant]);

  const send = useCallback(
    async (text: string) => {
      if (busy) return;
      setError(null);
      setBusy(true);

      // thread가 없으면 먼저 생성
      let useThreadId = threadId;
      if (!useThreadId) {
        try {
          const res = await fetch("/api/chat/threads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ materialId }),
          });
          const body = (await res.json()) as {
            ok: boolean;
            threadId?: string;
            title?: string;
            error?: string;
          };
          if (!body.ok || !body.threadId) {
            setError(body.error ?? "대화를 시작하지 못했어요");
            setBusy(false);
            return;
          }
          useThreadId = body.threadId;
          setThreadId(useThreadId);
          // 목록 맨 앞에 새 thread 박음 — 메뉴 즉시 반영
          setThreads((prev) => [
            {
              id: body.threadId!,
              title: body.title ?? "새 대화",
              last_message_at: null,
              created_at: new Date().toISOString(),
            },
            ...prev,
          ]);
        } catch (e) {
          setError(e instanceof Error ? e.message : "네트워크 오류");
          setBusy(false);
          return;
        }
      }

      // 즉시 화면에 user bubble 추가 (optimistic)
      const optimisticUser: ChatBubble = {
        id: `tmp-user-${Date.now()}`,
        role: "user",
        content: text,
        citations: [],
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticUser]);
      setPendingAssistant("");

      try {
        const res = await fetch(`/api/chat/threads/${useThreadId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setError(body.error ?? `오류 (${res.status})`);
          // optimistic user 메시지는 남겨둠 (재시도 단서)
          setBusy(false);
          return;
        }

        // toUIMessageStreamResponse SSE — 파싱: data: {"type":"text-delta","textDelta":"..."}
        // 또는 단순 text stream. MVP는 둘 다 받게 관대하게 처리.
        if (!res.body) {
          setBusy(false);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          // AI SDK v6 UIMessage stream 포맷: 각 line이 SSE event
          // 각 라인이 "data: {...}\n\n" 또는 "0:\"text\"\n" 형태일 수 있음
          // 가장 안전: chunk 전체를 누적해 보이고, 클라이언트에서 JSON 토큰 파싱은 응답 완료 후
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (!line) continue;
            // data: {...} 또는 plain text — 안의 textDelta 또는 raw 텍스트
            if (line.startsWith("data: ")) {
              const payload = line.slice(6).trim();
              if (payload === "[DONE]") continue;
              try {
                const obj = JSON.parse(payload) as {
                  type?: string;
                  delta?: string;
                  textDelta?: string;
                };
                const delta = obj.textDelta ?? obj.delta;
                if (typeof delta === "string") accumulated += delta;
              } catch {
                // payload가 raw text면 그냥 추가
                if (!payload.startsWith("{")) accumulated += payload;
              }
            } else {
              // raw 텍스트 stream (toTextStreamResponse 모드)
              accumulated += line;
            }
            setPendingAssistant(accumulated);
          }
        }

        // stream 완료 — 인용 토큰 파싱
        const { body: cleanBody, citations } = parseClientCitations(accumulated);
        const assistantBubble: ChatBubble = {
          id: `tmp-asst-${Date.now()}`,
          role: "assistant",
          content: cleanBody,
          citations,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantBubble]);
        setPendingAssistant("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "네트워크 오류");
      } finally {
        setBusy(false);
      }
    },
    [busy, materialId, threadId],
  );

  if (!open) return null;

  return (
    <>
      {/* 모바일 backdrop (md 미만에서만 표시) */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm md:hidden"
        onClick={onClose}
      />

      {/* 패널 본체 */}
      <aside
        className="fixed inset-0 z-50 flex flex-col bg-white md:inset-y-0 md:right-0 md:left-auto md:w-[380px] md:border-l md:border-[var(--color-apple-hairline)] md:shadow-xl"
        aria-label="자료 챗"
      >
        <header className="border-b border-[var(--color-apple-hairline)] px-5 py-3.5">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <p
                className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]"
                style={{ letterSpacing: "0.06em" }}
              >
                이 자료 같이 보기
              </p>
              <h2
                className="mt-0.5 truncate text-[14px] wght-620 text-[var(--color-apple-ink)]"
                style={{ letterSpacing: "-0.012em" }}
                title={materialTitle}
              >
                {materialTitle}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="ml-3 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-surface,#f5f5f7)] hover:text-[var(--color-apple-ink)]"
              aria-label="닫기"
            >
              ✕
            </button>
          </div>
          <div className="mt-2 flex justify-end">
            <ChatThreadMenu
              threads={threads}
              currentId={threadId}
              onSelect={(id) => void selectThread(id)}
              onCreateNew={startNewThread}
              onRename={renameThread}
              onDelete={deleteThread}
            />
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
          {!hydrated && (
            <p
              className="mt-8 text-center text-[12px] wght-450 text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              불러오는 중…
            </p>
          )}
          {hydrated && messages.length === 0 && !pendingAssistant && (
            <ChatEmptyState onPickPrompt={send} />
          )}
          {(messages.length > 0 || pendingAssistant) && (
            <ChatMessageList
              messages={messages}
              pendingAssistant={pendingAssistant}
              onJumpPage={onJumpPage}
            />
          )}
        </div>

        {error && (
          <div className="border-t border-[var(--color-apple-hairline)] bg-[var(--color-urgent)]/5 px-5 py-2">
            <p
              className="text-[12px] wght-450 text-[var(--color-urgent)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              {error}
            </p>
          </div>
        )}

        <ChatComposer disabled={busy} onSubmit={send} />
      </aside>
    </>
  );
}

// 클라이언트 사이드 인용 토큰 파서 (서비스의 parseChatResponse와 동일 형식).
// streaming 중 partial token이 끝까지 누적된 뒤 한 번에 파싱.
const CLIENT_CITATION_RE = /\n?\[CITATIONS\](\{[\s\S]*?\})\s*$/;
function parseClientCitations(text: string): {
  body: string;
  citations: Array<{ page: number; quote: string }>;
} {
  const m = text.match(CLIENT_CITATION_RE);
  if (!m) return { body: text.trim(), citations: [] };
  try {
    const parsed = JSON.parse(m[1]) as { items?: Array<{ page: number; quote: string }> };
    if (Array.isArray(parsed.items)) {
      return {
        body: text.replace(CLIENT_CITATION_RE, "").trim(),
        citations: parsed.items.slice(0, 5),
      };
    }
  } catch {
    // fallthrough
  }
  return { body: text.trim(), citations: [] };
}
