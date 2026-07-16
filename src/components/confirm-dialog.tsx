"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "./modal";

/**
 * Confirm dialog — Apple HIG Alerts 패턴.
 *
 * 가이드 요약 (HIG):
 *   - 제목은 직접·중립·친근한 한 문장 (두 줄 안)
 *   - 행 배열: Cancel 좌측, primary 우측 (default focus)
 *   - Primary는 capsule + borderedProminent (검정 ink / destructive 시 systemRed)
 *   - Cancel은 plain text (borderless)
 *   - destructive 액션은 "삭제" 같은 구체 동사로
 *   - hit region 44pt
 *
 * 인터랙션:
 *   - Enter → confirm (default), Escape → cancel
 *   - busy 중에는 Modal 닫힘·backdrop·키보드 다 잠금
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "확인",
  cancelLabel = "취소",
  destructive = false,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
  /** 옵션 — 본문 추가 위젯 (scope 토글 같은 것) */
  children?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // 열리면 primary에 default focus (Enter 키로 즉시 진행)
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => confirmRef.current?.focus(), 40);
      return () => clearTimeout(t);
    }
  }, [open]);

  async function handleConfirm() {
    if (busy) return;
    try {
      setBusy(true);
      await Promise.resolve(onConfirm());
    } finally {
      setBusy(false);
    }
  }

  // Enter = confirm. 단 textarea·input 안에서는 무시.
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    const t = e.target as HTMLElement;
    if (t.tagName === "TEXTAREA" || t.tagName === "INPUT") return;
    e.preventDefault();
    handleConfirm();
  }

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={title}>
      <div className="flex flex-col gap-5" onKeyDown={handleKeyDown}>
        {description && (
          <p
            className="whitespace-pre-wrap text-[14px] wght-450 leading-[1.55] text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.011em" }}
          >
            {description}
          </p>
        )}

        {children}

        {/*
          HIG 배치: Cancel 좌측 · Primary 우측.
          모바일은 stack(상단=primary), 데스크톱은 row(우측=primary).
          모바일 한 손 사용 시 primary가 위에 와야 엄지 닿기 좋음.
        */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex min-h-[44px] items-center justify-center rounded-full px-5 text-[13.5px] wght-560 text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)] disabled:opacity-50 sm:min-h-[36px]"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className={
              destructive
                ? "inline-flex min-h-[44px] items-center justify-center rounded-full bg-[var(--color-apple-coral)] px-5 text-[13.5px] wght-620 text-white shadow-[0_1px_2px_color-mix(in_srgb,var(--color-apple-coral)_18%,transparent),inset_0_1px_0_rgba(255,255,255,0.18)] transition-all hover:-translate-y-px hover:shadow-[0_4px_12px_-2px_color-mix(in_srgb,var(--color-apple-coral)_35%,transparent)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:transform-none sm:min-h-[36px]"
                : "inline-flex min-h-[44px] items-center justify-center rounded-full bg-[var(--color-apple-ink)] px-5 text-[13.5px] wght-620 text-white shadow-[0_1px_2px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.18)] transition-all hover:-translate-y-px hover:shadow-[0_4px_12px_-2px_rgba(0,0,0,0.28)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:transform-none sm:min-h-[36px]"
            }
          >
            {busy ? "진행 중…" : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
