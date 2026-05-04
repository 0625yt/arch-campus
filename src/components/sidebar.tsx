"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SearchTrigger } from "@/components/search-trigger";
import {
  COURSES as STUDY_COURSES,
  COURSE_COLOR,
  getResumeMaterial,
} from "@/app/dashboard/study/data";

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
      <path d="M2.5 3.5h6.4c1 0 1.6.6 1.6 1.5v6.5H4.1c-.9 0-1.6-.7-1.6-1.6V3.5z" stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round" />
      <path d="M2.5 3.5v8h7.9" stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="2.2" y="3.4" width="9.6" height="8.4" rx="1.2" stroke="currentColor" strokeWidth={1.2} />
      <path d="M2.2 5.8h9.6" stroke="currentColor" strokeWidth={1.2} />
      <path d="M5 2.6v1.6M9 2.6v1.6" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" />
    </svg>
  );
}
function IconTools() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 11l4.2-4.2M9 4.5l1.5-1.5 1 1L10 5.5l-1-1z" stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round" />
      <circle cx="3" cy="11" r="1" stroke="currentColor" strokeWidth={1.2} />
    </svg>
  );
}
function IconNewChat() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2.5 4.5h7c.9 0 1.5.6 1.5 1.5v3.5L8.6 11.7H4c-.9 0-1.5-.6-1.5-1.5V4.5z" stroke="currentColor" strokeWidth={1.2} strokeLinejoin="round" />
      <path d="M5.5 7h3M7 5.5v3" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" />
    </svg>
  );
}
function IconHistory() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2.6 7a4.4 4.4 0 1 0 1.3-3.1" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" />
      <path d="M2.6 3.5v2.2h2.2" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 4.6V7l1.5 1" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const NAV = [
  { href: "/dashboard/today", label: "지금", Icon: IconToday },
  { href: "/dashboard/study", label: "공부", Icon: IconStudy },
  { href: "/dashboard/calendar", label: "레이더", Icon: IconCalendar },
  { href: "/dashboard/tools", label: "도구", Icon: IconTools },
] as const;

export function Sidebar() {
  return (
    <aside className="hidden h-screen-safe w-[228px] shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-surface)] md:flex">
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
          <span className="wght-560 kerning-tight text-[15px] text-[var(--color-fg-strong)]">
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
            "group flex w-full items-center gap-2.5 rounded-md border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2 text-[12.5px] kerning-tight transition-all duration-[var(--duration-fast)] hover:border-[var(--color-line-strong)] hover:shadow-[var(--shadow-soft)]",
            pathname === "/dashboard" || pathname === "/dashboard/chat"
              ? "wght-560 text-[var(--color-fg-strong)]"
              : "wght-450 text-[var(--color-fg-muted)] hover:text-[var(--color-fg-strong)]"
          )}
        >
          <IconNewChat />
          <span className="flex-1">내 캠퍼스</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-1">
        <SectionLabel>캠퍼스</SectionLabel>
        <ul className="mb-6 mt-1 space-y-px">
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
                    className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-full bg-[var(--color-fg-strong)]"
                  />
                )}
                <Link
                  href={href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md py-1.5 pl-4 pr-2 text-[13px] kerning-tight transition-colors duration-[var(--duration-fast)]",
                    active
                      ? "wght-560 text-[var(--color-fg-strong)]"
                      : "wght-450 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
                  )}
                >
                  <span
                    className={cn(
                      "transition-colors",
                      active ? "text-[var(--color-fg-strong)]" : "text-[var(--color-fg-subtle)]"
                    )}
                  >
                    <Icon active={active} />
                  </span>
                  <span className="flex-1">{label}</span>
                  {showSignalBadge && (
                    <span
                      title={`지금 신호 ${TODAY_SIGNAL_COUNT}건`}
                      className="inline-flex items-center gap-1 rounded-full bg-[var(--color-urgent-soft)] px-1.5 py-0.5 text-[9.5px] wght-700 kerning-mono tabular-nums text-[var(--color-urgent)]"
                    >
                      <span
                        aria-hidden
                        className="h-1 w-1 rounded-full bg-[var(--color-urgent)] pulse-dot"
                      />
                      {TODAY_SIGNAL_COUNT}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        <SectionLabel>활동</SectionLabel>
        <ul className="mt-1 space-y-px">
          <li className="relative">
            {(pathname === "/dashboard/history" ||
              pathname.startsWith("/dashboard/history/")) && (
              <span
                aria-hidden
                className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-full bg-[var(--color-fg-strong)]"
              />
            )}
            <Link
              href="/dashboard/history"
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 rounded-md py-1.5 pl-4 pr-2 text-[13px] kerning-tight transition-colors duration-[var(--duration-fast)]",
                pathname === "/dashboard/history" ||
                  pathname.startsWith("/dashboard/history/")
                  ? "wght-560 text-[var(--color-fg-strong)]"
                  : "wght-450 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
              )}
            >
              <span
                className={cn(
                  "transition-colors",
                  pathname === "/dashboard/history" ||
                    pathname.startsWith("/dashboard/history/")
                    ? "text-[var(--color-fg-strong)]"
                    : "text-[var(--color-fg-subtle)]"
                )}
              >
                <IconHistory />
              </span>
              히스토리
            </Link>
          </li>
        </ul>
      </nav>

      {/* 학기 진행률 — 미세하게 */}
      <SemesterProgress />

      {/* User — 글자 X, 그라데이션 원 */}
      <div className="border-t border-[var(--color-line)] px-3 py-3">
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-md p-1 text-left transition-colors hover:bg-white/60"
        >
          <Avatar />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] wght-560 kerning-tight text-[var(--color-fg-strong)]">
              윤태경
            </div>
            <div className="truncate text-[10.5px] wght-380 kerning-tight text-[var(--color-fg-subtle)]">
              컴퓨터공학과 · 3학년
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pt-2 text-[10px] wght-560 kerning-mono uppercase text-[var(--color-fg-subtle)]">
      {children}
    </div>
  );
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

  useEffect(() => {
    if (active) setOpen(true);
  }, [active]);

  return (
    <li className="relative">
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-full bg-[var(--color-fg-strong)]"
        />
      )}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md py-1.5 pl-4 pr-2 text-left text-[13px] kerning-tight transition-colors duration-[var(--duration-fast)]",
          active
            ? "wght-560 text-[var(--color-fg-strong)]"
            : "wght-450 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
        )}
      >
        <span
          className={cn(
            "transition-colors",
            active ? "text-[var(--color-fg-strong)]" : "text-[var(--color-fg-subtle)]",
          )}
        >
          <IconStudy />
        </span>
        <span className="flex-1">공부</span>
        <span
          aria-hidden
          className={cn(
            "text-[10px] text-[var(--color-fg-subtle)] transition-transform",
            open && "rotate-90",
          )}
        >
          →
        </span>
      </button>

      <ul className={cn("pb-1 pl-[34px] pt-1", open ? "block" : "hidden")}>
        {STUDY_COURSES.map((course) => {
          const courseActive =
            pathname.startsWith(`/dashboard/study/${course.slug}`) ||
            pathname.startsWith(`/dashboard/study/${encodeURIComponent(course.slug)}`);
          const href = `/dashboard/study/${course.slug}`;
          const resume = getResumeMaterial(course.slug);
          const done = course.materials.reduce((sum, m) => sum + m.problems.done, 0);
          const total = course.materials.reduce((sum, m) => sum + m.problems.total, 0);

          return (
            <li key={course.slug}>
              <Link
                href={href}
                onClick={onNavigate}
                title={resume ? `최근 자료: ${resume.title}` : undefined}
                className={cn(
                  "group/course flex items-center gap-2 rounded-md py-1.5 pl-1 pr-2 text-[12px] kerning-tight transition-colors",
                  courseActive
                    ? "wght-560 text-[var(--color-fg-strong)]"
                    : "wght-450 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]",
                )}
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: COURSE_COLOR[course.slug] }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{course.slug}</span>
                {total > 0 && (
                  <span className="shrink-0 text-[9.5px] wght-450 kerning-mono tabular-nums text-[var(--color-fg-subtle)]">
                    {done}/{total}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </li>
  );
}

function Logo() {
  return (
    <div className="relative flex h-6 w-6 items-center justify-center overflow-hidden rounded-[7px] bg-[var(--color-fg-strong)]">
      {/* 미세한 하이라이트 — 단색 박스 X */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent"
      />
      <span className="relative wght-700 kerning-tight text-[10px] text-white">
        a
      </span>
    </div>
  );
}

function SemesterProgress() {
  const pct = SEMESTER.weekCurrent / SEMESTER.weekTotal;
  return (
    <div className="border-t border-[var(--color-line)] px-4 pt-3 pb-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] wght-700 kerning-mono uppercase text-[var(--color-fg-subtle)]">
          {SEMESTER.label}
        </span>
        <span className="text-[10px] wght-560 kerning-mono tabular-nums text-[var(--color-fg-muted)]">
          {SEMESTER.weekCurrent}/{SEMESTER.weekTotal}주차
        </span>
      </div>
      <span
        aria-hidden
        className="relative mt-2 block h-px w-full overflow-hidden bg-[var(--color-line-strong)]"
      >
        <span
          className="absolute inset-y-0 left-0 bg-[var(--color-fg-strong)]"
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
        background:
          "radial-gradient(circle at 30% 30%, #f0a8c0 0%, #c785b0 38%, #6a4a8a 100%)",
      }}
    />
  );
}
