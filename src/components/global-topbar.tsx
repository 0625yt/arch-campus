"use client";

import { ArrowUpRight, History, LogOut, Settings2, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { SearchTrigger } from "@/components/search-trigger";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import styles from "./navigation.module.css";

const NAV = [
  { href: "/dashboard", label: "홈" },
  { href: "/dashboard/study", label: "공부" },
  { href: "/dashboard/quiz", label: "내 문제" },
  { href: "/dashboard/review", label: "복습" },
  { href: "/dashboard/calendar", label: "일정" },
  { href: "/dashboard/tools", label: "도구" },
] as const;

export function GlobalTopbar() {
  const pathname = usePathname();

  return (
    <header
      className={cn(styles.topbar, "sticky top-0 z-40 hidden md:block")}
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className={styles.desktopInner}>
        <BrandLink />
        <nav aria-label="주 메뉴" className={styles.desktopNav}>
          {NAV.map(({ href, label }) => {
            const active =
              pathname === href ||
              (href === "/dashboard"
                ? pathname === "/dashboard/chat"
                : pathname.startsWith(`${href}/`));
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(styles.desktopTab, active && styles.activeTab)}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div className={styles.actions}>
          <SearchTrigger variant="compact" />
          <ThemeToggle className={styles.themeControl} />
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}

export function BrandLink() {
  return (
    <Link href="/dashboard" aria-label="arch 홈" className={styles.brand}>
      <span aria-hidden className={styles.brandMark}>
        <BrandMark size={26} monochrome />
      </span>
      <span className={styles.wordmark}>arch</span>
      <span className={styles.brandSuffix}>campus</span>
    </Link>
  );
}

type Profile = {
  displayName: string | null;
  email: string | null;
  department: string | null;
  year: number | null;
};

/** Desktop and mobile use the same account controls and keyboard behavior. */
export function ProfileMenu() {
  const pathname = usePathname();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const [openedOnPath, setOpenedOnPath] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const open = openedOnPath === pathname;

  useEffect(() => {
    if (openedOnPath && openedOnPath !== pathname) setOpenedOnPath(null);
  }, [openedOnPath, pathname]);

  useEffect(() => {
    if (!open) return;
    firstLinkRef.current?.focus();
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpenedOnPath(null);
    }
    function onFocusIn(event: FocusEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpenedOnPath(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpenedOnPath(null);
      triggerRef.current?.focus();
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    // A breakpoint change hides one bar. Do not leave its account panel open.
    const breakpoint = window.matchMedia("(min-width: 768px)");
    const close = () => setOpenedOnPath(null);
    breakpoint.addEventListener("change", close);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
      breakpoint.removeEventListener("change", close);
    };
  }, [open]);

  useEffect(() => {
    if (!open || profile) return;
    const controller = new AbortController();
    fetch("/api/profile", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        if (result?.ok && result.profile) setProfile(result.profile);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [open, profile]);

  const name = profile?.displayName || profile?.email?.split("@")[0] || "내 계정";
  const sub = profile?.department
    ? `${profile.department}${profile.year ? ` · ${profile.year}학년` : ""}`
    : profile?.email || "프로필과 서비스 설정";
  const initial = profile?.displayName?.slice(0, 1) || profile?.email?.slice(0, 1);

  return (
    <div ref={rootRef} className={styles.profile}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpenedOnPath(open ? null : pathname)}
        aria-label="내 계정"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className={styles.profileTrigger}
      >
        <span aria-hidden className={styles.avatar}>
          {initial || <UserRound size={17} strokeWidth={1.8} />}
        </span>
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-modal="false"
          aria-label="계정 메뉴"
          className={styles.profilePanel}
        >
          <div className={styles.profileHeader}>
            <span className={styles.profileEyebrow}>MY CAMPUS</span>
            <p className={styles.profileName}>{name}</p>
            <p className={styles.profileMeta}>{sub}</p>
          </div>
          <div className={styles.profileLinks}>
            <Link
              ref={firstLinkRef}
              href="/dashboard/settings"
              onClick={() => setOpenedOnPath(null)}
              className={styles.menuLink}
            >
              <Settings2 aria-hidden size={17} strokeWidth={1.7} />
              <span>프로필 및 설정</span>
              <ArrowUpRight aria-hidden size={15} className={styles.menuArrow} />
            </Link>
            <Link
              href="/dashboard/history"
              onClick={() => setOpenedOnPath(null)}
              className={styles.menuLink}
            >
              <History aria-hidden size={17} strokeWidth={1.7} />
              <span>활동 기록</span>
              <ArrowUpRight aria-hidden size={15} className={styles.menuArrow} />
            </Link>
          </div>
          <div className={styles.menuFooter}>
            <span>화면 테마</span>
            <ThemeToggle className={styles.themeControl} />
          </div>
          <form action="/auth/signout" method="post" className={styles.signout}>
            <button type="submit" className={styles.menuLink}>
              <LogOut aria-hidden size={17} strokeWidth={1.7} />
              <span>로그아웃</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
