"use client";

import { ArrowRight, CalendarPlus } from "lucide-react";

/**
 * 자연어 일정 입력 진입점 — 캘린더 그리드 위 1급 자리.
 *
 * 디자인 가드:
 * - 반짝이·글로우·타이핑 애니메이션 없이 실제 입력 도구처럼 조용하게 둔다.
 * - lucide CalendarPlus로 기능을 바로 읽을 수 있게 한다.
 * - 예시 칩 3개 — 누르면 모달 열림 (학생이 "이런 식으로 적으면 되는구나" 학습)
 * - 헤드라인: 학생이 직접 말하듯 적으면 일정 후보를 잡아주는 카드
 *
 * 동작:
 * - 카드 누르면 onOpen() → AI 모달 열림
 * - 칩 누르면 onOpen() → 학생이 모달 안에서 보고 변형해서 적음 (prefill 안 함, 단순 학습)
 */

const CHIPS = [
  "다음 주 화 3시 영어 과제",
  "5/30 알바 6시~10시",
  "동아리 회식 다음 주 월 7시",
] as const;

export function AiEntryCard({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="relative mb-6">
      <button
        type="button"
        onClick={onOpen}
        className="native-card group/card relative flex min-h-[72px] w-full items-center gap-3.5 px-4 py-3.5 text-left sm:px-5 sm:py-4"
      >
        <span
          aria-hidden
          className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--color-apple-hairline-soft)] bg-[var(--color-apple-pearl)] text-[var(--color-apple-action)]"
        >
          <CalendarPlus className="h-4 w-4" strokeWidth={1.8} />
        </span>

        <span className="flex min-w-0 flex-1 flex-col">
          <span
            className="text-[13px] wght-620 text-[var(--color-apple-ink)] sm:text-[13.5px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            문장으로 일정 추가
          </span>
          <span
            className="mt-0.5 truncate text-[12.5px] wght-450 text-[var(--color-apple-muted)] sm:text-[13px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            예: 다음 주 화요일 3시 영어 과제
          </span>
        </span>

        <ArrowRight
          aria-hidden
          className="h-4 w-4 shrink-0 text-[var(--color-apple-muted)] transition-all duration-200 group-hover/card:translate-x-0.5 group-hover/card:text-[var(--color-apple-action)]"
          strokeWidth={1.7}
        />
      </button>

      {/* 예시 칩 — 학생이 "이런 식으로 적으면 되는구나" 학습용. 누르면 모달 열림 */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span
          className="text-[11px] wght-560 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.006em" }}
        >
          예시
        </span>
        {CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={onOpen}
            className="native-chip min-h-9 px-2.5 py-1 text-[11.5px] wght-450"
            style={{ letterSpacing: "-0.012em" }}
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}
