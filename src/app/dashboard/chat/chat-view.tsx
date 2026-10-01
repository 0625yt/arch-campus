"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { prepareChatHistory, readChatResponse } from "@/lib/chat-client";

type Role = "user" | "assistant";

type Message = {
  id: string;
  role: Role;
  text: string;
  pending?: boolean;
  error?: string;
};

export function ChatView() {
  const router = useRouter();
  const params = useSearchParams();
  const initialQ = params.get("q")?.trim() ?? "";

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  // iOS Safari: position:sticky bottom:0은 layout viewport 기준이라 키보드 올라오면 가려짐.
  // visualViewport로 keyboard 차지한 만큼 transform 보정.
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  const listEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const submittedInitial = useRef(false);
  const inFlight = useRef(false);

  // bfcache 복원 시에도 동일하게 비우기.
  useEffect(() => {
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) {
        setDraft("");
        setMessages([]);
        submittedInitial.current = false;
      }
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useLayoutEffect(() => {
    if (!messages.length) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    listEndRef.current?.scrollIntoView({
      behavior: messages.at(-1)?.pending || reduceMotion ? "auto" : "smooth",
      block: "end",
    });
  }, [messages]);

  // 모바일 가상 키보드가 입력창을 가리지 않도록 visualViewport 보정.
  // iOS Safari: window.innerHeight는 키보드 무시. visualViewport.height만 줄어듦. 그 차이만큼 sticky form을 위로.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const delta = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      // 데스크탑·작은 변동(스크롤바 등)은 무시.
      setKeyboardOffset(delta > 80 ? delta : 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    if (draft) el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || inFlight.current) return;
      if (trimmed.length > 2000) {
        setDraft(text);
        setInputError("질문은 2,000자 이내로 적어 주세요.");
        return;
      }
      setInputError(null);

      const uid = crypto.randomUUID();
      const aid = crypto.randomUUID();

      const historyForApi = prepareChatHistory(messages);

      inFlight.current = true;
      setMessages((prev) => [
        ...prev,
        { id: uid, role: "user", text: trimmed },
        { id: aid, role: "assistant", text: "", pending: true },
      ]);
      setDraft("");
      setSubmitting(true);

      try {
        const res = await fetch("/api/chat/free", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, history: historyForApi }),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? "답변을 받지 못했어요. 다시 시도해 주세요.");
        }

        const accumulated = await readChatResponse(res, (snapshot) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === aid ? { ...m, text: snapshot, pending: true } : m)),
          );
        });

        // stream 완료
        setMessages((prev) =>
          prev.map((m) => (m.id === aid ? { ...m, text: accumulated, pending: false } : m)),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "연결이 끊겼어요. 다시 시도해 주세요.";
        setMessages((prev) =>
          prev.map((m) => (m.id === aid ? { ...m, error: msg, pending: false } : m)),
        );
      } finally {
        inFlight.current = false;
        setSubmitting(false);
      }
    },
    [messages],
  );

  // The ref prevents Strict Mode's repeated effect setup from sending the question twice.
  useEffect(() => {
    if (submittedInitial.current || !initialQ) return;
    submittedInitial.current = true;
    router.replace("/dashboard/chat", { scroll: false });
    void send(initialQ);
  }, [initialQ, router, send]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void send(draft);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(draft);
    }
  };

  return (
    <div className="relative min-h-full bg-[var(--color-apple-pearl)]">
      <div className="mx-auto flex w-full max-w-[820px] flex-col px-4 sm:px-10 md:px-12">
        {/* 자료 인용까지 필요한 경우 안내 — 자유 챗은 학생 컨텍스트 기반, 인용은 자료 챗. */}
        <div className="mt-8 rounded-[12px] border border-[var(--color-apple-hairline)] bg-white px-4 py-3 sm:mt-10">
          <p
            className="text-[12.5px] leading-[1.5] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.022em" }}
          >
            자료 본문 인용·페이지 점프가 필요하면{" "}
            <Link
              href="/dashboard/study"
              className="wght-560 text-[var(--color-apple-action)] hover:underline"
            >
              공부 → 강의 → 자료
            </Link>{" "}
            안의 자료 챗에서 열어 주세요. 여기는 자료 없이도 막힌 부분을 같이 풀어보는 코치 챗.
          </p>
        </div>

        <div className="flex-1 pb-[200px] pt-6 sm:pt-8">
          {messages.length === 0 ? (
            <EmptyHint
              onPick={(q) => {
                setDraft(q);
                inputRef.current?.focus();
              }}
            />
          ) : (
            <ul className="space-y-8">
              {messages.map((m, i) => (
                <li
                  key={m.id}
                  className="fade-up"
                  style={{ animationDelay: `${Math.min(i * 30, 120)}ms` }}
                >
                  {m.role === "user" ? <UserBubble text={m.text} /> : <AssistantBubble m={m} />}
                </li>
              ))}
            </ul>
          )}
          <div ref={listEndRef} />
        </div>

        {/* 하단 고정 입력창. iOS 키보드 가림 대응 — keyboardOffset만큼 위로 올림. */}
        <form
          onSubmit={onSubmit}
          className="pointer-events-none sticky bottom-0 left-0 right-0 -mx-6 transition-transform sm:-mx-10 md:-mx-12"
          style={{ transform: keyboardOffset > 0 ? `translateY(-${keyboardOffset}px)` : undefined }}
        >
          <div className="pointer-events-auto bg-gradient-to-t from-[var(--color-apple-pearl)] via-[var(--color-apple-pearl)] via-70% to-transparent px-6 pb-6 pt-10 sm:px-10 md:px-12">
            <div className="mx-auto flex w-full items-end gap-2 rounded-[18px] border border-[var(--color-apple-hairline-soft)] bg-white px-4 py-3 transition-colors focus-within:border-[var(--color-apple-action)]">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setInputError(null);
                }}
                onKeyDown={onKeyDown}
                rows={1}
                maxLength={2000}
                aria-label="코치에게 질문하기"
                aria-invalid={Boolean(inputError)}
                aria-describedby={inputError ? "chat-input-error" : undefined}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="무엇이든 물어보세요"
                className="flex-1 resize-none bg-transparent px-1 py-1 text-[15px] wght-450 text-[var(--color-apple-ink)] placeholder:text-[var(--color-apple-muted)] focus:outline-none focus-visible:outline-none"
                style={{ letterSpacing: "-0.012em" }}
              />
              <button
                type="submit"
                disabled={!draft.trim() || submitting}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-apple-action)] text-white transition-all duration-150 hover:bg-[var(--color-apple-action-hover)] active:scale-[0.95] disabled:opacity-30"
                aria-label="전송"
              >
                <SendIcon />
              </button>
            </div>
            {inputError && (
              <p
                id="chat-input-error"
                role="alert"
                className="mt-2 text-sm text-[var(--color-urgent)]"
              >
                {inputError}
              </p>
            )}
            <p
              className="mt-3 text-center text-[11px] wght-450 text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              학습 보조용입니다. 결과는 본인이 검토·수정해 사용하세요.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

const STARTER_QUESTIONS = [
  "이번 주 마감 알려줘",
  "운영체제 시험이 4일 남았는데 뭐부터 볼까",
  "발표 준비, 어떤 순서로 만들면 좋을까",
  "이 자료 요약해줘",
] as const;

function EmptyHint({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1
        className="text-[28px] leading-[1.1] wght-620 text-[var(--color-apple-ink)] sm:text-[36px]"
        style={{ letterSpacing: "-0.012em" }}
      >
        무엇이든 물어보세요.
      </h1>
      <p
        className="mt-4 max-w-[440px] text-[15px] leading-[1.55] wght-450 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.022em" }}
      >
        강의명을 말하면 자료에서 요약·문제 생성, 일정·발표·과제 안내까지 한 번에.
      </p>

      {/* 칩 — 클릭하면 입력창에 자동 입력. 사용자가 첫 질문을 떠올리는 비용을 0으로. */}
      <ul className="mt-7 flex flex-wrap items-center justify-center gap-1.5">
        {STARTER_QUESTIONS.map((q) => (
          <li key={q}>
            <button
              type="button"
              onClick={() => onPick(q)}
              className="inline-flex items-center rounded-full border border-[var(--color-apple-hairline)] bg-white px-3.5 py-2 text-[12.5px] wght-560 text-[var(--color-apple-ink)] transition-colors hover:border-[var(--color-apple-action)] hover:text-[var(--color-apple-action)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              {q}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[88%] whitespace-pre-wrap break-words rounded-[18px] bg-[var(--color-apple-action)] px-4 py-2.5 text-[14.5px] leading-[1.55] wght-450 text-white sm:max-w-[78%]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {text}
      </div>
    </div>
  );
}

function AssistantBubble({ m }: { m: Message }) {
  return (
    <div className="flex gap-3">
      <AssistantAvatar />
      <div className="min-w-0 flex-1 pt-0.5">
        {m.pending && !m.text ? (
          <TypingDots />
        ) : m.text ? (
          <p
            className="whitespace-pre-wrap break-words text-[15px] leading-[1.65] wght-450 text-[var(--color-apple-ink)] sm:text-[15.5px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {m.text}
          </p>
        ) : null}
        {m.error && (
          <p role="alert" className="mt-2 text-[13px] leading-relaxed text-[var(--color-urgent)]">
            {m.error}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Assistant avatar — start-screen·tools·calendar의 AI entry orb와 동일 톤.
 * cobalt → mauve 그라데이션 + sparkles. 화면 간 "AI"가 같은 정체성으로 보임.
 */
function AssistantAvatar() {
  return (
    <div
      aria-hidden
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white shadow-[0_2px_8px_-2px_rgba(0,113,227,0.4)]"
      style={{
        background:
          "linear-gradient(135deg, var(--color-apple-action) 0%, #7aa6d6 60%, #a08bc4 100%)",
      }}
    >
      <Sparkles className="h-[13px] w-[13px]" strokeWidth={2.4} />
    </div>
  );
}

function TypingDots() {
  return (
    <span role="status" aria-label="답변 작성 중" className="inline-flex items-center gap-1 py-2">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-apple-muted)] pulse-dot" />
      <span
        className="h-1.5 w-1.5 rounded-full bg-[var(--color-apple-muted)] pulse-dot"
        style={{ animationDelay: "200ms" }}
      />
      <span
        className="h-1.5 w-1.5 rounded-full bg-[var(--color-apple-muted)] pulse-dot"
        style={{ animationDelay: "400ms" }}
      />
    </span>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 13V3M8 3L4 7M8 3l4 4"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
