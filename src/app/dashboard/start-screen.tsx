"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Arrow, Dot } from "@/components/primitives";

const SUGGESTIONS: {
  label: string;
  hint: string;
  href: string;
  meta: string;
  dot?: string;
}[] = [
  {
    label: "오늘 마감 보기",
    hint: "지금 해야 할 것 한눈에",
    href: "/dashboard/today",
    meta: "Today",
  },
  {
    label: "발표 위저드 시작",
    hint: "5단계로 슬라이드·대본·질문",
    href: "/dashboard/tools/presentation",
    meta: "위저드",
  },
  {
    label: "운영체제 5주차로",
    hint: "프로세스 동기화 · 12문제 중 5문제",
    href: "/dashboard/study/운영체제/process-sync",
    meta: "자료",
    dot: "#7aa6d6",
  },
  {
    label: "강의계획서 올리기",
    hint: "학기 일정 자동 정리",
    href: "/dashboard/calendar",
    meta: "Calendar",
  },
];

const GREETINGS = [
  "오늘은 무엇부터 해볼까요",
  "어디서부터 시작해볼까요",
  "오늘은 어떤 공부를 도와드릴까요",
];

export function StartScreen() {
  const [greeting, setGreeting] = useState(GREETINGS[0]);
  const [isMac, setIsMac] = useState(false);

  // 메시지 + Mac 감지는 클라이언트에서만 — hydration 안전
  useEffect(() => {
    setGreeting(GREETINGS[Math.floor(Math.random() * GREETINGS.length)]);
    setIsMac(/Mac|iPod|iPhone|iPad/.test(navigator.platform));
  }, []);

  const openPalette = () => {
    const ev = new KeyboardEvent("keydown", {
      key: "k",
      code: "KeyK",
      metaKey: isMac,
      ctrlKey: !isMac,
      bubbles: true,
    });
    window.dispatchEvent(ev);
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
        강의·자료·위저드를 검색하거나, 아래 시작점에서 골라보세요
      </p>

      {/* 큰 검색창 */}
      <button
        type="button"
        onClick={openPalette}
        className="group mt-10 fade-up fade-up-2 flex w-full items-center gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-bg)] px-5 py-4 text-left shadow-[var(--shadow-soft)] transition-all duration-[var(--duration-base)] hover:-translate-y-px hover:border-[var(--color-line-strong)] hover:shadow-[var(--shadow-lift)]"
      >
        <SearchIcon />
        <span className="flex-1 text-[14px] wght-450 kerning-tight text-[var(--color-fg-subtle)] sm:text-[15px]">
          무엇이든 물어보세요. 강의·자료·위저드 검색이나 이동
        </span>
        <span
          suppressHydrationWarning
          className="hidden items-center gap-0.5 text-[10px] wght-700 kerning-mono text-[var(--color-fg-subtle)] sm:inline-flex"
        >
          <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-[var(--color-line-strong)] bg-[var(--color-bg)] px-1 text-[var(--color-fg-muted)]">
            {isMac ? "⌘" : "Ctrl"}
          </kbd>
          <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-[var(--color-line-strong)] bg-[var(--color-bg)] px-1 text-[var(--color-fg-muted)]">
            K
          </kbd>
        </span>
      </button>

      {/* 시작점 4개 */}
      <ul className="mt-10 fade-up fade-up-3 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <li key={s.label}>
            <Link
              href={s.href}
              className="group flex h-full items-baseline gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-bg)] px-4 py-3.5 transition-all duration-[var(--duration-base)] hover:-translate-y-px hover:border-[var(--color-line-strong)] hover:shadow-[var(--shadow-soft)]"
            >
              {s.dot ? (
                <Dot color={s.dot} size={6} className="translate-y-[-1px]" />
              ) : (
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full bg-[var(--color-fg-disabled)]"
                />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-baseline gap-2">
                  <h3 className="truncate text-[13.5px] wght-560 kerning-tight text-[var(--color-fg-strong)] sm:text-[14px]">
                    {s.label}
                  </h3>
                  <span className="shrink-0 text-[9.5px] wght-700 kerning-mono uppercase text-[var(--color-fg-subtle)]">
                    {s.meta}
                  </span>
                </div>
                <p className="truncate text-[11.5px] wght-450 kerning-tight text-[var(--color-fg-muted)]">
                  {s.hint}
                </p>
              </div>
              <Arrow className="reveal-right shrink-0 self-baseline text-[12px] text-[var(--color-fg-subtle)]" />
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-12 fade-up fade-up-4 text-center text-[11px] wght-380 kerning-tight text-[var(--color-fg-subtle)]">
        매일 아침 마감 알림을 받고 싶으면 알림을 켜주세요
      </p>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden
      className="shrink-0 text-[var(--color-fg-muted)]"
    >
      <circle cx="8" cy="8" r="5.2" stroke="currentColor" strokeWidth={1.4} />
      <path
        d="M12.4 12.4L16 16"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
      />
    </svg>
  );
}
