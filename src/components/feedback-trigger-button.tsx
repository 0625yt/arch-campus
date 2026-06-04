"use client";

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
        className={`spring-press inline-flex items-center gap-1 rounded-full border border-[var(--color-apple-hairline)] bg-white px-2.5 py-1 text-[11.5px] wght-450 text-[var(--color-apple-muted)] transition-colors hover:border-[var(--color-apple-action)]/40 hover:text-[var(--color-apple-action)] ${className}`}
        style={{ letterSpacing: "-0.012em" }}
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="h-3 w-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
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
