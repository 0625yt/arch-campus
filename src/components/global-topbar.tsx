"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { inferSemester } from "@/lib/semester";
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

/*
 * NAV — Apple Mail / Music macOS 톤. "지금"은 홈(/dashboard)에 통합됐고,
 * 학습 큐(내 문제·복습)는 메인 segmented에서 살아남는다 (학생이 가장 자주 누름).
 */
const NAV = [
  { href: "/dashboard", label: "홈", exact: true },
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
      {/*
        Apple Music macOS toolbar 톤 — nav를 진짜 가운데로 (사용자 요청 2026-05-31).
          ┌─ Leading: brand
          ├─ flex spacer
          ├─ Center: SegmentedNav (absolute centered도 가능하지만 flex로 안정)
          ├─ flex spacer
          └─ Trailing cluster: 학기 · 테마 · 프로필
      */}
      <div className="mx-auto flex h-12 max-w-[1440px] items-center gap-3 px-5 md:px-8 xl:px-10">
        {/* Leading — brand */}
        <div className="flex flex-1 shrink-0 items-center">
          <BrandLink />
        </div>

        {/* Center — nav segmented (진짜 가운데) */}
        <div className="flex shrink-0 items-center justify-center">
          <SegmentedNav pathname={pathname} />
        </div>

        {/* Trailing cluster — meta · profile */}
        <div className="flex flex-1 shrink-0 items-center justify-end gap-2">
          <SemesterChip />
          <ThemeToggle />
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}

function BrandLink() {
  return (
    <Link
      href={HOME_HREF}
      aria-label="홈"
      className="group flex h-10 items-center gap-2 rounded-[8px] px-1.5 opacity-90 transition-opacity hover:opacity-100"
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
 * 학기·주차 chip — Apple Mail의 "Inbox · 12" 카운터 톤.
 * 사용자가 매번 보는 정보 (지금 몇 주차인지)를 nav에 영구적으로 박는다.
 */
function SemesterChip() {
  const sem = inferSemester();
  // 학기 첫날부터 경과 주차 계산 (1주차부터)
  const start = new Date(sem.termStart);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const week = Math.max(1, Math.min(16, Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1));

  return (
    <Link
      href="/dashboard/calendar"
      aria-label={`${sem.label} ${week}주차 — 캘린더로 이동`}
      className="group hidden items-center gap-1.5 rounded-full border border-[var(--color-apple-hairline-soft)] bg-[var(--color-apple-pearl)]/60 px-2.5 py-1 transition-colors hover:bg-[var(--color-apple-pearl)] lg:inline-flex"
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full bg-[var(--color-apple-action)]"
        style={{ boxShadow: "0 0 6px var(--color-apple-action)" }}
      />
      <span
        className="text-[11px] wght-560 text-[var(--color-apple-muted)] group-hover:text-[var(--color-apple-ink)]"
        style={{ letterSpacing: "-0.011em" }}
      >
        {sem.label}
      </span>
      <span
        aria-hidden
        className="text-[10px] wght-700 tabular-nums text-[var(--color-apple-muted)]/70"
      >
        ·
      </span>
      <span
        className="text-[11px] wght-700 tabular-nums text-[var(--color-apple-ink)]"
        style={{ letterSpacing: "-0.011em" }}
      >
        {week}주차
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
      className="segmented-nav relative inline-flex items-center gap-0.5 rounded-full border border-[var(--color-apple-hairline-soft)] p-[3px]"
    >
      {NAV.map((item) => {
        const exact = "exact" in item && item.exact;
        const active = exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "segmented-nav-item relative inline-flex h-9 items-center rounded-full px-2.5 text-[12px] transition-all duration-200 xl:px-3 xl:text-[12.5px]",
              active ? "is-active wght-620" : "is-idle wght-560",
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
        className="flex h-10 w-10 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95"
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
    <span
      aria-hidden
      className="inline-flex shrink-0"
      style={{ filter: "drop-shadow(0 1px 2px rgba(0, 113, 227, 0.18))" }}
    >
      <BrandMark size={22} />
    </span>
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
