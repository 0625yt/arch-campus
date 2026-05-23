"use client";

import { useEffect, useState } from "react";

/**
 * 자료 상세 페이지의 좌 PDF / 우 요약 분할 컨트롤.
 *
 * 4단 segmented:
 *  - pdf-only     : PDF만 (요약 숨김)
 *  - split        : 5:5 분할 (기본)
 *  - summary-only : 요약만 (PDF 숨김)
 *  - fullscreen   : 전체화면 PDF (요약 위로 띄움 — 향후 확장)
 *
 * 상태 localStorage 영속 — 같은 사용자가 자료 사이를 오가도 마지막 선택 유지.
 *
 * 데스크톱(md+)만 노출. 모바일은 단일 컬럼 요약 + PDF 별도 탭이 더 자연스러워 컨트롤 자체 숨김.
 *
 * DESIGN.md §10 가드:
 *   - "풀 라운드 pill segmented control 무분별 X" — 액센트 위치 1곳(자료 상세)이라 OK
 *   - rounded-[8px] + 활성만 흰 배경 + 작은 그림자 (캘린더 ScaleToggle과 같은 톤)
 */

export type SplitView = "pdf-only" | "split" | "summary-only" | "fullscreen";

const STORAGE_KEY = "arch.material.splitView";

export function useSplitView(): [SplitView, (v: SplitView) => void] {
  // SSR-safe: 첫 render는 기본값 "split", useEffect에서 localStorage 읽음.
  // hydration mismatch 방지를 위해 mounted 플래그 사용.
  const [view, setViewState] = useState<SplitView>("split");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (
        raw === "pdf-only" ||
        raw === "split" ||
        raw === "summary-only" ||
        raw === "fullscreen"
      ) {
        setViewState(raw);
      }
    } catch {
      /* localStorage 차단 환경(시크릿 모드 등)은 기본값 그대로 */
    }
  }, []);

  function setView(next: SplitView) {
    setViewState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* noop */
    }
  }

  return [view, setView];
}

interface Option {
  value: SplitView;
  label: string;
  ariaLabel: string;
}

const OPTIONS: Option[] = [
  { value: "pdf-only", label: "PDF만", ariaLabel: "PDF만 보기" },
  { value: "split", label: "5:5", ariaLabel: "절반씩 보기" },
  { value: "summary-only", label: "요약만", ariaLabel: "요약만 보기" },
];

export function SplitControl({
  view,
  onChange,
  className,
}: {
  view: SplitView;
  onChange: (v: SplitView) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="분할 보기"
      className={`inline-flex items-center gap-0.5 rounded-[8px] bg-[var(--color-apple-pearl)] p-0.5 ${className ?? ""}`}
    >
      {OPTIONS.map((o) => {
        const active = view === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={o.ariaLabel}
            onClick={() => onChange(o.value)}
            className={`inline-flex h-6 items-center justify-center rounded-[6px] px-2.5 text-[12px] transition-all ${
              active
                ? "wght-620 bg-white text-[var(--color-apple-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                : "wght-450 text-[var(--color-apple-muted)] hover:text-[var(--color-apple-ink)]"
            }`}
            style={{ letterSpacing: "-0.012em" }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
