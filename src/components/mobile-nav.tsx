"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SearchTrigger } from "@/components/search-trigger";
import { cn } from "@/lib/utils";

/* 자체 SVG icons — Apple iOS bottom-tab 톤 */
function IconHome({ active }: { active?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <title>홈</title>
      <path
        d="M4.4 9.2 10 4.4l5.6 4.8v6c0 .9-.7 1.6-1.6 1.6H6c-.9 0-1.6-.7-1.6-1.6v-6z"
        stroke="currentColor"
        strokeWidth={active ? 1.7 : 1.4}
        strokeLinejoin="round"
      />
      <path
        d="M8 16.8v-4.5h4v4.5"
        stroke="currentColor"
        strokeWidth={active ? 1.7 : 1.4}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconToday({ active }: { active?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <title>지금</title>
      <circle
        cx="10"
        cy="10"
        r="2.8"
        stroke="currentColor"
        strokeWidth={active ? 1.7 : 1.4}
        fill={active ? "currentColor" : "none"}
      />
      <circle
        cx="10"
        cy="10"
        r="7"
        stroke="currentColor"
        strokeWidth={1.3}
        opacity={active ? 0.5 : 0.35}
      />
    </svg>
  );
}
function IconStudy({ active }: { active?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <title>공부</title>
      <path
        d="M4 5h8.5c1.2 0 2 .8 2 1.8v9.2H6c-1.1 0-2-.8-2-1.8V5z"
        stroke="currentColor"
        strokeWidth={active ? 1.7 : 1.4}
        strokeLinejoin="round"
      />
      <path
        d="M4 5v11h10.5"
        stroke="currentColor"
        strokeWidth={active ? 1.7 : 1.4}
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconCalendar({ active }: { active?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <title>일정</title>
      <rect
        x="3.4"
        y="5"
        width="13.2"
        height="11.4"
        rx="1.6"
        stroke="currentColor"
        strokeWidth={active ? 1.7 : 1.4}
      />
      <path d="M3.4 8.4h13.2" stroke="currentColor" strokeWidth={active ? 1.7 : 1.4} />
      <path
        d="M7.4 3.6v2.2M12.6 3.6v2.2"
        stroke="currentColor"
        strokeWidth={active ? 1.7 : 1.4}
        strokeLinecap="round"
      />
    </svg>
  );
}
function IconTools({ active }: { active?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <title>도구</title>
      <path
        d="M4.5 15.5l6-6M12.5 6.6l2.1-2.1 1.4 1.4-2.1 2.1-1.4-1.4z"
        stroke="currentColor"
        strokeWidth={active ? 1.7 : 1.4}
        strokeLinejoin="round"
      />
      <circle cx="4.5" cy="15.5" r="1.3" stroke="currentColor" strokeWidth={active ? 1.7 : 1.4} />
    </svg>
  );
}

const NAV = [
  { href: "/dashboard", label: "홈", Icon: IconHome },
  { href: "/dashboard/today", label: "지금", Icon: IconToday },
  { href: "/dashboard/study", label: "공부", Icon: IconStudy },
  { href: "/dashboard/calendar", label: "일정", Icon: IconCalendar },
  { href: "/dashboard/tools", label: "도구", Icon: IconTools },
] as const;

/**
 * iOS 노치 보호 + 단순 wordmark + 검색. 햄버거 제거 — bottom tab으로 흐름 통일.
 */
export function MobileTopbar() {
  return (
    <header
      className="sticky top-0 z-30 flex h-12 items-center justify-between gap-2 border-b border-[var(--color-apple-hairline-soft)] bg-white/85 px-3 backdrop-blur-xl md:hidden"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <Link href="/dashboard" className="flex items-center gap-2 px-1">
        <div className="relative flex h-5 w-5 items-center justify-center overflow-hidden rounded-[6px]">
          <div
            className="absolute inset-0"
            style={{
              background: "linear-gradient(135deg, #0071e3 0%, #4f7be8 55%, #8e7ee0 100%)",
            }}
          />
          <div className="absolute inset-x-1 top-0.5 h-px rounded-full bg-white/55" />
          <span className="relative wght-700 text-[9.5px] text-white">a</span>
        </div>
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
 * iOS Tab Bar — 5칸. 활성은 위에 짧은 ink 바.
 */
export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="sticky bottom-0 z-30 border-t border-[var(--color-apple-hairline-soft)] bg-white/92 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex h-14 items-stretch">
        {NAV.map(({ href, label, Icon }) => {
          const active =
            pathname === href ||
            (href === "/dashboard"
              ? pathname === "/dashboard/chat"
              : pathname.startsWith(href + "/"));
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
                <Icon active={active} />
                <span className="text-[10px]">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
