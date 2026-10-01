"use client";

import { useId, useState } from "react";
import { MAX_STYLES_PER_REQUEST, type SummaryStyle } from "@/lib/material-policy";
import { SummarizeNowButton } from "./summarize-now-button";

const SUMMARY_PRESETS: ReadonlyArray<{ style: SummaryStyle; label: string }> = [
  { style: "core", label: "시험 직전" },
  { style: "memorize", label: "암기 위주" },
  { style: "understand", label: "이해 위주" },
  { style: "analyze", label: "개념 비교" },
  { style: "calculate", label: "계산·공식" },
  { style: "mindmap", label: "전체 구조" },
];

/**
 * 요약이 이미 만들어진 상태에서 "다시 요약"하기 위한 가벼운 입력 패널.
 *
 * UX 의도:
 *   - 요약 다 읽고 자연스럽게 스크롤한 위치에 등장 — 강요 X, "더 원하면 여기"
 *   - 빈 상태(EmptySummary)·에러 상태(SummaryErrorCard)와 같은 style 계약을 사용
 *   - 프리셋 + 한 줄 요청으로 이미 만든 요약의 강조점만 빠르게 조정
 *   - 자료 안 강조 조정만 — 자료 밖 생성은 서버 가드(intentNote 120자 cap + 프롬프트)가 거부
 *
 * 비용:
 *   - SummarizeNowButton이 그대로 호출 — POST /api/materials/{id}/summarize
 *   - 모델은 §1 모델 라우팅대로 Haiku (summarize tier). 1회당 ~$0.001.
 *   - 학생이 5번씩 누르면 누적되지만 rate limit이 ai 버킷 막아준다.
 */
export function ResummarizePanel({
  materialId,
  className,
}: {
  materialId: string;
  className?: string;
}) {
  const inputId = useId();
  const [selectedStyles, setSelectedStyles] = useState<Set<SummaryStyle>>(() => new Set());
  const [intentNote, setIntentNote] = useState("");
  const trimmed = intentNote.trim();
  const atMax = selectedStyles.size >= MAX_STYLES_PER_REQUEST;

  function toggleStyle(style: SummaryStyle) {
    setSelectedStyles((previous) => {
      const next = new Set(previous);
      if (next.has(style)) {
        next.delete(style);
      } else if (next.size < MAX_STYLES_PER_REQUEST) {
        next.add(style);
      }
      return next;
    });
  }

  return (
    <section className={className}>
      <div className="elev-1 rounded-[18px] bg-white px-7 py-7 sm:px-10 sm:py-8">
        <h3 className="text-[12px] wght-700 text-[var(--color-apple-muted)]">요약 다시 요청</h3>
        <p className="mt-2 text-[14px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]">
          원하시는 방향에 맞게 요청해주세요. 자료 안에서 강조할 지점만 적어주세요.
        </p>
        <fieldset className="mt-5">
          <legend className="text-[12px] wght-620 text-[var(--color-apple-ink)]">정리 방식</legend>
          <p className="mt-1 text-[11px] tabular-nums text-[var(--color-apple-muted)]">
            함께 반영할 방식을 최대 {MAX_STYLES_PER_REQUEST}개까지 고를 수 있어요.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SUMMARY_PRESETS.map((preset) => {
              const active = selectedStyles.has(preset.style);
              const disabled = !active && atMax;
              return (
                <button
                  key={preset.style}
                  type="button"
                  aria-pressed={active}
                  disabled={disabled}
                  onClick={() => toggleStyle(preset.style)}
                  className={
                    active
                      ? "min-h-11 rounded-full bg-[var(--color-apple-ink)] px-4 text-[12.5px] wght-620 text-white transition-colors"
                      : "min-h-11 rounded-full border border-[var(--color-apple-hairline)] bg-white px-4 text-[12.5px] wght-560 text-[var(--color-apple-muted)] transition-colors hover:border-[var(--color-apple-ink)]/30 hover:text-[var(--color-apple-ink)] disabled:cursor-not-allowed disabled:opacity-35"
                  }
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </fieldset>
        <label htmlFor={inputId} className="sr-only">
          요약에 반영할 추가 요청
        </label>
        <input
          id={inputId}
          type="text"
          value={intentNote}
          onChange={(e) => setIntentNote(e.target.value.slice(0, 120))}
          placeholder="예: 시험 직전 정리, 표 위주, 예문은 영어 그대로"
          className="mt-4 w-full rounded-full border border-[var(--color-apple-hairline)] bg-white px-4 py-2.5 text-[13.5px] wght-450 text-[var(--color-apple-ink)] outline-none focus:border-[var(--color-apple-action)] placeholder:text-[var(--color-apple-muted)]/55"
        />
        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-[11px] wght-450 tabular-nums text-[var(--color-apple-muted)]">
            {trimmed.length}/120
          </p>
          <SummarizeNowButton
            materialId={materialId}
            styles={Array.from(selectedStyles)}
            intentNote={trimmed || undefined}
          />
        </div>
      </div>
    </section>
  );
}
