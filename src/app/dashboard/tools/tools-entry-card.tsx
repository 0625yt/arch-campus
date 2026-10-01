"use client";

import { ArrowRight, MessageCircleMore } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

/**
 * tools 메인의 1급 진입 카드.
 *
 * tools 메인의 command field.
 * 반짝이·타이핑 placeholder·컬러 glow를 걷어내고, 실제 작업 입력 필드처럼 조용하게 둔다.
 */

const CHIPS = ["리포트 목차 잡아줘", "벼락치기 계획", "발표 예상질문"] as const;

export function ToolsEntryCard() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");

  function submit(q: string) {
    const trimmed = q.trim();
    if (!trimmed) {
      inputRef.current?.focus();
      return;
    }
    router.push(`/dashboard/chat?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="relative">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
        className="native-card group/card relative flex w-full items-center gap-3.5 px-4 py-3.5 focus-within:border-[var(--color-apple-action)]/40 sm:px-5 sm:py-4"
      >
        <span
          aria-hidden
          className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--color-apple-hairline-soft)] bg-[var(--color-apple-pearl)] text-[var(--color-apple-muted)]"
        >
          <MessageCircleMore className="h-[15px] w-[15px]" strokeWidth={1.8} />
        </span>

        <div className="flex min-w-0 flex-1 flex-col">
          <span
            className="text-[13px] wght-620 text-[var(--color-apple-ink)] sm:text-[13.5px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            어떤 게 막혀 있어요?
          </span>
          <div className="relative mt-0.5">
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              maxLength={200}
              aria-label="막힌 상황을 적으면 도구를 추천해드려요"
              placeholder="예: 시험까지 3시간, 어디부터 볼지 모르겠어"
              className="w-full border-0 bg-transparent p-0 text-[12.5px] wght-450 text-[var(--color-apple-ink)] outline-none sm:text-[13px]"
              style={{ letterSpacing: "-0.012em" }}
            />
          </div>
        </div>

        <button
          type="submit"
          aria-label="채팅으로 보내기"
          className="-mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--color-apple-muted)] transition-all duration-200 hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-action)]"
        >
          <ArrowRight
            aria-hidden
            className="h-4 w-4 transition-transform duration-200 group-hover/card:translate-x-0.5"
            strokeWidth={1.7}
          />
        </button>
      </form>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span
          className="text-[11px] wght-560 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.006em" }}
        >
          예시
        </span>
        {CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => submit(chip)}
            className="native-chip min-h-9 px-2.5 py-1 text-[11.5px] wght-450"
            style={{ letterSpacing: "-0.012em" }}
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}
