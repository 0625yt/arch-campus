"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { Arrow } from "@/components/primitives";
import { GenerateForm } from "./generate-form";

interface Props {
  courseSlug: string;
  materialId: string;
  materialTitle: string;
  /** "primary" — 큰 강조 버튼 (페이지 푸터). "compact" — 헤더용 작은 버튼 */
  variant?: "primary" | "compact";
}

export function GenerateButton({
  courseSlug,
  materialId,
  materialTitle,
  variant = "primary",
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === "primary" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group inline-flex items-baseline gap-1.5 rounded-full bg-[var(--color-fg-strong)] px-5 py-2.5 text-[14px] wght-560 kerning-tight text-white transition-colors hover:bg-[var(--color-fg)]"
        >
          문제 만들기
          <Arrow className="text-[14px] transition-transform group-hover:translate-x-0.5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group inline-flex items-baseline gap-1 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-bg)] px-3 py-1.5 text-[12px] wght-560 kerning-tight text-[var(--color-fg)] transition-colors hover:border-[var(--color-fg-disabled)] hover:bg-[var(--color-surface)]"
        >
          문제 만들기
          <Arrow className="text-[11px] transition-transform group-hover:translate-x-0.5" />
        </button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="문제 만들기"
        description={materialTitle}
        size="md"
      >
        <GenerateForm courseSlug={courseSlug} materialId={materialId} />
      </Modal>
    </>
  );
}
