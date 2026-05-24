"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

/**
 * tools 메인의 1급 진입 카드.
 *
 * 캘린더 AiEntryCard와 동일한 톤 (typing placeholder + gradient glow + 예시 칩).
 * 차이:
 *   - 실제 입력 가능 (input). 엔터·우측 화살표 누르면 /dashboard/chat?q=... 로 이동.
 *   - 헤드라인은 "어떤 게 막혀 있어요?" — tools 카피와 결 맞춤 (학생이 정확히 무엇이 막혔는지 단어로 표현하면 그게 곧 입력).
 *
 * 디자인 가드 (DESIGN.md §10):
 *   - 좌측 동그라미 점 X — Sparkles SVG icon
 *   - 마침표 카피 남발 X — "어떤 게 막혀 있어요?" 한 줄
 *   - 학습 보조 워터마크는 위저드 결과물의 책임이라 카드엔 안 박음
 */

const PROMPTS = [
  "내일 발표인데 첫 장이 안 잡혀",
  "리포트 주제는 정했는데 목차가 막혀",
  "시험까지 3시간 남았는데 뭐부터 봐야 해",
  "팀플 회의 했는데 합의록이 흩어졌어",
] as const;

const CHIPS = [
  "리포트 목차 잡아줘",
  "벼락치기 계획",
  "발표 예상질문",
] as const;

export function ToolsEntryCard() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [typed, setTyped] = useState("");
  const [promptIdx, setPromptIdx] = useState(0);
  const [phase, setPhase] = useState<"typing" | "hold" | "deleting">("typing");

  // 타이핑 애니메이션 — 사용자가 입력하지 않은 동안만 동작. 입력 시작하면 placeholder 안 보임.
  useEffect(() => {
    if (value.length > 0) return;
    const current = PROMPTS[promptIdx];
    if (phase === "typing") {
      if (typed.length < current.length) {
        const t = setTimeout(() => setTyped(current.slice(0, typed.length + 1)), 55);
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => setPhase("hold"), 1400);
      return () => clearTimeout(t);
    }
    if (phase === "hold") {
      const t = setTimeout(() => setPhase("deleting"), 0);
      return () => clearTimeout(t);
    }
    if (typed.length > 0) {
      const t = setTimeout(() => setTyped(typed.slice(0, -1)), 24);
      return () => clearTimeout(t);
    }
    setPromptIdx((i) => (i + 1) % PROMPTS.length);
    setPhase("typing");
  }, [typed, phase, promptIdx, value]);

  function submit(q: string) {
    const trimmed = q.trim();
    if (!trimmed) {
      inputRef.current?.focus();
      return;
    }
    router.push(`/dashboard/chat?q=${encodeURIComponent(trimmed)}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit(value);
    }
  }

  /**
   * 카드 전체 클릭 — placeholder 애니메이션 보고 "이거 누르면 챗으로 가나?" 기대.
   *
   * 정책:
   *   - 입력 있으면 그 입력으로 챗 이동 (submit)
   *   - 입력 비었으면 빈 챗 페이지로 이동 — placeholder 문구를 자동 send하지 X.
   *     (사용자가 placeholder를 의도된 질문으로 본 게 아니라 안내 텍스트로만 보는 경우가 더 많음)
   *
   * input·버튼 자체 클릭은 stopPropagation으로 이중 발화 방지.
   */
  function onCardClick() {
    if (value.length > 0) {
      submit(value);
      return;
    }
    router.push("/dashboard/chat");
  }

  const showTyping = value.length === 0;

  return (
    <div className="relative">
      {/* 그라데이션 글로우 — focus·hover 시 강해짐 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-[16px] opacity-50 blur-xl transition-opacity duration-500"
        style={{
          background:
            "linear-gradient(120deg, color-mix(in oklab, var(--color-apple-action) 22%, transparent), color-mix(in oklab, #a08bc4 18%, transparent), color-mix(in oklab, #7fb38c 14%, transparent))",
        }}
      />
      <div
        onClick={onCardClick}
        role="button"
        tabIndex={-1}
        className="group/card relative flex w-full cursor-pointer items-center gap-3.5 overflow-hidden rounded-[14px] border border-[var(--color-apple-hairline)] bg-white px-4 py-3.5 transition-all duration-200 focus-within:-translate-y-px focus-within:border-[var(--color-apple-action)]/40 focus-within:shadow-[0_8px_24px_-12px_rgba(0,113,227,0.22)] hover:-translate-y-px hover:border-[var(--color-apple-action)]/35 hover:shadow-[0_8px_24px_-12px_rgba(0,113,227,0.18)] sm:px-5 sm:py-4"
      >
        {/* 아이콘 — 컬러 그라데이션 원형. Sparkles */}
        <span
          aria-hidden
          className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white shadow-[0_2px_8px_-2px_rgba(0,113,227,0.4)]"
          style={{
            background:
              "linear-gradient(135deg, var(--color-apple-action) 0%, #7aa6d6 60%, #a08bc4 100%)",
          }}
        >
          <Sparkles className="h-[15px] w-[15px]" strokeWidth={2.2} />
        </span>

        {/* 본문 — 헤드라인 + 입력 input. 입력 빈 동안만 타이프 애니메이션 노출. */}
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
              onKeyDown={onKeyDown}
              onClick={(e) => e.stopPropagation()}
              maxLength={200}
              aria-label="막힌 상황을 적으면 도구를 추천해드려요"
              className="w-full border-0 bg-transparent p-0 text-[12.5px] wght-450 text-[var(--color-apple-ink)] outline-none sm:text-[13px]"
              style={{ letterSpacing: "-0.012em" }}
            />
            {showTyping && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 truncate text-[12.5px] wght-450 text-[var(--color-apple-muted)] sm:text-[13px]"
                style={{ letterSpacing: "-0.012em" }}
              >
                {typed}
                <span className="ml-px inline-block h-[12px] w-[1.5px] -translate-y-[1px] animate-pulse bg-[var(--color-apple-muted)] align-middle" />
              </span>
            )}
          </div>
        </div>

        {/* 우측 화살표 — 클릭하면 submit */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            submit(value);
          }}
          aria-label="채팅으로 보내기"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-apple-muted)] transition-all duration-200 hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-action)]"
        >
          <svg
            aria-hidden
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            className="transition-transform duration-200 group-hover/card:translate-x-0.5"
          >
            <path
              d="M5 12h14M13 6l6 6-6 6"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* 예시 칩 — 학생이 "이런 식으로 적으면 되는구나" 학습용 */}
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
            className="rounded-full border border-[var(--color-apple-hairline)] bg-white px-2.5 py-1 text-[11.5px] wght-450 text-[var(--color-apple-muted)] transition-all hover:-translate-y-px hover:border-[var(--color-apple-action)]/30 hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)] hover:shadow-[0_2px_8px_-4px_rgba(0,0,0,0.1)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}
