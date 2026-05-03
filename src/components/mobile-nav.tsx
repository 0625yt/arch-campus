"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SearchTrigger } from "@/components/search-trigger";
import { MobileDrawer } from "@/components/mobile-drawer";

/* 자체 SVG icons — sidebar.tsx와 동일 톤 */
function IconToday({ active }: { active?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle
        cx="9"
        cy="9"
        r="2.6"
        stroke="currentColor"
        strokeWidth={active ? 1.7 : 1.4}
        fill={active ? "currentColor" : "none"}
      />
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth={1.2} opacity={active ? 0.5 : 0.35} />
    </svg>
  );
}
function IconStudy() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M3.5 4.5h7.5c1.1 0 1.8.7 1.8 1.7v8H5.3c-1 0-1.8-.7-1.8-1.7V4.5z" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round" />
      <path d="M3.5 4.5v10h9.3" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="3" y="4.4" width="12" height="10.4" rx="1.4" stroke="currentColor" strokeWidth={1.3} />
      <path d="M3 7.4h12" stroke="currentColor" strokeWidth={1.3} />
      <path d="M6.5 3.2v2M11.5 3.2v2" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
    </svg>
  );
}
function IconTools() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M4 14l5.4-5.4M11.5 5.8l1.9-1.9 1.3 1.3-1.9 1.9-1.3-1.3z" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round" />
      <circle cx="4" cy="14" r="1.2" stroke="currentColor" strokeWidth={1.3} />
    </svg>
  );
}

const NAV = [
  { href: "/dashboard/today", label: "오늘", Icon: IconToday },
  { href: "/dashboard/study", label: "공부", Icon: IconStudy },
  { href: "/dashboard/calendar", label: "마감", Icon: IconCalendar },
  { href: "/dashboard/tools", label: "도구", Icon: IconTools },
] as const;

export function MobileTopbar() {
  return (
    <header className="sticky top-0 z-30 flex h-12 items-center justify-between gap-2 border-b border-[var(--color-line)] bg-[var(--color-bg)]/85 px-3 backdrop-blur-md md:hidden">
      <div className="flex items-center gap-1">
        <MobileDrawer />
        <Link href="/dashboard" className="flex items-center gap-2 px-1">
          <div className="relative flex h-5 w-5 items-center justify-center overflow-hidden rounded-[6px] bg-[var(--color-fg-strong)]">
            <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
            <span className="relative wght-700 text-[9.5px] text-white">a</span>
          </div>
          <span className="wght-560 kerning-tight text-[14px] text-[var(--color-fg-strong)]">
            arch
          </span>
        </Link>
      </div>
      <SearchTrigger variant="icon" />
    </header>
  );
}

export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="sticky bottom-0 z-30 border-t border-[var(--color-line)] bg-[var(--color-bg)]/95 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex h-14 items-stretch">
        {NAV.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cn(
                  "group relative flex h-full min-h-[44px] flex-col items-center justify-center gap-0.5 transition-colors",
                  "active:bg-[var(--color-surface)]",
                  active
                    ? "wght-560 text-[var(--color-fg-strong)]"
                    : "wght-450 text-[var(--color-fg-subtle)]"
                )}
                aria-current={active ? "page" : undefined}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute left-1/2 top-0 h-[2px] w-7 -translate-x-1/2 rounded-b-full bg-[var(--color-fg-strong)]"
                  />
                )}
                <Icon active={active} />
                <span className="text-[10px] kerning-tight">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
