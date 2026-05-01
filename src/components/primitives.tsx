import { cn } from "@/lib/utils";

/**
 * 큰 숫자 + 작은 단위 — StyleSeed Rule 2 (2:1 비율).
 *   <Numeral value={3} unit="개" />  →  3개
 *   <Numeral value={5} unit={`/12`} muted />  →  5/12 (12 muted)
 */
export function Numeral({
  value,
  unit,
  size = "md",
  className,
  unitClassName,
}: {
  value: number | string;
  unit?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  unitClassName?: string;
}) {
  const sizes = {
    sm: { num: "text-[18px]", unit: "text-[11px]" },
    md: { num: "text-[24px]", unit: "text-[12px]" },
    lg: { num: "text-[36px]", unit: "text-[14px]" },
    xl: { num: "text-[48px]", unit: "text-[16px]" },
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-baseline tabular-nums kerning-tight",
        className
      )}
    >
      <span className={cn(sizes[size].num, "wght-560 leading-none")}>
        {value}
      </span>
      {unit && (
        <span
          className={cn(
            sizes[size].unit,
            "ml-0.5 wght-450 text-[var(--color-fg-muted)]",
            unitClassName
          )}
        >
          {unit}
        </span>
      )}
    </span>
  );
}

/**
 * "5분 전", "방금" 같은 상대 시간. 정확한 시각이 필요하면 title로 fallback.
 */
export function TimeStamp({
  label,
  title,
  dot,
}: {
  label: string;
  title?: string;
  dot?: boolean;
}) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 text-[11px] wght-450 kerning-tight text-[var(--color-fg-subtle)] tabular-nums"
    >
      {dot && (
        <span
          aria-hidden
          className="h-1 w-1 rounded-full bg-[var(--color-fg-disabled)]"
        />
      )}
      {label}
    </span>
  );
}

/** 글자형 화살표 — SVG arrow보다 가볍고 폰트 강약 따라감 */
export function Arrow({
  className,
  variant = "right",
}: {
  className?: string;
  variant?: "right" | "up-right";
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block leading-none kerning-tight", className)}
      style={{ transform: variant === "up-right" ? "rotate(-45deg)" : undefined }}
    >
      →
    </span>
  );
}

/** 점 — 색·크기 유연. 인라인 라벨 같이 쓸 때 */
export function Dot({
  color,
  size = 6,
  className,
}: {
  color?: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block shrink-0 rounded-full", className)}
      style={{
        width: size,
        height: size,
        backgroundColor: color ?? "var(--color-fg-disabled)",
      }}
    />
  );
}

/** 가는 가로 진행률 라인 — 박스 X */
export function ProgressLine({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <span
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "relative inline-block h-px w-full overflow-hidden bg-[var(--color-line)]",
        className
      )}
    >
      <span
        className="absolute inset-y-0 left-0 bg-[var(--color-fg-strong)]"
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

/** 키보드 단축키 표시 — Linear 톤 */
export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-[var(--color-line-strong)] bg-white px-1 text-[10px] wght-560 text-[var(--color-fg-muted)] tabular-nums">
      {children}
    </kbd>
  );
}

/** 가는 섹션 구분 라인 — 카드 박스 대체 */
export function Divider({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("h-px w-full bg-[var(--color-line)]", className)}
    />
  );
}
