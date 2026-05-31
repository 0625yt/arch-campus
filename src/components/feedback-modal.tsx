"use client";

import { useState } from "react";
import {
  SUMMARY_CATEGORIES,
  QUIZ_ITEM_CATEGORIES,
  type FeedbackTargetType,
} from "@/lib/schemas/feedback";

interface Props {
  targetType: FeedbackTargetType;
  targetId: string;
  generationId?: string;
  quizQuestionIndex?: number;
  onClose: () => void;
}

export function FeedbackModal({
  targetType,
  targetId,
  generationId,
  quizQuestionIndex,
  onClose,
}: Props) {
  const categories =
    targetType === "summary" ? SUMMARY_CATEGORIES : QUIZ_ITEM_CATEGORIES;
  const [rating, setRating] = useState<number>(0);
  const [category, setCategory] = useState<string>(categories[0].value);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (rating < 1) {
      setErr("별점을 선택해주세요");
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetId,
          generationId,
          rating,
          category,
          body: body.trim() || undefined,
          quizQuestionIndex,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error ?? "저장에 실패했어요");
        setSubmitting(false);
        return;
      }
      onClose();
    } catch {
      setErr("네트워크 오류");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">이 결과 어땠어요?</h2>
        <p className="mt-1 text-sm text-neutral-500">
          별점·분류·한 줄 의견을 남겨주세요. 관리자만 봅니다.
        </p>

        <div className="mt-4">
          <div className="text-xs font-medium text-neutral-700">별점</div>
          <div className="mt-1 flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n}점`}
                onClick={() => setRating(n)}
                className={`text-2xl transition ${
                  n <= rating ? "text-amber-400" : "text-neutral-300"
                }`}
              >
                ★
              </button>
            ))}
            <span className="ml-2 self-center text-xs text-neutral-500">
              {rating > 0 ? `${rating}점` : "선택"}
            </span>
          </div>
        </div>

        <div className="mt-4">
          <label
            className="text-xs font-medium text-neutral-700"
            htmlFor="fb-cat"
          >
            분류
          </label>
          <select
            id="fb-cat"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
          >
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4">
          <label
            className="text-xs font-medium text-neutral-700"
            htmlFor="fb-body"
          >
            한 줄 의견 (선택, 500자)
          </label>
          <textarea
            id="fb-body"
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 500))}
            rows={3}
            placeholder="구체적일수록 빠르게 고칠 수 있어요"
            className="mt-1 w-full resize-none rounded-lg border border-neutral-200 px-3 py-2 text-sm"
          />
          <div className="mt-1 text-right text-xs text-neutral-400">
            {body.length}/500
          </div>
        </div>

        {err && <div className="mt-2 text-sm text-red-600">{err}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            취소
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={submit}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "보내는 중…" : "보내기"}
          </button>
        </div>
      </div>
    </div>
  );
}
