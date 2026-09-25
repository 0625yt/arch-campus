"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { keyedItems } from "@/lib/keyed-items";

export interface ContextMenuItem {
  /** "---" 한 줄이면 separator (group divider) */
  label: string;
  onClick?: () => void;
  destructive?: boolean;
  /** 옵셔널 disabled — false 회색 + 클릭 무시 */
  disabled?: boolean;
  /** 좌측 아이콘 — 14×14 권장 (HIG menu list 톤) */
  icon?: React.ReactNode;
  /** 우측 키 hint — "⌘E" 같은 단축키 */
  shortcut?: string;
}

/** Separator item — items 배열에 그냥 SEP 박으면 1px hairline divider */
export const SEP: ContextMenuItem = { label: "---" };

interface Position {
  x: number;
  y: number;
}

/**
 * 데스크톱 우클릭 + 모바일 long-press 컨텍스트 메뉴.
 *
 * 사용 패턴:
 *   const ctx = useContextMenu();
 *   <div {...ctx.bind}>...</div>
 *   <ContextMenu state={ctx.state} onClose={ctx.close} items={[...]} />
 *
 * 디자인:
 *   - portal로 body에 띄움 (부모 overflow·sticky에 안 갇히게)
 *   - 화면 오른쪽/아래 잘리면 자동으로 좌/위로 뒤집기
 *   - ESC·외부 클릭·스크롤 시 닫기
 *   - 모바일은 touchstart 500ms 유지 → 메뉴, 그 사이 움직이면 취소
 */

export interface ContextMenuState {
  open: boolean;
  pos: Position;
}

export interface UseContextMenuReturn {
  state: ContextMenuState;
  close: () => void;
  /** 프로그래매틱하게 메뉴 열기 — ⋯ 버튼 좌클릭 등 우클릭 외 트리거용. */
  openAt: (pos: Position) => void;
  bind: {
    onContextMenu: (e: React.MouseEvent) => void;
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
    onTouchMove: () => void;
  };
}

export function useContextMenu(): UseContextMenuReturn {
  const [state, setState] = useState<ContextMenuState>({ open: false, pos: { x: 0, y: 0 } });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function open(pos: Position) {
    setState({ open: true, pos });
  }
  function close() {
    setState((s) => ({ ...s, open: false }));
  }

  function clearLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  return {
    state,
    close,
    openAt: open,
    bind: {
      onContextMenu: (e) => {
        e.preventDefault();
        e.stopPropagation();
        open({ x: e.clientX, y: e.clientY });
      },
      onTouchStart: (e) => {
        clearLongPress();
        const t = e.touches[0];
        if (!t) return;
        const x = t.clientX;
        const y = t.clientY;
        longPressTimer.current = setTimeout(() => {
          // 진동 피드백 — 지원 안 하면 무시
          try {
            navigator.vibrate?.(8);
          } catch {
            /* noop */
          }
          open({ x, y });
        }, 500);
      },
      onTouchEnd: () => clearLongPress(),
      onTouchMove: () => clearLongPress(),
    },
  };
}

export function ContextMenu({
  state,
  onClose,
  items,
}: {
  state: ContextMenuState;
  onClose: () => void;
  items: ContextMenuItem[];
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState<Position | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 화면 경계 안으로 자동 조정
  useEffect(() => {
    if (!state.open) {
      setAdjustedPos(null);
      return;
    }
    // 다음 프레임에 menu 크기 측정 후 위치 조정
    const id = requestAnimationFrame(() => {
      if (!menuRef.current) return;
      const rect = menuRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const margin = 8;
      let x = state.pos.x;
      let y = state.pos.y;
      if (x + rect.width > vw - margin) x = vw - rect.width - margin;
      if (y + rect.height > vh - margin) y = vh - rect.height - margin;
      x = Math.max(margin, x);
      y = Math.max(margin, y);
      setAdjustedPos({ x, y });
    });
    return () => cancelAnimationFrame(id);
  }, [state.open, state.pos.x, state.pos.y]);

  // 외부 click·ESC·scroll 닫기
  useEffect(() => {
    if (!state.open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    }
    function onScroll() {
      onClose();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [state.open, onClose]);

  if (!mounted || !state.open) return null;

  const pos = adjustedPos ?? state.pos;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      data-glass
      // 측정 전엔 화면 밖에 두고, 측정 끝나면 제자리로 — 깜빡임 방지
      style={{
        position: "fixed",
        top: pos.y,
        left: pos.x,
        opacity: adjustedPos ? 1 : 0,
        pointerEvents: adjustedPos ? "auto" : "none",
        transformOrigin: "top left",
        animation: adjustedPos ? "ctxmenu-pop 160ms cubic-bezier(0.16, 1, 0.3, 1) both" : undefined,
      }}
      className="z-[100] min-w-[180px] overflow-hidden rounded-[12px] border border-[var(--color-apple-hairline-soft)] bg-white/92 p-1 shadow-[0_8px_28px_-6px_rgba(0,0,0,0.18),0_2px_6px_-2px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.6)] backdrop-blur-xl backdrop-saturate-150"
      onContextMenu={(e) => e.preventDefault()}
    >
      {keyedItems(items).map(({ item: it, key }) => {
        // Separator
        if (it.label === "---") {
          return (
            <hr key={key} aria-hidden className="my-1 h-px bg-[var(--color-apple-hairline-soft)]" />
          );
        }
        return (
          <button
            key={key}
            type="button"
            role="menuitem"
            onClick={() => {
              if (it.disabled || !it.onClick) return;
              onClose();
              it.onClick();
            }}
            disabled={it.disabled}
            className={
              it.disabled
                ? "flex w-full cursor-not-allowed items-center gap-2.5 rounded-[8px] px-2.5 py-1.5 text-left text-[12.5px] wght-450 text-[var(--color-apple-muted)] opacity-55"
                : it.destructive
                  ? "flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-1.5 text-left text-[12.5px] wght-560 text-[var(--color-apple-coral)] transition-colors hover:bg-[var(--color-apple-coral)] hover:text-white"
                  : "flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-1.5 text-left text-[12.5px] wght-450 text-[var(--color-apple-ink)] transition-colors hover:bg-[var(--color-apple-action)] hover:text-white"
            }
          >
            {it.icon && (
              <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                {it.icon}
              </span>
            )}
            <span className="flex-1 truncate">{it.label}</span>
            {it.shortcut && (
              <span className="shrink-0 text-[11px] wght-450 tabular-nums opacity-70">
                {it.shortcut}
              </span>
            )}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
