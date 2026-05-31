"use client";

import { useState } from "react";
import { FeedbackModal } from "./feedback-modal";
import type { FeedbackTargetType } from "@/lib/schemas/feedback";

interface Props {
  targetType: FeedbackTargetType;
  targetId: string;
  generationId?: string;
  quizQuestionIndex?: number;
  label?: string;
  className?: string;
}

export function FeedbackTriggerButton({
  targetType,
  targetId,
  generationId,
  quizQuestionIndex,
  label = "피드백",
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`text-xs text-neutral-500 underline-offset-2 hover:text-neutral-800 hover:underline ${className}`}
      >
        {label}
      </button>
      {open && (
        <FeedbackModal
          targetType={targetType}
          targetId={targetId}
          generationId={generationId}
          quizQuestionIndex={quizQuestionIndex}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
