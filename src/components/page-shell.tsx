import { cn } from "@/lib/utils";

/**
 * 모든 대시보드 페이지의 외곽 컨테이너.
 * 너비·여백·진입 애니메이션을 통일.
 *
 * @example
 *   <PageShell width="md">
 *     <PageHint>...</PageHint>
 *     <PageTitle>...</PageTitle>
 *     ...
 *   </PageShell>
 */
export function PageShell({
  children,
  width = "md",
  className,
}: {
  children: React.ReactNode;
  /**
   * narrow — 본문 중심 (Today, 자료 상세). 680~760px
   * md     — 기본 (Study, Calendar, History). 760~820px
   * wide   — 그리드형 (Tools). 920px
   */
  width?: "narrow" | "md" | "wide";
  className?: string;
}) {
  const widths = {
    narrow: "max-w-[680px] xl:max-w-[760px]",
    md: "max-w-[760px] xl:max-w-[820px]",
    wide: "max-w-[920px]",
  } as const;

  return (
    <div
      className={cn(
        "mx-auto w-full px-5 pb-12 pt-6 sm:px-7 sm:pt-8 md:px-12 md:pt-10 md:pb-20",
        widths[width],
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * 페이지 첫 줄 — "지금 뭘 할 수 있는지" 한 줄 hint.
 * 사용자 흐름 명확화. ChatGPT의 "How can I help you today?" 같은 톤.
 */
export function PageHint({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "fade-up text-[12.5px] wght-450 kerning-tight text-[var(--color-fg-muted)]",
        className,
      )}
    >
      {children}
    </p>
  );
}

/**
 * 페이지 H1. 모든 루트 페이지에서 동일 사이즈로 통일.
 * Today는 Hero 헤드라인이 따로 있어서 이걸 안 씀.
 */
export function PageTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h1
      className={cn(
        "fade-up fade-up-1 text-[26px] leading-[1.2] kerning-tight wght-700 text-[var(--color-fg-strong)] sm:text-[30px] md:text-[34px]",
        className,
      )}
    >
      {children}
    </h1>
  );
}

/**
 * 섹션 라벨 — uppercase mono.
 * 페이지 안의 작은 섹션 제목 ("이번 주 · 8건", "자주 나온 키워드" 등).
 */
export function SectionLabel({
  children,
  count,
  className,
}: {
  children: React.ReactNode;
  /** 우측에 자동으로 붙는 카운트 (옵션) */
  count?: number;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "text-[10.5px] wght-700 kerning-mono uppercase text-[var(--color-fg-subtle)]",
        className,
      )}
    >
      {children}
      {typeof count === "number" && (
        <span className="ml-2 wght-450 tabular-nums text-[var(--color-fg-disabled)]">
          {count}건
        </span>
      )}
    </h2>
  );
}

/**
 * 메타 라인 — `자료 4 · 문제 18 · 정답률 78%` 같은 dot-separated 정보.
 * children에 chip 여러 개 넣으면 자동으로 dot 구분.
 */
export function MetaLine({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const items = Array.isArray(children) ? children.filter(Boolean) : [children];
  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[11.5px] wght-450 kerning-tight text-[var(--color-fg-muted)]",
        className,
      )}
    >
      {items.map((child, i) => (
        <span key={i} className="inline-flex items-baseline gap-2">
          {i > 0 && (
            <span aria-hidden className="text-[var(--color-line-strong)]">
              ·
            </span>
          )}
          {child}
        </span>
      ))}
    </div>
  );
}

/**
 * 페이지 푸터 — 학습 보조용 워터마크 등.
 */
export function PageFooter({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "mt-20 text-[11px] wght-380 kerning-tight text-[var(--color-fg-subtle)]",
        className,
      )}
    >
      {children}
    </p>
  );
}

/**
 * 빈 상태 — 격려형. 위축 X.
 * 첫 줄은 격려/유머, 둘째 줄은 무엇을 하면 되는지, 마지막은 액션(옵션).
 */
export function EmptyState({
  title,
  hint,
  action,
  className,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start rounded-2xl border border-dashed border-[var(--color-line-strong)] bg-[var(--color-surface)] px-6 py-10 sm:py-12",
        className,
      )}
    >
      <p className="text-[15.5px] wght-700 kerning-tight text-[var(--color-fg-strong)] sm:text-[16.5px]">
        {title}
      </p>
      {hint && (
        <p className="mt-1.5 max-w-[440px] text-[13px] leading-[1.6] wght-450 kerning-tight text-[var(--color-fg-muted)] sm:text-[13.5px]">
          {hint}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
