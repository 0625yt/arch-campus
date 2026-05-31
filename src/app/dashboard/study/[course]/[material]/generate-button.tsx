"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { GenerateForm } from "./generate-form";

export interface SiblingMaterialOption {
  id: string;
  title: string;
  type: string;
}

interface Props {
  courseSlug: string;
  materialId: string;
  materialTitle: string;
  materialType?: string;
  /** "primary" — 다크 푸터 위 흰 pill. "compact" — 호환용 (사용 X) */
  variant?: "primary" | "compact";
  /** 같은 강의의 다른 자료들 — 묶음 출제 옵션 (현재 자료 제외하고 넘긴다). */
  siblingMaterials?: SiblingMaterialOption[];
}

export function GenerateButton({
  courseSlug,
  materialId,
  materialTitle,
  materialType,
  variant = "primary",
  siblingMaterials,
}: Props) {
  const [open, setOpen] = useState(false);
  const isExamMaterial = materialType === "exam";

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
        {isExamMaterial ? "기출문제 추출하기" : "문제 만들기"}
        <span className="ml-1.5 transition-transform group-hover:translate-x-0.5">›</span>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={isExamMaterial ? "기출문제 추출하기" : "문제 만들기"}
        description={materialTitle}
        size="md"
      >
        <GenerateForm
          courseSlug={courseSlug}
          materialId={materialId}
          materialType={materialType}
          siblingMaterials={siblingMaterials}
        />
      </Modal>
    </>
  );
}
