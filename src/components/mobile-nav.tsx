"use client";

import { BookOpen, CalendarDays, Home, ListChecks, RotateCcw, Wrench } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { SearchTrigger } from "@/components/search-trigger";
import { cn } from "@/lib/utils";

/*
 * 문제 생성이 제품의 핵심이므로 모바일에서도 독립 탭으로 유지한다.
 * 6칸이지만 320px에서도 각 항목 폭이 53px 이상이라 터치 영역은 유지된다.
 */
const NAV = [
  { href: "/dashboard", label: "홈", Icon: Home },
  { href: "/dashboard/study", label: "공부", Icon: BookOpen },
  { href: "/dashboard/quiz", label: "문제", Icon: ListChecks },
  { href: "/dashboard/review", label: "복습", Icon: RotateCcw },
  { href: "/dashboard/calendar", label: "일정", Icon: CalendarDays },
  { href: "/dashboard/tools", label: "도구", Icon: Wrench },
] as const;

/**
 * iOS 노치 보호 + 단순 wordmark + 검색. 햄버거 제거 — bottom tab으로 흐름 통일.
 */
export function MobileTopbar() {
  return (
    <header
      data-glass
      className="liquid-glass-bar sticky top-0 z-30 flex h-11 items-center justify-between gap-2 border-b border-[var(--color-apple-hairline-soft)] px-3 md:hidden"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <Link href="/dashboard" aria-label="홈" className="flex h-11 items-center gap-2 px-1">
        <BrandMark size={20} />
        <span
          className="wght-620 text-[14px] text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.014em" }}
        >
          arch
        </span>
      </Link>
      <SearchTrigger variant="icon" />
    </header>
  );
}

/**
 * iOS Tab Bar — 활성은 위에 짧은 ink 바.
 */
export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      data-glass
      className="liquid-glass-bar sticky bottom-0 z-30 border-t border-[var(--color-apple-hairline-soft)] md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex h-14 items-stretch">
        {NAV.map(({ href, label, Icon }) => {
          const active =
            pathname === href ||
            (href === "/dashboard"
              ? pathname === "/dashboard/chat"
              : pathname.startsWith(`${href}/`));
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cn(
                  "group relative flex h-full min-h-[44px] flex-col items-center justify-center gap-0.5 transition-colors",
                  "active:bg-[var(--color-apple-pearl)]",
                  active
                    ? "wght-620 text-[var(--color-apple-ink)]"
                    : "wght-450 text-[var(--color-apple-muted)]",
                )}
                aria-current={active ? "page" : undefined}
                style={{ letterSpacing: "-0.012em" }}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute left-1/2 top-0 h-[2px] w-7 -translate-x-1/2 rounded-b-full bg-[var(--color-apple-ink)]"
                  />
                )}
                <Icon aria-hidden size={20} strokeWidth={active ? 2.1 : 1.7} />
                <span className="text-[10px]">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
