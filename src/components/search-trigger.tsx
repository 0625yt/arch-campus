"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Cmd+K 팔레트 진입 버튼.
 * 실제 팔레트는 layout 레벨에서 글로벌 단축키로 열림.
 * 이 버튼은 키보드를 모르는 사용자를 위한 보조 진입점.
 *
 * 두 variant:
 * - sidebar — 사이드바 안쪽에 들어가는 input 형태 (placeholder + ⌘K)
 * - icon    — 모바일 상단바용 아이콘만
 */
export function SearchTrigger({
  variant = "sidebar",
  className,
}: {
  variant?: "sidebar" | "icon";
  className?: string;
}) {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(/Mac|iPod|iPhone|iPad/.test(navigator.platform));
  }, []);

  const open = () => {
    // 글로벌 ⌘K 핸들러를 트리거하기 위한 합성 이벤트
    const ev = new KeyboardEvent("keydown", {
      key: "k",
      code: "KeyK",
      metaKey: isMac,
      ctrlKey: !isMac,
      bubbles: true,
    });
    window.dispatchEvent(ev);
  };

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={open}
        aria-label="검색 (⌘K)"
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-md text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)]",
          className,
        )}
      >
        <SearchIcon />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      className={cn(
        "group flex w-full items-center gap-2 rounded-md border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2 text-left transition-colors hover:border-[var(--color-line-strong)]",
        className,
      )}
    >
      <SearchIcon />
      <span className="flex-1 text-[12px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
        검색하거나 어디로 갈지
      </span>
      <span className="hidden items-center gap-0.5 text-[9.5px] wght-700 kerning-mono text-[var(--color-fg-subtle)] sm:inline-flex">
        <kbd className="inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-[3px] border border-[var(--color-line-strong)] bg-[var(--color-bg)] px-1 wght-700 text-[var(--color-fg-muted)]">
          {isMac ? "⌘" : "Ctrl"}
        </kbd>
        <kbd className="inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-[3px] border border-[var(--color-line-strong)] bg-[var(--color-bg)] px-1 wght-700 text-[var(--color-fg-muted)]">
          K
        </kbd>
      </span>
    </button>
  );
}

function SearchIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <circle
        cx="6"
        cy="6"
        r="4"
        stroke="currentColor"
        strokeWidth={1.3}
      />
      <path
        d="M9.3 9.3L12 12"
        stroke="currentColor"
        strokeWidth={1.3}
        strokeLinecap="round"
      />
    </svg>
  );
}
