"use client";

/**
 * 강의 카테고리 chip 무한 가로 marquee.
 *
 * 두 벌 복제 + transform: translate3d(-50%) 60s linear infinite.
 * hover 시 정지. 모바일 90s.
 *
 * prefers-reduced-motion에서는 정지 (globals.css 553라인 가드).
 */

const CATEGORIES = [
  "알고리즘",
  "데이터베이스",
  "컴퓨터구조",
  "선형대수",
  "통계학",
  "회로이론",
  "유기화학",
  "미시경제",
  "마케팅원론",
  "한국근현대사",
  "운영체제",
  "자료구조",
];

const MARQUEE_CATEGORIES = [
  ...CATEGORIES.map((label) => ({ id: `${label}-first`, label })),
  ...CATEGORIES.map((label) => ({ id: `${label}-second`, label })),
];

export function CategoryMarquee() {
  return (
    <section
      aria-label="강의 카테고리"
      className="marquee-viewport relative border-b py-6 sm:py-8"
      style={{
        borderColor: "var(--color-landing-hairline)",
        background: "var(--color-landing-bg)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[80px] sm:w-[120px]"
        style={{
          background: "linear-gradient(to right, var(--color-landing-bg), transparent)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-[80px] sm:w-[120px]"
        style={{
          background: "linear-gradient(to left, var(--color-landing-bg), transparent)",
        }}
      />

      <div className="marquee-track gap-3">
        {MARQUEE_CATEGORIES.map(({ id, label }) => {
          return (
            <span
              key={id}
              className="inline-flex shrink-0 items-center rounded-[8px] border px-3.5 py-1.5 text-[12.5px] wght-560 backdrop-blur-md transition-opacity hover:opacity-100"
              style={{
                borderColor: "var(--color-landing-hairline)",
                background: "var(--color-landing-card)",
                color: "var(--color-landing-text-muted)",
              }}
            >
              {label}
            </span>
          );
        })}
      </div>
    </section>
  );
}
