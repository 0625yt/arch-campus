"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
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
  chromeless = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  /**
   * chromeless: header(타이틀·description·X 버튼) 안 그림.
   * macOS 새 이벤트 popover처럼 panel 안 콘텐츠가 곧 헤더 역할.
   * 호출자는 자체 닫기 액션(ESC·외부 클릭)에 의존.
   */
  chromeless?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusableSelector = [
      'a[href]:not([tabindex="-1"])',
      'button:not([disabled]):not([tabindex="-1"])',
      'input:not([disabled]):not([tabindex="-1"])',
      'select:not([disabled]):not([tabindex="-1"])',
      'textarea:not([disabled]):not([tabindex="-1"])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const root = panelRef.current;
      if (!root) return;
      const focusable = Array.from(root.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => element.offsetParent !== null,
      );
      if (focusable.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);

    // body scroll lock
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // focus — autoFocus 있는 요소가 있으면 그대로 두고, 없을 때만 첫 입력칸에 포커스.
    // (이전: 헤더 닫기 버튼이 DOM상 input보다 먼저라 50ms 후 닫기로 튐 → 사용자 입력 끊김)
    const focusTimer = window.setTimeout(() => {
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
      (firstButton ?? root).focus();
    }, 50);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      const previousFocus = previousFocusRef.current;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open || !mounted) return null;

  const dialog = (
    <div
      // 모바일(< sm): bottom 정렬 + edge-to-edge → bottom sheet 톤. 작은 폭에서 패딩이 카드 안쪽까지 잡아먹는 문제 해소.
      // sm+: 중앙 정렬 + 패딩 유지.
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-[var(--color-apple-ink)]/30 backdrop-blur-[2px] fade-up"
      />

      {/* Panel — 모바일 bottom sheet (상단 코너만 둥글게) / sm+ 중앙 카드 */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={chromeless ? undefined : titleId}
        aria-label={chromeless ? title : undefined}
        aria-describedby={!chromeless && description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          // pb-safe로 iOS 홈 인디케이터 영역 보호. max-h는 모바일에서 더 여유 있게(키보드 떴을 때 대비).
          "relative w-full max-h-[92vh] rounded-t-[20px] bg-white shadow-[var(--shadow-lift)] fade-up",
          "sm:max-h-[85vh] sm:rounded-2xl",
          "pb-[env(safe-area-inset-bottom)] sm:pb-0",
          size === "sm" && "sm:max-w-[440px]",
          size === "md" && "sm:max-w-[560px]",
          size === "lg" && "sm:max-w-[680px]",
        )}
      >
        {chromeless ? (
          // chromeless — 헤더 없이 body 영역만. 콘텐츠가 곧 헤더 역할.
          // macOS Calendar 새 이벤트 popover처럼 grain 없는 단일 표면.
          <div className="overflow-y-auto overscroll-contain" style={{ maxHeight: "85vh" }}>
            {children}
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-baseline justify-between gap-4 border-b border-[var(--color-apple-hairline)] px-5 py-4 sm:px-6 sm:py-5">
              <div className="min-w-0 flex-1">
                <h2
                  id={titleId}
                  className="text-[16px] wght-700 text-[var(--color-apple-ink)] sm:text-[17px]"
                >
                  {title}
                </h2>
                {description && (
                  <p
                    id={descriptionId}
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
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)] sm:h-9 sm:w-9"
              >
                <X aria-hidden size={18} strokeWidth={1.8} />
              </button>
            </div>

            {/* Body — 자체 스크롤 */}
            <div
              className="overflow-y-auto overscroll-contain px-5 py-5 sm:px-6 sm:py-6"
              style={{ maxHeight: "calc(85vh - 64px)" }}
            >
              {children}
            </div>
          </>
        )}
      </div>
    </div>
  );

  // document.body로 portal — main 스크롤 컨테이너에서 빠져나와 viewport 정중앙
  return createPortal(dialog, document.body);
}
