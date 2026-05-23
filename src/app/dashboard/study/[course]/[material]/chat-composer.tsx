"use client";

import { useRef, useState, type KeyboardEvent } from "react";

/**
 * 메시지 입력 — 한글 IME 가드(isComposing) 포함.
 * Enter 전송, Shift+Enter 줄바꿈.
 */
export function ChatComposer({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  function submit() {
    const value = text.trim();
    if (!value || disabled) return;
    onSubmit(value);
    setText("");
    // 다음 tick에 height 초기화
    if (taRef.current) taRef.current.style.height = "auto";
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter") return;
    // 한글 IME 조합 중에는 Enter가 후보 확정. 전송 X.
    if (e.nativeEvent.isComposing) return;
    if (e.shiftKey) return;
    e.preventDefault();
    submit();
  }

  return (
    <div className="border-t border-[var(--color-apple-hairline)] px-4 py-3">
      <div className="flex items-end gap-2 rounded-[14px] border border-[var(--color-apple-hairline)] bg-white px-3 py-2 focus-within:border-[var(--color-apple-action)]">
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            // 자동 높이 — 최대 6줄
            const ta = e.currentTarget;
            ta.style.height = "auto";
            ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
          }}
          onKeyDown={handleKey}
          disabled={disabled}
          placeholder="이 자료에 대해 물어보기…"
          rows={1}
          maxLength={4000}
          className="min-h-[24px] flex-1 resize-none bg-transparent text-[14px] leading-[1.5] text-[var(--color-apple-ink)] outline-none placeholder:text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !text.trim()}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-apple-ink)] text-white transition-opacity hover:opacity-90 disabled:opacity-30"
          aria-label="전송"
        >
          ↑
        </button>
      </div>
      <p
        className="mt-1.5 px-1 text-[10.5px] wght-450 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        이 답은 학습 보조용이에요. 본인이 직접 확인·정리해야 진짜 본인 것이 돼요.
      </p>
    </div>
  );
}
