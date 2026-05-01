"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { SidebarBody } from "@/components/sidebar";

/**
 * 모바일 햄버거 — 좌상단에 박혀있고 클릭 시 좌측에서 슬라이드인.
 * 데스크톱(md+)에서는 hidden.
 */
export function MobileDrawer() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // body scroll lock + ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="메뉴 열기"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)] md:hidden"
      >
        <HamburgerIcon />
      </button>

      {mounted && open
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label="메뉴"
              className="fixed inset-0 z-[55] flex md:hidden"
            >
              {/* Backdrop */}
              <button
                type="button"
                aria-label="메뉴 닫기"
                onClick={() => setOpen(false)}
                tabIndex={-1}
                className={cn(
                  "absolute inset-0 bg-[var(--color-fg-strong)]/30 backdrop-blur-[2px]",
                  "fade-up",
                )}
              />

              {/* Panel — 좌측 슬라이드인 */}
              <aside
                className={cn(
                  "relative h-full w-[260px] max-w-[80vw] border-r border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-lift)]",
                  "fade-up",
                )}
                style={{ animation: "slide-in-left 280ms var(--ease-out) both" }}
              >
                <SidebarBody onNavigate={() => setOpen(false)} />
              </aside>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function HamburgerIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <path
        d="M3 5h12M3 9h12M3 13h12"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
      />
    </svg>
  );
}
