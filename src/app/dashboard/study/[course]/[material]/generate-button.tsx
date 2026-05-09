"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { GenerateForm } from "./generate-form";

interface Props {
  courseSlug: string;
  materialId: string;
  materialTitle: string;
  /** "primary" — 다크 푸터 위 흰 pill. "compact" — 호환용 (사용 X) */
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === "primary"
            ? "group inline-flex h-[48px] items-center justify-center rounded-full bg-[var(--color-apple-action)] px-7 text-[15px] wght-560 text-white transition-all duration-150 hover:bg-[var(--color-apple-action-hover)] active:scale-[0.97]"
            : "group inline-flex h-[36px] items-center justify-center rounded-full bg-[var(--color-apple-action)] px-5 text-[14px] wght-450 text-white transition-colors hover:bg-[var(--color-apple-action-hover)]"
        }
        style={{ letterSpacing: "-0.012em" }}
      >
        문제 만들기
        <span className="ml-1.5 transition-transform group-hover:translate-x-0.5">›</span>
      </button>

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
