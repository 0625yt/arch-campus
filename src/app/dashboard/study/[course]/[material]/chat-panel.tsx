"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readChatResponse } from "@/lib/chat-client";
import { ChatComposer } from "./chat-composer";
import { ChatEmptyState } from "./chat-empty-state";
import { type ChatBubble, ChatMessageList } from "./chat-message-list";
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
 * 스트리밍: 공용 reader로 AI SDK SSE를 파싱하고 첫 토큰부터 표시.
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
    if (!messages.length && !pendingAssistant) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, pendingAssistant]);

  const send = useCallback(
    async (text: string) => {
      if (busy || !hydrated) return;
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
      let accumulated = "";

      try {
        const res = await fetch(`/api/chat/threads/${useThreadId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? "답변을 받지 못했어요. 다시 시도해 주세요.");
        }

        accumulated = await readChatResponse(res, (snapshot) => {
          accumulated = snapshot;
          setPendingAssistant(snapshot);
        });

        // stream 완료 — 인용 토큰 파싱
        setMessages((prev) => [...prev, createAssistantBubble(accumulated)]);
      } catch (e) {
        if (accumulated) {
          setMessages((prev) => [...prev, createAssistantBubble(accumulated)]);
        }
        setError(e instanceof Error ? e.message : "네트워크 오류");
      } finally {
        setPendingAssistant("");
        setBusy(false);
      }
    },
    [busy, hydrated, materialId, threadId],
  );

  if (!open) return null;

  return (
    <>
      {/* 모바일 backdrop (md 미만에서만 표시) */}
      <button
        type="button"
        aria-label="자료 챗 닫기"
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm md:hidden"
        onClick={onClose}
      />

      {/* 패널 본체.
          모바일: inset-0이지만 키보드가 올라오면 100vh 기준으로 하단이 가려진다.
          dvh(visualViewport 반영)로 입력창이 항상 보이게.
          데스크탑(md↑)에선 sidebar fixed라 무관. */}
      <aside
        className="fixed inset-x-0 top-0 z-50 flex h-dvh flex-col bg-white md:inset-y-0 md:right-0 md:left-auto md:h-auto md:w-[380px] md:border-l md:border-[var(--color-apple-hairline)] md:shadow-xl"
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
          <fieldset disabled={busy} className="mt-2 flex justify-end disabled:opacity-50">
            <ChatThreadMenu
              threads={threads}
              currentId={threadId}
              onSelect={(id) => void selectThread(id)}
              onCreateNew={startNewThread}
              onRename={renameThread}
              onDelete={deleteThread}
            />
          </fieldset>
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
          {busy && !pendingAssistant && (
            <p role="status" className="mt-4 text-[12px] text-[var(--color-apple-muted)]">
              자료를 살펴보고 있어요…
            </p>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="border-t border-[var(--color-apple-hairline)] bg-[var(--color-urgent)]/5 px-5 py-2"
          >
            <p
              className="text-[12px] wght-450 text-[var(--color-urgent)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              {error}
            </p>
          </div>
        )}

        <ChatComposer disabled={busy || !hydrated} onSubmit={send} />
      </aside>
    </>
  );
}

function createAssistantBubble(text: string): ChatBubble {
  const { body, citations } = parseClientCitations(text);
  return {
    id: `tmp-asst-${crypto.randomUUID()}`,
    role: "assistant",
    content: body,
    citations,
    created_at: new Date().toISOString(),
  };
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
