"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Anchor 좌표에 떠 있는 popover. macOS 캘린더의 "새 이벤트 / 일정 상세" popover 톤.
 *
 * 사용 의도:
 *  - 클릭한 셀이나 칩의 DOMRect를 받아 그 옆에 자리 잡는다.
 *  - 화면 가장자리에 닿으면 자연스럽게 반대편으로 뒤집힌다.
 *  - 백드롭 X — 외부 클릭/ESC만으로 닫힘 (캘린더 그리드는 계속 클릭 가능).
 *
 * generic shadcn 모달 톤이 싫다는 사용자 피드백을 받아, DESIGN.md §10에 박은
 * "큰 가운데 모달 + 헤더 + X" 패턴을 의도적으로 피한다.
 */
export function Popover({
  open,
  anchorRect,
  onClose,
  children,
  width = 320,
  className,
}: {
  open: boolean;
  /** 기준이 되는 DOM의 viewport 좌표 (getBoundingClientRect 결과) */
  anchorRect: DOMRect | null;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; arrow: "left" | "right" } | null>(
    null,
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Anchor가 바뀌거나 창 크기가 바뀔 때 위치 재계산
  useLayoutEffect(() => {
    if (!open || !anchorRect) {
      setPos(null);
      return;
    }
    function compute() {
      if (!anchorRect) return;
      const panel = panelRef.current;
      const panelHeight = panel?.offsetHeight ?? 280;
      const margin = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // 기본: 오른쪽에 띄움. 공간 부족하면 왼쪽으로 flip.
      let left = anchorRect.right + margin;
      let arrow: "left" | "right" = "left";
      if (left + width + margin > vw) {
        left = anchorRect.left - width - margin;
        arrow = "right";
        if (left < margin) {
          // 양쪽 다 부족 — 화면 가운데에 정렬
          left = Math.max(margin, (vw - width) / 2);
          arrow = "left";
        }
      }

      // 세로: anchor 중심에 panel 중심 맞춤. viewport 안에 clamp.
      let top = anchorRect.top + anchorRect.height / 2 - panelHeight / 2;
      if (top + panelHeight + margin > vh) top = vh - panelHeight - margin;
      if (top < margin) top = margin;

      setPos({ top, left, arrow });
    }
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [open, anchorRect, width]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onClick(e: MouseEvent) {
      const panel = panelRef.current;
      if (!panel) return;
      if (panel.contains(e.target as Node)) return;
      // anchor 자체 클릭은 부모가 처리하게 무시 (close까지 가지 않음)
      onClose();
    }
    window.addEventListener("keydown", onKey);
    // 다음 tick에 등록 — 같은 클릭이 open 만들고 onClick으로 close되는 race 방지
    const id = setTimeout(() => window.addEventListener("mousedown", onClick), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
      clearTimeout(id);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  // 모바일은 화면 폭에 맞춰 max-w로 — viewport 안에 자연스럽게.
  const isNarrow = typeof window !== "undefined" && window.innerWidth < 640;
  const finalLeft = isNarrow ? Math.max(8, (window.innerWidth - Math.min(width, window.innerWidth - 16)) / 2) : pos?.left ?? -9999;
  const finalTop = isNarrow ? Math.max(8, (pos?.top ?? 60)) : pos?.top ?? -9999;
  const finalWidth = isNarrow ? Math.min(width, window.innerWidth - 16) : width;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      className={`fixed z-50 overflow-hidden rounded-[14px] bg-white shadow-[0_12px_32px_rgba(0,0,0,0.12),0_2px_6px_rgba(0,0,0,0.06)] ${className ?? ""}`}
      style={{
        top: finalTop,
        left: finalLeft,
        width: finalWidth,
        opacity: pos ? 1 : 0,
        transform: pos ? "translateY(0) scale(1)" : "translateY(-4px) scale(0.98)",
        transition: "opacity 140ms ease-out, transform 140ms ease-out",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
