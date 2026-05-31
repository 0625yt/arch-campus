"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SearchTrigger } from "@/components/search-trigger";
import { cn } from "@/lib/utils";

/**
 * 글로벌 상단 nav — Apple Mail/Notes macOS 톤.
 * - 좌측: wordmark
 * - 가운데: segmented (지금/공부/일정/도구) — Apple System Preferences·Music 패턴
 * - 우측: 검색 칩 + 프로필 메뉴
 *
 * 사이드바를 대체. 사용자: "메뉴 빼고 애플처럼 그냥 똑같이 보여버려."
 * 모바일은 별도 MobileTabBar가 받음.
 */

const NAV = [
  { href: "/dashboard", label: "홈", exact: true },
  { href: "/dashboard/today", label: "지금" },
  { href: "/dashboard/study", label: "공부" },
  { href: "/dashboard/quiz", label: "내 문제" },
  { href: "/dashboard/review", label: "복습" },
  { href: "/dashboard/calendar", label: "일정" },
  { href: "/dashboard/tools", label: "도구" },
] as const;

const HOME_HREF = "/dashboard";

export function GlobalTopbar() {
  const pathname = usePathname();

  return (
    <header
      data-glass
      className="liquid-glass-bar sticky top-0 z-40 hidden border-b border-[var(--color-apple-hairline-soft)] md:block"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto flex h-11 max-w-[1440px] items-center gap-4 px-5 md:px-8 xl:px-10">
        <BrandMark />

        <div className="flex flex-1 justify-center">
          <SegmentedNav pathname={pathname} />
        </div>

        <div className="flex items-center gap-1.5">
          <SearchTrigger variant="icon" />
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}

function BrandMark() {
  return (
    <Link
      href={HOME_HREF}
      aria-label="홈"
      className="group flex items-center gap-2 rounded-[8px] px-1.5 py-1 opacity-90 transition-opacity hover:opacity-100"
    >
      <Logo />
      <span
        className="text-[14px] wght-620 text-[var(--color-apple-ink)]"
        style={{ letterSpacing: "-0.014em" }}
      >
        arch
      </span>
    </Link>
  );
}

/**
 * Apple System Settings·Music 헤더 톤의 segmented pill.
 * 활성 항목은 흰 캡슐 + 살짝 그림자.
 */
function SegmentedNav({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="주 메뉴"
      className="relative inline-flex items-center gap-0.5 rounded-full border border-[var(--color-apple-hairline-soft)] bg-[var(--color-apple-pearl)]/65 p-[3px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.04),inset_0_0_0_0.5px_rgba(255,255,255,0.7)]"
    >
      {NAV.map((item) => {
        const exact = "exact" in item && item.exact;
        const active = exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex h-7 items-center rounded-full px-2.5 text-[12px] transition-all duration-200 xl:px-3 xl:text-[12.5px]",
              active
                ? "wght-620 bg-white text-[var(--color-apple-ink)] shadow-[0_1px_3px_rgba(0,0,0,0.06),0_0_0_0.5px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.8)]"
                : "wght-560 text-[var(--color-apple-muted)] hover:bg-white/40 hover:text-[var(--color-apple-ink)]",
            )}
            style={{ letterSpacing: "-0.012em" }}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<{
    displayName: string | null;
    email: string | null;
    department: string | null;
    year: number | null;
  } | null>(null);

  useEffect(() => {
    let aborted = false;
    fetch("/api/profile")
      .then((r) => r.json())
      .then((j) => {
        if (aborted) return;
        if (j?.ok && j.profile) setProfile(j.profile);
      })
      .catch(() => {});
    return () => {
      aborted = true;
    };
  }, []);

  // 외부 클릭으로 닫기
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-profile-menu]")) setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const name = profile?.displayName || profile?.email?.split("@")[0] || "사용자";
  const sub = profile?.department
    ? `${profile.department}${profile.year ? ` · ${profile.year}학년` : ""}`
    : profile?.email || "";

  return (
    <div className="relative" data-profile-menu>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="프로필"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95"
      >
        <Avatar />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[44px] z-50 w-[244px] origin-top-right overflow-hidden rounded-[14px] border border-[var(--color-apple-hairline-soft)] bg-white/95 shadow-[0_8px_28px_-6px_rgba(0,0,0,0.18),0_2px_6px_-2px_rgba(0,0,0,0.08)] backdrop-blur-xl"
          style={{ animation: "scale-in 160ms ease-out both" }}
        >
          <div className="flex items-center gap-3 border-b border-[var(--color-apple-hairline-soft)] px-3.5 py-3">
            <Avatar />
            <div className="min-w-0 flex-1">
              <div
                className="truncate text-[13px] wght-620 text-[var(--color-apple-ink)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                {name}
              </div>
              <div className="truncate text-[11px] wght-450 text-[var(--color-apple-muted)]">
                {sub}
              </div>
            </div>
          </div>
          <MenuLink href="/dashboard/history" label="활동 기록" onSelect={() => setOpen(false)} />
          <MenuLink href="/dashboard/settings" label="설정" onSelect={() => setOpen(false)} />
          <div className="border-t border-[var(--color-apple-hairline-soft)]">
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="block w-full px-3.5 py-2.5 text-left text-[12.5px] wght-450 text-[var(--color-apple-ink)] transition-colors hover:bg-[var(--color-apple-pearl)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                로그아웃
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  label,
  onSelect,
}: {
  href: string;
  label: string;
  onSelect: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onSelect}
      className="block px-3.5 py-2 text-[12.5px] wght-450 text-[var(--color-apple-ink)] transition-colors hover:bg-[var(--color-apple-pearl)]"
      style={{ letterSpacing: "-0.012em" }}
    >
      {label}
    </Link>
  );
}

function Logo() {
  return (
    <div
      aria-hidden
      className="relative flex h-[22px] w-[22px] items-center justify-center overflow-hidden rounded-[7px]"
      style={{
        background: "linear-gradient(135deg, #0071e3 0%, #4f7be8 55%, #8e7ee0 100%)",
        boxShadow: "0 1px 2px rgba(0, 113, 227, 0.18)",
      }}
    >
      <div className="absolute inset-x-1 top-0.5 h-px rounded-full bg-white/55" />
      <span className="relative text-[10px] wght-700 text-white">a</span>
    </div>
  );
}

function Avatar() {
  return (
    <div
      aria-hidden
      className="h-7 w-7 shrink-0 rounded-full"
      style={{
        background: "radial-gradient(circle at 30% 30%, #f0a8c0 0%, #c785b0 38%, #6a4a8a 100%)",
      }}
    />
  );
}
