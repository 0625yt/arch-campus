"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { GradedResult } from "@/lib/services/grade-quiz";
export function SelfAssessmentControl({
  quizId,
  attemptId,
  questionId,
  correct,
  selfAssessed,
  onChange,
}: {
  quizId: string;
  attemptId: string;
  questionId: number;
  correct: boolean;
  selfAssessed?: boolean;
  onChange?: (result: GradedResult) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (correct && !selfAssessed) return null;
  async function save() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/quiz/${quizId}/self-assess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId, questionId, accepted: !selfAssessed }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "저장하지 못했어요");
      onChange?.(data.result);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4 rounded-xl border border-[var(--color-apple-hairline)] p-4 text-sm">
      <p className="text-[var(--color-apple-muted)]">
        {selfAssessed
          ? "직접 인정한 정답이에요. 학습 점수와 오답 목록에 반영했어요."
          : "의미가 맞는데 오답으로 표시됐나요? 원문·해설을 확인하고 직접 정답으로 인정할 수 있어요."}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={save}
        className="mt-2 min-h-11 font-semibold text-[var(--color-apple-action)] disabled:opacity-50"
      >
        {busy ? "저장 중…" : selfAssessed ? "자동 채점으로 되돌리기" : "내 답을 정답으로 인정"}
      </button>
      {error && (
        <p role="alert" className="text-[var(--color-urgent)]">
          {error}
        </p>
      )}
    </div>
  );
}
