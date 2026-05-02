"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const PROMPT_CHIPS: { label: string; prompt: string }[] = [
  { label: "운영체제 5주차 정리해줘", prompt: "운영체제 5주차 프로세스 동기화 자료 요약해줘" },
  { label: "이번 주 마감 알려줘", prompt: "이번 주 마감 일정 알려줘" },
  { label: "발표 자료 만들기", prompt: "발표 자료 만들어줘" },
  { label: "강의계획서 정리하기", prompt: "강의계획서 PDF 올리면 일정 자동 정리해줘" },
];

const GREETINGS = [
  "오늘은 무엇을 도와드릴까요",
  "어디서부터 시작해볼까요",
  "오늘은 어떤 공부를 도와드릴까요",
];

export function StartScreen() {
  const router = useRouter();
  const [greeting, setGreeting] = useState(GREETINGS[0]);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setGreeting(GREETINGS[Math.floor(Math.random() * GREETINGS.length)]);
  }, []);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [draft]);

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    router.push(`/dashboard/chat?q=${encodeURIComponent(trimmed)}`);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(draft);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit(draft);
    }
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[680px] flex-col items-center justify-center px-5 py-10 sm:px-7 sm:py-14 md:px-12 md:py-20">
      {/* 인사말 */}
      <p
        suppressHydrationWarning
        className="fade-up text-[12.5px] wght-560 kerning-mono uppercase text-[var(--color-fg-subtle)]"
      >
        윤태경 · 컴퓨터공학과 3학년
      </p>
      <h1 className="mt-3 fade-up fade-up-1 text-center text-[28px] leading-[1.25] kerning-tight wght-700 text-[var(--color-fg-strong)] sm:text-[34px] md:text-[40px]">
        <span suppressHydrationWarning>{greeting}</span>
      </h1>
      <p className="mt-3 fade-up fade-up-1 text-center text-[13.5px] wght-450 kerning-tight text-[var(--color-fg-muted)] sm:text-[14.5px]">
        강의·자료·일정·위저드까지, 자연어로 물어보세요
      </p>

      {/* 큰 입력창 */}
      <form
        onSubmit={onSubmit}
        className="mt-10 fade-up fade-up-2 w-full"
      >
        <div className="flex items-end gap-2 rounded-2xl border border-[var(--color-line-strong)] bg-[var(--color-bg)] px-3 py-2.5 shadow-[var(--shadow-soft)] transition-shadow duration-[var(--duration-base)] focus-within:shadow-[var(--shadow-lift)]">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="무엇이든 물어보세요"
            autoFocus
            className="flex-1 resize-none bg-transparent px-2 py-1.5 text-[14.5px] wght-450 kerning-tight text-[var(--color-fg-strong)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none focus-visible:outline-none"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-fg-strong)] text-white transition-opacity disabled:opacity-30"
            aria-label="전송"
          >
            <SendIcon />
          </button>
        </div>
      </form>

      {/* prompt chip 4개 — 자주 쓰는 첫 질문 */}
      <ul className="mt-6 fade-up fade-up-3 flex w-full flex-wrap justify-center gap-1.5">
        {PROMPT_CHIPS.map((c) => (
          <li key={c.label}>
            <button
              type="button"
              onClick={() => submit(c.prompt)}
              className="rounded-full border border-[var(--color-line)] bg-[var(--color-bg)] px-3.5 py-1.5 text-[12px] wght-450 kerning-tight text-[var(--color-fg-muted)] transition-all duration-[var(--duration-base)] hover:-translate-y-px hover:border-[var(--color-line-strong)] hover:text-[var(--color-fg-strong)] hover:shadow-[var(--shadow-soft)]"
            >
              {c.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 13V3M8 3L4 7M8 3l4 4"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
