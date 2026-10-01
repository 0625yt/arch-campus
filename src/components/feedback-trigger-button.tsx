"use client";

import { MessageCircle } from "lucide-react";
import { useState } from "react";
import type { FeedbackTargetType } from "@/lib/schemas/feedback";
import { FeedbackModal } from "./feedback-modal";

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
        className={`spring-press inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[var(--color-apple-hairline)] bg-white px-3 text-[11.5px] wght-450 text-[var(--color-apple-muted)] transition-colors hover:border-[var(--color-apple-action)]/40 hover:text-[var(--color-apple-action)] ${className}`}
        style={{ letterSpacing: 0 }}
      >
        <MessageCircle aria-hidden size={14} strokeWidth={1.8} />
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
