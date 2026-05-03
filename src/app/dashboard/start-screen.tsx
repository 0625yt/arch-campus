"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const PROMPT_CHIPS: { label: string; prompt: string }[] = [
  { label: "시험 전 뭐부터 볼지", prompt: "운영체제 중간고사 전까지 뭐부터 보면 좋을지 정리해줘" },
  { label: "과제 3단계로 쪼개기", prompt: "자료구조 과제를 오늘 끝낼 수 있게 3단계로 쪼개줘" },
  { label: "발표 흐름 잡기", prompt: "데이터베이스 발표를 슬라이드 흐름과 예상 질문으로 정리해줘" },
  { label: "이번 주 위험 일정", prompt: "이번 주 마감과 시험 중 위험한 것부터 알려줘" },
];

export function StartScreen() {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
    <div className="mx-auto flex min-h-full w-full max-w-[680px] flex-col justify-start px-5 pb-10 pt-12 sm:px-7 sm:py-14 md:px-12 md:py-20">
      <p className="fade-up text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
        새로 물어보기
      </p>
      <h1 className="mt-3 fade-up fade-up-1 text-[27px] leading-[1.24] kerning-tight wght-700 text-[var(--color-fg-strong)] sm:text-[32px] md:text-[36px]">
        막힌 걸 그대로 적으면, 공부 순서로 바꿔드려요
      </h1>
      <p className="mt-3 fade-up fade-up-1 max-w-[520px] text-[13.5px] leading-[1.6] wght-450 kerning-tight text-[var(--color-fg-muted)]">
        “뭘 해야 할지 모르겠다” 같은 말도 괜찮아요. 과제·시험·발표 중 지금 행동으로 옮길 수 있는 형태로 쪼갭니다.
      </p>

      <form
        onSubmit={onSubmit}
        className="mt-8 fade-up fade-up-2 w-full"
      >
        <div className="flex items-end gap-2 rounded-xl border border-[var(--color-line-strong)] bg-[var(--color-bg)] px-3 py-2.5 shadow-[var(--shadow-soft)] transition-shadow duration-[var(--duration-base)] focus-within:shadow-[var(--shadow-lift)]">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="예: 운영체제 시험이 4일 남았는데 뭐부터 볼까"
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

      <ul className="mt-6 fade-up fade-up-3 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {PROMPT_CHIPS.map((c) => (
          <li key={c.label}>
            <button
              type="button"
              onClick={() => submit(c.prompt)}
              className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] px-3.5 py-3 text-left text-[12.5px] wght-450 kerning-tight text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-fg-strong)]"
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
