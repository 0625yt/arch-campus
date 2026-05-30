import Link from "next/link";

/**
 * Apple 톤 빈 상태 카드 — orb·headline·sub·CTA 한 묶음.
 *
 * 5곳 이상이 비슷한 패턴(elev-1 rounded-[18px] bg-white center)을 손으로 재구현하던 걸 단일화.
 * headline 사이즈(18/20/24)와 CTA 색상(ink·action·ghost)을 prop으로 변주.
 *
 * 사용:
 *   <AppleEmptyState
 *     title="아직 만든 문제가 없어요"
 *     sub="자료를 올리고 요약을 만들면, 그 자리에서 바로 만들 수 있어요"
 *     ctaPrimary={{ href: "/dashboard/study", label: "자료 올리러 가기" }}
 *   />
 *
 * AI 티 가드:
 *  - title 끝 마침표 dev warn.
 *  - sub는 본문성 1문장이라 마침표 허용. 단 「~드릴게요」 어시스턴트체 warn.
 */

export interface AppleEmptyCta {
  href: string;
  label: string;
  /** "primary" = 검은 ink 버튼, "action" = 파란 action 버튼, "ghost" = 외곽선만. */
  tone?: "primary" | "action" | "ghost";
}

export interface AppleEmptyStateProps {
  title: string;
  sub?: string;
  /** title 위에 작게 깔리는 uppercase 라벨 — review 페이지의 "지금 복습할 오답이 없어요" 톤. */
  eyebrow?: string;
  eyebrowColor?: string;
  /** title 사이즈. 기본 20. */
  size?: "sm" | "md" | "lg";
  ctaPrimary?: AppleEmptyCta;
  ctaSecondary?: AppleEmptyCta;
  /** elev-1 + bg-white 카드 톤. fade-up도 자동. */
  className?: string;
}

const TITLE_SIZE = {
  sm: "text-[18px]",
  md: "text-[20px]",
  lg: "text-[24px]",
} as const;

const CTA_CLASS = {
  primary:
    "inline-flex h-[44px] items-center rounded-full bg-[var(--color-apple-ink)] px-6 text-[14px] wght-560 text-white transition-opacity hover:opacity-90",
  action:
    "inline-flex h-[44px] items-center rounded-full bg-[var(--color-apple-action)] px-6 text-[14px] wght-560 text-white transition-all hover:bg-[var(--color-apple-action-hover)]",
  ghost:
    "inline-flex h-[44px] items-center rounded-full border border-[var(--color-apple-hairline)] bg-white px-6 text-[14px] wght-560 text-[var(--color-apple-ink)] transition-colors hover:border-[var(--color-apple-action)]/40 hover:text-[var(--color-apple-action)]",
} as const;

export function AppleEmptyState({
  title,
  sub,
  eyebrow,
  eyebrowColor = "var(--color-apple-success)",
  size = "md",
  ctaPrimary,
  ctaSecondary,
  className = "",
}: AppleEmptyStateProps) {
  if (process.env.NODE_ENV !== "production") {
    if (title.endsWith(".") || title.endsWith("。")) {
      // biome-ignore lint/suspicious/noConsole: dev-only AI-tone guard
      console.warn(`[AppleEmptyState] title 끝 마침표 권장 X: "${title}"`);
    }
    if (sub?.endsWith("드릴게요.") || sub?.includes("도와드릴게요")) {
      // biome-ignore lint/suspicious/noConsole: dev-only AI-tone guard
      console.warn(`[AppleEmptyState] 어시스턴트체 카피: "${sub}"`);
    }
  }

  return (
    <section
      className={`elev-1 rounded-[18px] bg-white px-7 py-12 text-center fade-up sm:py-16 ${className}`}
    >
      {eyebrow && (
        <p
          className="text-[12px] wght-560 uppercase tracking-[0.06em]"
          style={{ color: eyebrowColor }}
        >
          {eyebrow}
        </p>
      )}
      <p
        className={`${TITLE_SIZE[size]} ${eyebrow ? "mt-4" : ""} wght-620 text-[var(--color-apple-ink)]`}
        style={{ letterSpacing: "-0.012em" }}
      >
        {title}
      </p>
      {sub && (
        <p
          className="mx-auto mt-3 max-w-[460px] text-[14px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.022em" }}
        >
          {sub}
        </p>
      )}
      {(ctaPrimary || ctaSecondary) && (
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {ctaPrimary && (
            <Link
              href={ctaPrimary.href}
              className={CTA_CLASS[ctaPrimary.tone ?? "primary"]}
              style={{ letterSpacing: "-0.012em" }}
            >
              {ctaPrimary.label}
            </Link>
          )}
          {ctaSecondary && (
            <Link
              href={ctaSecondary.href}
              className={CTA_CLASS[ctaSecondary.tone ?? "ghost"]}
              style={{ letterSpacing: "-0.012em" }}
            >
              {ctaSecondary.label}
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
