"use client";

import { BookOpen, CalendarDays, Home, ListChecks, RotateCcw, Wrench } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLink, ProfileMenu } from "@/components/global-topbar";
import { SearchTrigger } from "@/components/search-trigger";
import { cn } from "@/lib/utils";
import styles from "./navigation.module.css";

// Six destinations stay independently reachable, with 44px touch targets at 320px.
const NAV = [
  { href: "/dashboard", label: "홈", Icon: Home },
  { href: "/dashboard/study", label: "공부", Icon: BookOpen },
  { href: "/dashboard/quiz", label: "내 문제", Icon: ListChecks },
  { href: "/dashboard/review", label: "복습", Icon: RotateCcw },
  { href: "/dashboard/calendar", label: "일정", Icon: CalendarDays },
  { href: "/dashboard/tools", label: "도구", Icon: Wrench },
] as const;

export function MobileTopbar() {
  return (
    <header
      className={cn(styles.topbar, "sticky top-0 z-40 md:hidden")}
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className={styles.mobileInner}>
        <BrandLink />
        <div className={styles.actions}>
          <SearchTrigger variant="icon" />
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}

export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="주 메뉴"
      className={cn(styles.mobileTabBar, "sticky bottom-0 z-30 md:hidden")}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className={styles.mobileTabs}>
        {NAV.map(({ href, label, Icon }) => {
          const active =
            pathname === href ||
            (href === "/dashboard"
              ? pathname === "/dashboard/chat"
              : pathname.startsWith(`${href}/`));
          return (
            <li key={href} className="min-w-0 flex-1">
              <Link
                href={href}
                className={styles.mobileTab}
                aria-current={active ? "page" : undefined}
              >
                <Icon aria-hidden size={20} strokeWidth={active ? 2.1 : 1.7} />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
