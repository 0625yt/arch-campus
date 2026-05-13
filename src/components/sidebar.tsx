"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SearchTrigger } from "@/components/search-trigger";
import { cn } from "@/lib/utils";

interface SidebarCourse {
  id: string;
  name: string;
  color: string | null;
  materialCount: number;
}

/* 학기 정보 mock — 추후 user state로 대체 */
const SEMESTER = {
  label: "2026 봄학기",
  weekCurrent: 5,
  weekTotal: 15,
};

/* 지금 신호 — Today 페이지 hero와 동기화. mock이라 일단 1개 */
const TODAY_SIGNAL_COUNT = 1;

/* 우리 자체 mini icons — lucide 안 쓰고 SVG 직접. AI 티 회피. */

function IconToday({ active }: { active?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle
        cx="7"
        cy="7"
        r="2.2"
        stroke="currentColor"
        strokeWidth={active ? 1.6 : 1.3}
        fill={active ? "currentColor" : "none"}
      />
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth={1.1} opacity={0.4} />
    </svg>
  );
}
function IconStudy() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2.5 3.5h6.4c1 0 1.6.6 1.6 1.5v6.5H4.1c-.9 0-1.6-.7-1.6-1.6V3.5z"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      <path d="M2.5 3.5v8h7.9" stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect
        x="2.2"
        y="3.4"
        width="9.6"
        height="8.4"
        rx="1.2"
        stroke="currentColor"
        strokeWidth={1.2}
      />
      <path d="M2.2 5.8h9.6" stroke="currentColor" strokeWidth={1.2} />
      <path
        d="M5 2.6v1.6M9 2.6v1.6"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinecap="round"
      />
    </svg>
  );
}
function IconTools() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M3 11l4.2-4.2M9 4.5l1.5-1.5 1 1L10 5.5l-1-1z"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      <circle cx="3" cy="11" r="1" stroke="currentColor" strokeWidth={1.2} />
    </svg>
  );
}
function IconNewChat() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2.5 4.5h7c.9 0 1.5.6 1.5 1.5v3.5L8.6 11.7H4c-.9 0-1.5-.6-1.5-1.5V4.5z"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      <path d="M5.5 7h3M7 5.5v3" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" />
    </svg>
  );
}
function IconReview() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M3 3.5h6.5c.8 0 1.5.7 1.5 1.5v5.5L7.5 8H3V3.5z"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      <circle cx="7" cy="6" r=".7" fill="currentColor" />
      <circle cx="9.2" cy="6" r=".7" fill="currentColor" />
      <circle cx="4.8" cy="6" r=".7" fill="currentColor" />
    </svg>
  );
}
function IconHistory() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M2.6 7a4.4 4.4 0 1 0 1.3-3.1"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinecap="round"
      />
      <path
        d="M2.6 3.5v2.2h2.2"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 4.6V7l1.5 1"
        stroke="currentColor"
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const NAV = [
  { href: "/dashboard/today", label: "지금", Icon: IconToday },
  { href: "/dashboard/study", label: "공부", Icon: IconStudy },
  { href: "/dashboard/review", label: "복습", Icon: IconReview },
  { href: "/dashboard/calendar", label: "일정", Icon: IconCalendar },
  { href: "/dashboard/tools", label: "도구", Icon: IconTools },
  { href: "/dashboard/history", label: "기록", Icon: IconHistory },
] as const;

export function Sidebar() {
  return (
    <aside className="hidden h-screen-safe w-[228px] shrink-0 flex-col border-r border-[var(--color-apple-hairline)] bg-white md:flex">
      <SidebarBody />
    </aside>
  );
}

/**
 * 사이드바 내용. 데스크톱 aside / 모바일 drawer 양쪽에서 같은 마크업 재사용.
 * @param onNavigate - 모바일 drawer에서 link 클릭 시 drawer 닫기 콜백
 */
export function SidebarBody({ onNavigate }: { onNavigate?: () => void } = {}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      {/* Wordmark — 클릭 시 시작 화면으로 */}
      <div className="flex h-14 items-center px-5">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex items-center gap-2 transition-opacity hover:opacity-70"
        >
          <Logo />
          <span
            className="text-[15px] wght-620 text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            arch
          </span>
        </Link>
      </div>

      {/* Cmd+K 진입점 */}
      <div className="px-3 pb-2">
        <SearchTrigger variant="sidebar" />
      </div>

      {/* 대시보드 진입점 */}
      <div className="px-3 pb-3">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-[10px] border border-[var(--color-apple-hairline)] px-3 py-2 text-[12.5px] transition-colors",
            pathname === "/dashboard" || pathname === "/dashboard/chat"
              ? "wght-620 bg-[var(--color-apple-pearl)] text-[var(--color-apple-ink)]"
              : "wght-450 bg-white text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]",
          )}
          style={{ letterSpacing: "-0.012em" }}
        >
          <IconNewChat />
          <span className="flex-1">내 캠퍼스</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-1">
        <SectionLabel>학습</SectionLabel>
        <ul className="mb-6 mt-2 space-y-px">
          {NAV.map(({ href, label, Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            const showSignalBadge = href === "/dashboard/today" && TODAY_SIGNAL_COUNT > 0;
            if (href === "/dashboard/study") {
              return (
                <StudyNavItem
                  key={href}
                  active={active}
                  onNavigate={onNavigate}
                  pathname={pathname}
                />
              );
            }
            return (
              <li key={href} className="relative">
                {active && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-full bg-[var(--color-apple-action)]"
                  />
                )}
                <Link
                  href={href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-2.5 rounded-[8px] py-1.5 pl-4 pr-2 text-[13px] transition-colors",
                    active
                      ? "wght-620 bg-[var(--color-apple-pearl)] text-[var(--color-apple-ink)]"
                      : "wght-450 text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]",
                  )}
                  style={{ letterSpacing: "-0.012em" }}
                >
                  <span
                    className={cn(
                      "transition-colors",
                      active
                        ? "text-[var(--color-apple-action)]"
                        : "text-[var(--color-apple-muted)]",
                    )}
                  >
                    <Icon active={active} />
                  </span>
                  <span className="flex-1">{label}</span>
                  {showSignalBadge && (
                    <span
                      title={`지금 신호 ${TODAY_SIGNAL_COUNT}건`}
                      className="inline-flex items-center gap-1 rounded-full bg-[#fff0f3] px-1.5 py-0.5 text-[10px] wght-620 tabular-nums text-[#e0445e]"
                    >
                      <span aria-hidden className="h-1 w-1 rounded-full bg-[#e0445e] pulse-dot" />
                      {TODAY_SIGNAL_COUNT}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* 학기 진행률 — 미세하게 */}
      <SemesterProgress />

      <UserCard />
    </div>
  );
}

function UserCard() {
  const [profile, setProfile] = useState<{
    displayName: string | null;
    email: string | null;
    department: string | null;
    year: number | null;
  } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

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

  const name = profile?.displayName || profile?.email?.split("@")[0] || "사용자";
  const sub = profile?.department
    ? `${profile.department}${profile.year ? ` · ${profile.year}학년` : ""}`
    : profile?.email || "";

  return (
    <div className="relative border-t border-[var(--color-apple-hairline)] px-3 py-3">
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-[8px] p-1 text-left transition-colors hover:bg-[var(--color-apple-pearl)]"
      >
        <Avatar />
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-[12.5px] wght-560 text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {name}
          </div>
          <div
            className="truncate text-[10.5px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {sub}
          </div>
        </div>
      </button>

      {menuOpen && (
        <div className="absolute bottom-[58px] left-3 right-3 overflow-hidden rounded-[10px] border border-[var(--color-apple-hairline)] bg-white shadow-[0_4px_16px_rgba(0,0,0,0.06)]">
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="w-full px-3 py-2.5 text-left text-[12.5px] wght-450 text-[var(--color-apple-ink)] transition-colors hover:bg-[var(--color-apple-pearl)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              로그아웃
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pt-2 text-[10.5px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
      {children}
    </div>
  );
}

function useSidebarCourses(): SidebarCourse[] {
  const [courses, setCourses] = useState<SidebarCourse[]>([]);
  useEffect(() => {
    let aborted = false;
    fetch("/api/courses")
      .then((r) => r.json())
      .then((j) => {
        if (aborted) return;
        if (j?.ok && Array.isArray(j.courses)) setCourses(j.courses);
      })
      .catch(() => {
        // 사이드바는 강의 0개여도 메인 메뉴는 살아있어야 함 — 조용히 실패
      });
    return () => {
      aborted = true;
    };
  }, []);
  return courses;
}

function StudyNavItem({
  active,
  onNavigate,
  pathname,
}: {
  active: boolean;
  onNavigate?: () => void;
  pathname: string;
}) {
  const [open, setOpen] = useState(active);
  const courses = useSidebarCourses();

  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  return (
    <li className="relative">
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-full bg-[var(--color-apple-action)]"
        />
      )}
      <div
        className={cn(
          "flex w-full items-center gap-2.5 rounded-[8px] py-1.5 pl-4 pr-2 text-[13px] transition-colors",
          active
            ? "wght-620 bg-[var(--color-apple-pearl)] text-[var(--color-apple-ink)]"
            : "wght-450 text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]",
        )}
        style={{ letterSpacing: "-0.012em" }}
      >
        <Link
          href="/dashboard/study"
          onClick={onNavigate}
          className="flex flex-1 items-center gap-2.5 text-left"
        >
          <span
            className={cn(
              "transition-colors",
              active ? "text-[var(--color-apple-action)]" : "text-[var(--color-apple-muted)]",
            )}
          >
            <IconStudy />
          </span>
          <span className="flex-1">공부</span>
        </Link>
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? "강의 목록 접기" : "강의 목록 펼치기"}
          onClick={() => setOpen((value) => !value)}
          className="-mr-1 flex h-6 w-6 items-center justify-center rounded-[6px] text-[11px] text-[var(--color-apple-muted)] transition-colors hover:bg-white hover:text-[var(--color-apple-ink)]"
        >
          <span aria-hidden className={cn("transition-transform", open && "rotate-90")}>
            ›
          </span>
        </button>
      </div>

      <ul className={cn("pb-1 pl-[34px] pt-1", open ? "block" : "hidden")}>
        {courses.length === 0 ? (
          <li>
            <span
              className="block px-1.5 py-1.5 text-[11px] wght-450 text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              아직 강의가 없어요
            </span>
          </li>
        ) : (
          courses.map((course) => {
            const slug = encodeURIComponent(course.name);
            const courseActive =
              pathname.startsWith(`/dashboard/study/${course.name}`) ||
              pathname.startsWith(`/dashboard/study/${slug}`);
            const href = `/dashboard/study/${slug}`;

            return (
              <li key={course.id}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-2 rounded-[6px] py-1.5 pl-1.5 pr-2 text-[12px] transition-colors",
                    courseActive
                      ? "wght-620 bg-[var(--color-apple-pearl)] text-[var(--color-apple-ink)]"
                      : "wght-450 text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]",
                  )}
                  style={{ letterSpacing: "-0.012em" }}
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: course.color ?? "#7aa6d6" }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{course.name}</span>
                  {course.materialCount > 0 && (
                    <span className="shrink-0 text-[10px] wght-560 tabular-nums text-[var(--color-apple-muted)]">
                      {course.materialCount}
                    </span>
                  )}
                </Link>
              </li>
            );
          })
        )}
      </ul>
    </li>
  );
}

function Logo() {
  return (
    <div
      aria-hidden
      className="relative flex h-6 w-6 items-center justify-center overflow-hidden rounded-[7px] bg-[var(--color-apple-action)]"
    >
      <div className="absolute inset-x-1 top-1 h-px rounded-full bg-white/45" />
      <span className="relative text-[10px] wght-620 text-white">a</span>
    </div>
  );
}

function SemesterProgress() {
  const pct = SEMESTER.weekCurrent / SEMESTER.weekTotal;
  return (
    <div className="border-t border-[var(--color-apple-hairline)] px-4 pt-3 pb-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10.5px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
          {SEMESTER.label}
        </span>
        <span className="text-[10.5px] wght-560 tabular-nums text-[var(--color-apple-muted)]">
          {SEMESTER.weekCurrent}/{SEMESTER.weekTotal}주차
        </span>
      </div>
      <span
        aria-hidden
        className="relative mt-2 block h-1 w-full overflow-hidden rounded-full bg-[var(--color-apple-hairline)]"
      >
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-apple-action)]"
          style={{ width: `${pct * 100}%` }}
        />
      </span>
    </div>
  );
}

function Avatar() {
  // 글자·이니셜 X. 미묘한 그라데이션. 3종 중 hash로 골라도 되지만 일단 한 종.
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
