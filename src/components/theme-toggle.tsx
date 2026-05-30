"use client";

import { useEffect, useState } from "react";

/**
 * 다크/라이트 토글 — 랜딩 전용.
 *
 * - localStorage("arch-theme")에 "dark" 또는 "light" 저장.
 * - layout.tsx inline script가 hydration 전에 dataset.theme을 설정해서 first paint 깜빡 없음.
 * - 이 컴포넌트는 mount 후 dataset 값을 읽어 state 동기화.
 *
 * 작동 범위: html[data-theme="dark"] 셀렉터가 globals.css의 다크 토큰 블록 활성화.
 * 다른 페이지(/dashboard 등)에서는 dataset이 박혀 있어도 각 페이지 컴포넌트가
 * 라이트 톤 가정으로 짜여 있어 약간 어색할 수 있음 — PR1 범위는 랜딩만.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    setTheme(current);
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (next === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("arch-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("arch-theme", "light");
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
      className={`spring-press inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-landing-hairline)] bg-[var(--color-landing-card)] text-[var(--color-landing-text-muted)] backdrop-blur-md transition-colors hover:text-[var(--color-landing-text-strong)] ${className}`}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 2v2M12 20v2M4 12H2M22 12h-2M5.6 5.6L4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4L4.2 19.8M19.8 4.2l-1.4 1.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 14.4A8 8 0 0 1 9.6 4a8 8 0 1 0 10.4 10.4z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
