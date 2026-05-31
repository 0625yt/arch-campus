import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Apple HIG button system — capsule + 3 styles + 3 sizes.
 *
 * 가이드 (HIG Buttons):
 *   - 한 화면에 prominent 버튼 1~2개만
 *   - hit region 44pt 이상 (모바일·터치)
 *   - Primary = 가장 가능성 높은 non-destructive 액션
 *   - Destructive는 systemRed (--color-apple-coral)
 *   - Cancel = plain (borderless)
 *   - Always press state (transition + scale)
 *
 * 사용:
 *   <AppleButton>버튼</AppleButton>                      // primary capsule large (기본)
 *   <AppleButton variant="secondary">취소</AppleButton>   // bordered (테두리 + 흰 배경)
 *   <AppleButton variant="plain">건너뛰기</AppleButton>   // borderless
 *   <AppleButton variant="destructive">삭제</AppleButton> // systemRed
 *   <AppleButton size="sm">간단</AppleButton>
 */

export type ButtonVariant = "primary" | "secondary" | "plain" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 좌측 leading icon (HIG: capsule 안 14×14) */
  icon?: ReactNode;
  /** 우측 trailing icon (예: ›) */
  trailing?: ReactNode;
  /** width 100% (full-width — iOS modal primary 패턴) */
  fullWidth?: boolean;
}

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-full transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-apple-action)]/40 focus-visible:ring-offset-1";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--color-apple-ink)] text-white shadow-[0_1px_2px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.18)] hover:-translate-y-px hover:shadow-[0_4px_12px_-2px_rgba(0,0,0,0.28)] wght-620",
  secondary:
    "border border-[var(--color-apple-hairline)] bg-white text-[var(--color-apple-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.6)] hover:bg-[var(--color-apple-pearl)] wght-560",
  plain:
    "bg-transparent text-[var(--color-apple-ink)] hover:bg-[var(--color-apple-pearl)] wght-560",
  destructive:
    "bg-[var(--color-apple-coral)] text-white shadow-[0_1px_2px_rgba(224,68,94,0.18),inset_0_1px_0_rgba(255,255,255,0.18)] hover:-translate-y-px hover:shadow-[0_4px_12px_-2px_rgba(224,68,94,0.35)] wght-620",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-[32px] px-3.5 text-[12.5px]",
  md: "min-h-[40px] px-4 text-[13.5px]",
  lg: "min-h-[44px] px-5 text-[14px]",
};

export function AppleButton({
  variant = "primary",
  size = "md",
  icon,
  trailing,
  fullWidth,
  className,
  children,
  ...rest
}: Props) {
  return (
    <button
      type={rest.type ?? "button"}
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && "w-full", className)}
      {...rest}
    >
      {icon && <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center">{icon}</span>}
      <span>{children}</span>
      {trailing && <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center">{trailing}</span>}
    </button>
  );
}
