"use client";

import { useState } from "react";
import {
  type SummaryStyle,
  STYLE_LABEL,
  STYLE_ORDER,
  MAX_STYLES_PER_REQUEST,
} from "@/lib/material-policy";
import { SummarizeNowButton } from "./summarize-now-button";

/**
 * EmptySummary·SummaryErrorCard 안에 picker + 버튼을 한 묶음으로 박는 client 래퍼.
 *
 * 의도:
 *   - 서버 컴포넌트가 가진 default(과목+type에서 뽑은 추천)를 초기값으로 받음
 *   - 학생이 chip 토글해 변경하면 그 상태로 SummarizeNowButton에 styles 전달
 *   - 다른 페이지 navigate 안 함 — useState만으로 충분
 *
 * 자체 picker UI를 내장한 이유:
 *   - SummaryStylePicker는 onChange를 통해 부모에 알리는데, 부모가 client여야 동작
 *   - EmptySummary는 server 함수라 picker를 직접 못 박음 → 이 래퍼가 다리 역할
 */
export function SummarizeWithStyles({
  materialId,
  defaultStyles,
}: {
  materialId: string;
  defaultStyles: SummaryStyle[];
}) {
  const [selected, setSelected] = useState<Set<SummaryStyle>>(
    () => new Set(defaultStyles),
  );

  function toggle(s: SummaryStyle) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(s)) {
        next.delete(s);
      } else {
        if (next.size >= MAX_STYLES_PER_REQUEST) return prev;
        next.add(s);
      }
      return next;
    });
  }

  const atMax = selected.size >= MAX_STYLES_PER_REQUEST;
  const stylesArray: SummaryStyle[] = Array.from(selected);

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="w-full max-w-[460px]">
        <div className="flex items-baseline justify-between gap-3">
          <p
            className="text-[11px] wght-620 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "0.06em" }}
          >
            어떻게 정리해드릴까요
          </p>
          <p
            className="text-[11px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {selected.size}/{MAX_STYLES_PER_REQUEST}
          </p>
        </div>
        <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
          {STYLE_ORDER.map((s) => {
            const isActive = selected.has(s);
            const disabled = !isActive && atMax;
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggle(s)}
                disabled={disabled}
                aria-pressed={isActive}
                className={
                  isActive
                    ? "rounded-full bg-[var(--color-apple-ink)] px-3 py-[5px] text-[12px] wght-620 text-white transition-colors"
                    : disabled
                      ? "rounded-full border border-[var(--color-apple-hairline)] bg-white px-3 py-[5px] text-[12px] wght-560 text-[var(--color-apple-muted)]/40 cursor-not-allowed"
                      : "rounded-full border border-[var(--color-apple-hairline)] bg-white px-3 py-[5px] text-[12px] wght-560 text-[var(--color-apple-muted)] transition-colors hover:border-[var(--color-apple-ink)]/30 hover:text-[var(--color-apple-ink)]"
                }
                style={{ letterSpacing: "-0.012em" }}
              >
                {STYLE_LABEL[s]}
              </button>
            );
          })}
        </div>
      </div>
      <SummarizeNowButton materialId={materialId} styles={stylesArray} />
    </div>
  );
}
