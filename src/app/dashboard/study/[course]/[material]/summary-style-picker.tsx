"use client";

import { useEffect, useState } from "react";
import {
  MAX_STYLES_PER_REQUEST,
  STYLE_LABEL,
  STYLE_ORDER,
  type SummaryStyle,
} from "@/lib/material-policy";

/**
 * 요약 스타일 다중 선택 picker.
 *
 * - 6개 스타일 chip: 핵심 / 이해 / 계산 / 분석 / 암기 / 마인드맵
 * - 다중 선택 가능, 최대 MAX_STYLES_PER_REQUEST (4개) 까지
 * - defaultStyles는 부모(서버 컴포넌트)가 type+과목 기반으로 추천한 2~3개
 * - 사용자가 변경 시 onChange로 부모에 알림. 부모가 fetch 시점에 selected 전달
 *
 * UI 톤 (DESIGN.md §10·§10-B):
 *   - 활성: 검은 ink 배경 + 흰 텍스트
 *   - 비활성: 흰 배경 + hairline + muted 텍스트
 *   - 풀 라운드 pill (캘린더 카테고리 chip과 일관)
 *   - 4개 max 도달 시 비활성 chip은 클릭 막힘 + opacity 낮춤
 */
export function SummaryStylePicker({
  defaultStyles,
  onChange,
}: {
  defaultStyles: SummaryStyle[];
  onChange?: (selected: SummaryStyle[]) => void;
}) {
  const [selected, setSelected] = useState<Set<SummaryStyle>>(() => new Set(defaultStyles));

  // 부모가 새 default 보내면 동기화 (다른 자료로 이동·재요약 케이스)
  useEffect(() => {
    setSelected(new Set(defaultStyles));
  }, [defaultStyles]);

  // selected 변경 시 부모에 알림
  useEffect(() => {
    onChange?.(Array.from(selected));
  }, [selected, onChange]);

  function toggle(s: SummaryStyle) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(s)) {
        next.delete(s);
      } else {
        if (next.size >= MAX_STYLES_PER_REQUEST) return prev; // max 도달 — 무시
        next.add(s);
      }
      return next;
    });
  }

  const atMax = selected.size >= MAX_STYLES_PER_REQUEST;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p
          className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "0.06em" }}
        >
          요약 스타일
        </p>
        <p
          className="text-[11px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {selected.size}/{MAX_STYLES_PER_REQUEST}
        </p>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
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
  );
}
