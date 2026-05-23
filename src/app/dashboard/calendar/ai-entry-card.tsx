"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

/**
 * AI 자연어 입력 진입 카드 — 캘린더 그리드 위 1급 자리.
 *
 * 디자인 가드:
 * - 이모지(✨) 금지 — lucide Sparkles SVG로 대체 (사용자 강요 2026-05-23: 이모지 촌스러움)
 * - 트렌디 톤: subtle gradient 보더 + 그라데이션 글로우 + 타이핑 애니메이션 placeholder
 * - placeholder는 회전이 아니라 글자 단위로 타이프돼 들어옴 (Linear·Vercel 새 이벤트 톤)
 * - 예시 칩 3개 — 누르면 모달 열림 (학생이 "이런 식으로 적으면 되는구나" 학습)
 * - 헤드라인: "말로 적으면 자동으로 정리돼요" (사용자 합의)
 *
 * 동작:
 * - 카드 누르면 onOpen() → AI 모달 열림
 * - 칩 누르면 onOpen() → 학생이 모달 안에서 보고 변형해서 적음 (prefill 안 함, 단순 학습)
 */

const PROMPTS = [
  "다음 주 화 3시 영어 과제",
  "5월 30일 알바 6시~10시",
  "다음 주 월 7시 동아리 회식",
  "기말고사 6월 9일 영어 20%",
] as const;

const CHIPS = ["다음 주 화 3시 영어 과제", "5/30 알바 6시~10시", "동아리 회식 다음 주 월 7시"] as const;

export function AiEntryCard({ onOpen }: { onOpen: () => void }) {
  const [typed, setTyped] = useState("");
  const [promptIdx, setPromptIdx] = useState(0);
  const [phase, setPhase] = useState<"typing" | "hold" | "deleting">("typing");

  // 타이핑 애니메이션 — 글자 단위로 들어오고 잠시 멈춘 뒤 지워지고 다음 prompt.
  useEffect(() => {
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
    // deleting
    if (typed.length > 0) {
      const t = setTimeout(() => setTyped(typed.slice(0, -1)), 24);
      return () => clearTimeout(t);
    }
    setPromptIdx((i) => (i + 1) % PROMPTS.length);
    setPhase("typing");
  }, [typed, phase, promptIdx]);

  return (
    <div className="relative mb-6">
      {/* 그라데이션 글로우 — 카드 뒤로 살짝 번지는 컬러. 호버 시 강해짐 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-[16px] opacity-60 blur-xl transition-opacity duration-500 group-hover/card:opacity-100"
        style={{
          background:
            "linear-gradient(120deg, color-mix(in oklab, var(--color-apple-action) 22%, transparent), color-mix(in oklab, #a08bc4 18%, transparent), color-mix(in oklab, #7fb38c 14%, transparent))",
        }}
      />
      <button
        type="button"
        onClick={onOpen}
        className="group/card relative flex w-full items-center gap-3.5 overflow-hidden rounded-[14px] border border-[var(--color-apple-hairline)] bg-white px-4 py-3.5 text-left transition-all duration-200 hover:-translate-y-px hover:border-[var(--color-apple-action)]/35 hover:shadow-[0_8px_24px_-12px_rgba(0,113,227,0.18)] sm:px-5 sm:py-4"
      >
        {/* 아이콘 — 컬러 그라데이션 동그라미. Sparkles SVG */}
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

        {/* 본문 — 헤드라인 한 줄 + 타이프 애니메이션 placeholder */}
        <span className="flex min-w-0 flex-1 flex-col">
          <span
            className="text-[13px] wght-620 text-[var(--color-apple-ink)] sm:text-[13.5px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            말로 적으면 자동으로 정리돼요
          </span>
          <span
            className="mt-0.5 truncate text-[12.5px] wght-450 text-[var(--color-apple-muted)] sm:text-[13px]"
            style={{ letterSpacing: "-0.012em" }}
            aria-live="polite"
          >
            {typed}
            <span
              aria-hidden
              className="ml-px inline-block h-[12px] w-[1.5px] -translate-y-[1px] animate-pulse bg-[var(--color-apple-muted)] align-middle"
            />
          </span>
        </span>

        {/* 우측 chevron — 트렌디 화살표 (lucide ArrowRight 대신 SVG inline, 클릭 어포던스) */}
        <svg
          aria-hidden
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          className="shrink-0 text-[var(--color-apple-muted)] transition-all duration-200 group-hover/card:translate-x-0.5 group-hover/card:text-[var(--color-apple-action)]"
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

      {/* 예시 칩 — 학생이 "이런 식으로 적으면 되는구나" 학습용. 누르면 모달 열림 */}
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
            onClick={onOpen}
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
