"use client";

import { useState } from "react";
import { Modal } from "./modal";

/**
 * 단순 확인 다이얼로그.
 *
 * onConfirm이 Promise면 처리되는 동안 버튼 비활성화·"진행 중…" 라벨로 바뀜.
 * 결과가 throw나 reject로 끝나면 그대로 다시 사용자에게 전달 (호출부가 alert).
 *
 * 시간표 강의·자료처럼 한 번 잘못 누르면 복구 어려운 destructive 액션 앞에 항상.
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

  async function handleConfirm() {
    if (busy) return;
    try {
      setBusy(true);
      await Promise.resolve(onConfirm());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={title}>
      <div className="flex flex-col gap-5">
        {description && (
          <p
            className="whitespace-pre-wrap text-[13.5px] wght-450 leading-[1.6] text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {description}
          </p>
        )}

        {children}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-[8px] px-3.5 py-2 text-[13px] wght-560 text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            className={
              destructive
                ? "rounded-[8px] bg-[var(--color-urgent)] px-3.5 py-2 text-[13px] wght-620 text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                : "rounded-[8px] bg-[var(--color-apple-ink)] px-3.5 py-2 text-[13px] wght-620 text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            }
          >
            {busy ? "진행 중…" : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
