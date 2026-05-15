"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * 가벼운 모달 — Linear/Notion 톤.
 * - ESC로 닫기
 * - 외부 클릭 닫기
 * - body scroll lock
 * - 첫 인터랙티브 요소에 포커스
 * - Reduced motion 존중 (globals.css의 prefers-reduced-motion 처리됨)
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: "md" | "lg";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    // body scroll lock
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // focus — autoFocus 있는 요소가 있으면 그대로 두고, 없을 때만 첫 입력칸에 포커스.
    // (이전: 헤더 닫기 버튼이 DOM상 input보다 먼저라 50ms 후 닫기로 튐 → 사용자 입력 끊김)
    setTimeout(() => {
      const root = panelRef.current;
      if (!root) return;
      // 이미 패널 안에 포커스가 있으면 (autoFocus든 사용자 클릭이든) 건드리지 않음
      if (root.contains(document.activeElement)) return;
      // 입력 우선 → 없으면 첫 인터랙티브 (단, 헤더 닫기 버튼은 제외)
      const firstInput = root.querySelector<HTMLElement>("input, textarea, select");
      if (firstInput) {
        firstInput.focus();
        return;
      }
      const firstButton = root.querySelector<HTMLElement>(
        'button:not([disabled]):not([aria-label="닫기"])',
      );
      firstButton?.focus();
    }, 50);

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const dialog = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      aria-describedby={description ? "modal-description" : undefined}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--color-apple-ink)]/30 backdrop-blur-[2px] fade-up"
      />

      {/* Panel — 항상 화면 중앙 */}
      <div
        ref={panelRef}
        className={cn(
          "relative w-full max-h-[90vh] rounded-2xl bg-white shadow-[var(--shadow-lift)] fade-up sm:max-h-[85vh]",
          size === "md" && "sm:max-w-[560px]",
          size === "lg" && "sm:max-w-[680px]",
        )}
      >
        {/* Header */}
        <div className="flex items-baseline justify-between gap-4 border-b border-[var(--color-apple-hairline)] px-5 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0 flex-1">
            <h2
              id="modal-title"
              className="text-[16px] wght-700 text-[var(--color-apple-ink)] sm:text-[17px]"
            >
              {title}
            </h2>
            {description && (
              <p
                id="modal-description"
                className="mt-0.5 truncate text-[12px] wght-450 text-[var(--color-apple-muted)]"
              >
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="shrink-0 rounded-md p-1 text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M3.5 3.5l9 9M12.5 3.5l-9 9"
                stroke="currentColor"
                strokeWidth={1.4}
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Body — 자체 스크롤 */}
        <div
          className="overflow-y-auto overscroll-contain px-5 py-5 sm:px-6 sm:py-6"
          style={{ maxHeight: "calc(85vh - 64px)" }}
        >
          {children}
        </div>
      </div>
    </div>
  );

  // document.body로 portal — main 스크롤 컨테이너에서 빠져나와 viewport 정중앙
  return createPortal(dialog, document.body);
}
