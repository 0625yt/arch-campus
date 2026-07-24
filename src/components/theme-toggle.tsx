"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * 다크/라이트 토글.
 *
 * - localStorage("arch-theme")에 "dark" 또는 "light" 저장.
 * - layout.tsx inline script가 hydration 전에 dataset.theme을 설정해서 first paint 깜빡 없음.
 * - 이 컴포넌트는 mount 후 dataset 값을 읽어 state 동기화.
 *
 * 작동 범위: html[data-theme="dark"] 셀렉터가 globals.css의 다크 토큰 블록 활성화.
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
      className={`spring-press inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-apple-hairline-soft)] bg-[var(--color-apple-pearl)]/70 text-[var(--color-apple-muted)] backdrop-blur-md transition-colors hover:bg-[var(--color-surface-cream)] hover:text-[var(--color-apple-ink)] ${className}`}
    >
      {theme === "dark" ? (
        <Sun aria-hidden size={16} strokeWidth={1.7} />
      ) : (
        <Moon aria-hidden size={16} strokeWidth={1.7} />
      )}
    </button>
  );
}
