"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { WizardHistoryItem } from "@/lib/data/wizard-history";

/**
 * 위저드 페이지 좌측에 붙는 ChatGPT 스타일 사이드바.
 *
 * 정책:
 *  - 데스크톱(lg+): 좌측 사이드바, 열린 상태 기본. 토글 버튼으로 접고 펴기.
 *  - 모바일/태블릿(<lg): 평소 닫힘. 햄버거 버튼으로 오버레이로 등장.
 *  - 펼침/접힘 상태는 localStorage 영속 — 한 번 닫으면 다른 위저드에서도 닫혀있음.
 *  - 항목은 전체 위저드 결과 합쳐서 보여줌. 상단 탭으로 도구별 필터.
 *  - 0건이면 사이드바 자체 노출 X.
 *
 * 레이아웃: 사이드바는 fixed로 띄움 — 페이지 레이아웃을 흔들지 않기 위함.
 */

const STORAGE_KEY = "arch.wizardSidebar.open";

type TabKey = "all" | "presentation" | "report" | "exam";

const TABS: { key: TabKey; label: string; tools: string[] }[] = [
  { key: "all", label: "전체", tools: [] },
  { key: "presentation", label: "발표", tools: ["presentation"] },
  {
    key: "report",
    label: "리포트",
    tools: ["report-structure", "report-checklist", "wizard-assignment"],
  },
  { key: "exam", label: "시험", tools: ["wizard-cram"] },
];

export function WizardHistorySidebar({
  items,
  pageTitle,
}: {
  items: WizardHistoryItem[];
  /** 사이드바 헤더에 표시할 도구 이름 (예: "발표자료 구조화") */
  pageTitle: string;
}) {
  const [open, setOpen] = useState<boolean>(false);
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<TabKey>("all");

  const filtered = useMemo(() => {
    const active = TABS.find((t) => t.key === tab);
    if (!active || active.tools.length === 0) return items;
    const set = new Set(active.tools);
    return items.filter((it) => set.has(it.tool));
  }, [items, tab]);

  // SSR-safe: 첫 렌더 open=false → mount 후 viewport·localStorage 보고 결정.
  // 데스크톱(lg+)은 기본 열림 / 모바일·태블릿은 기본 닫힘. 모바일에서 페이지 열자마자
  // 오버레이가 깜빡 떴다 닫히는 깨짐 방지.
  useEffect(() => {
    setMounted(true);
    let initial: boolean;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === "0") initial = false;
      else if (raw === "1") initial = true;
      else initial = window.matchMedia("(min-width: 1024px)").matches;
    } catch {
      initial = window.matchMedia("(min-width: 1024px)").matches;
    }
    setOpen(initial);
  }, []);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* noop */
      }
      return next;
    });
  }

  if (items.length === 0) return null;
  // mount 전엔 통째로 안 그림 — 모바일에서 SSR open=true로 깜빡이는 문제 차단.
  // 데스크톱 첫 페이지 로드에서 약 1프레임 사이드바 비어보이는 건 hydration mismatch 회피값.
  if (!mounted) return null;

  return (
    <>
      {/* 모바일 오버레이 — 열렸을 때만 */}
      {open && (
        <button
          type="button"
          aria-label="사이드바 닫기"
          onClick={toggle}
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-[2px] lg:hidden"
        />
      )}

      {/* 사이드바 본체 — 우측 고정 (좌측은 대시보드 전역 사이드바가 차지) */}
      <aside
        className={`fixed top-0 right-0 z-40 h-screen border-l border-[var(--color-apple-hairline)] bg-white transition-[width,transform] duration-300 ease-out ${
          open ? "w-[280px] translate-x-0" : "w-[280px] translate-x-full lg:w-0 lg:translate-x-0"
        }`}
      >
        <div
          className={`flex h-full flex-col overflow-hidden transition-opacity duration-200 ${
            open ? "opacity-100" : "opacity-0 lg:pointer-events-none"
          }`}
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between gap-2 border-b border-[var(--color-apple-hairline)] px-4 py-3">
            <p
              className="truncate text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]"
              title={pageTitle}
            >
              {pageTitle}
            </p>
            <button
              type="button"
              onClick={toggle}
              aria-label="사이드바 닫기"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]"
            >
              {/* 우측 화살표 — 사이드바가 우측이라 닫으면 오른쪽으로 사라짐 */}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <title>아이콘</title>
                <path
                  d="M6 4l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          {/* 섹션 타이틀 + 전체 링크 */}
          <div className="flex items-baseline justify-between gap-2 px-4 pt-4 pb-2">
            <h2 className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
              이전에 만든 것
            </h2>
            <Link
              href="/dashboard/history"
              className="text-[11px] wght-450 text-[var(--color-apple-muted)] hover:text-[var(--color-apple-action)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              전체 ›
            </Link>
          </div>

          {/* 탭 필터 */}
          <div className="px-3 pb-2">
            <div className="flex items-center gap-0.5 rounded-[8px] bg-[var(--color-apple-pearl)] p-0.5">
              {TABS.map((t) => {
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={`flex-1 rounded-[6px] px-1.5 py-1 text-[11px] transition-all ${
                      active
                        ? "wght-620 bg-white text-[var(--color-apple-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                        : "wght-450 text-[var(--color-apple-muted)] hover:text-[var(--color-apple-ink)]"
                    }`}
                    style={{ letterSpacing: "-0.012em" }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 항목 리스트 — 스크롤. 필터링 결과 비면 빈 상태 안내 */}
          {filtered.length === 0 ? (
            <p
              className="px-5 pt-4 text-[12px] wght-450 leading-[1.6] text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              이 카테고리엔 아직 만든 게 없어요.
            </p>
          ) : (
            <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
              {filtered.map((it) => (
                <li key={it.id}>
                  <Link
                    href={it.href}
                    className="group block rounded-[10px] px-3 py-2.5 transition-colors hover:bg-[var(--color-apple-pearl)]"
                  >
                    <p
                      className="truncate text-[13px] wght-560 text-[var(--color-apple-ink)] group-hover:text-[var(--color-apple-action)]"
                      style={{ letterSpacing: "-0.012em" }}
                    >
                      {it.title}
                    </p>
                    <p
                      className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] wght-450 text-[var(--color-apple-muted)]"
                      style={{ letterSpacing: "-0.012em" }}
                    >
                      <span className="inline-flex h-4 shrink-0 items-center rounded-[4px] bg-[var(--color-apple-pearl)] px-1.5 text-[10px] wght-560 text-[var(--color-apple-ink)]">
                        {it.toolLabel}
                      </span>
                      <span className="truncate">
                        {it.detail ? `${it.detail} · ` : ""}
                        {formatRelative(it.createdAt)}
                      </span>
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* 펼치기 핸들 — 데스크톱(lg+) 전용. 우상단 36x36 아이콘 버튼. */}
      {!open && (
        <button
          type="button"
          onClick={toggle}
          aria-label="이전에 만든 것 열기"
          className="fixed top-4 right-4 z-40 hidden h-9 w-9 items-center justify-center rounded-[10px] border border-[var(--color-apple-hairline)] bg-white/95 text-[var(--color-apple-muted)] shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)] backdrop-blur-md transition-colors hover:border-[var(--color-apple-action)]/40 hover:text-[var(--color-apple-action)] lg:inline-flex"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <title>아이콘</title>
            <path
              d="M2.5 4h11M2.5 8h11M2.5 12h11"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}

      {/* 모바일·태블릿 전용 — 우하단 pill 버튼. MobileTabBar(h-14) 위에 떠서 겹치지 않게.
          MobileTopbar 검색 버튼과 충돌하는 우상단 위치를 피함. */}
      {!open && (
        <button
          type="button"
          onClick={toggle}
          aria-label="이전에 만든 것 열기"
          className="fixed right-4 bottom-[72px] z-40 inline-flex h-10 items-center gap-1.5 rounded-full border border-[var(--color-apple-hairline)] bg-white/95 px-3.5 text-[12px] wght-560 text-[var(--color-apple-ink)] shadow-[0_4px_12px_-2px_rgba(0,0,0,0.12)] backdrop-blur-md transition-colors hover:border-[var(--color-apple-action)]/40 hover:text-[var(--color-apple-action)] lg:hidden"
          style={{
            letterSpacing: "-0.012em",
            bottom: "calc(72px + env(safe-area-inset-bottom))",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden
            className="shrink-0 text-[var(--color-apple-muted)]"
          >
            <title>아이콘</title>
            <path
              d="M2.5 4h11M2.5 8h11M2.5 12h11"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          이전 기록 {items.length}
        </button>
      )}
    </>
  );
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const now = Date.now();
  const diffMs = now - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return d.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
  });
}
