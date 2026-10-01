"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** The same command palette is reachable by mouse, touch, and keyboard. */
export function SearchTrigger({
  variant = "sidebar",
  className,
}: {
  variant?: "sidebar" | "icon" | "compact";
  className?: string;
}) {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(/Mac|iPod|iPhone|iPad/.test(navigator.platform));
  }, []);

  const shortcut = isMac ? "⌘K" : "Ctrl+K";
  const open = () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        code: "KeyK",
        metaKey: isMac,
        ctrlKey: !isMac,
        bubbles: true,
      }),
    );
  };

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={open}
        aria-label={`검색 (${shortcut})`}
        className={cn(
          "inline-flex h-11 w-11 items-center justify-center rounded-[9px] text-fg-muted transition-colors hover:bg-surface-strong hover:text-fg",
          className,
        )}
      >
        <Search aria-hidden size={18} strokeWidth={1.7} />
      </button>
    );
  }

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={open}
        aria-label={`검색 (${shortcut})`}
        className={cn(
          "inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-[9px] px-2.5 text-fg-muted transition-colors hover:bg-surface-strong hover:text-fg xl:border xl:border-line xl:px-3",
          className,
        )}
      >
        <Search aria-hidden size={17} strokeWidth={1.7} />
        <span className="hidden text-[12px] wght-560 xl:inline">검색</span>
        <kbd aria-hidden className="ml-3 hidden text-[10px] wght-450 text-fg-muted xl:inline">
          {shortcut}
        </kbd>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      aria-label={`검색 (${shortcut})`}
      className={cn(
        "group flex min-h-11 w-full items-center gap-2 rounded-[9px] border border-line bg-surface px-3 py-2 text-left transition-colors hover:bg-surface-strong",
        className,
      )}
    >
      <Search aria-hidden size={16} strokeWidth={1.7} className="shrink-0 text-fg-muted" />
      <span className="flex-1 text-[12.5px] wght-450 text-fg-muted">자료와 페이지 검색</span>
      <kbd
        aria-hidden
        className="hidden rounded-[4px] border border-line bg-bg px-1.5 py-0.5 text-[10px] wght-560 text-fg-muted sm:inline-flex"
      >
        {shortcut}
      </kbd>
    </button>
  );
}
