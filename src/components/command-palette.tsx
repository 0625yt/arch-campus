"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/primitives";
import { COURSES, COURSE_COLOR } from "@/app/dashboard/study/data";
import { ACTIVITIES } from "@/app/dashboard/history/data";

/* ─────────── command types ─────────── */

type CommandKind = "이동" | "액션" | "최근";

interface Command {
  id: string;
  kind: CommandKind;
  label: string;
  hint?: string;
  /** 검색 매칭용 추가 키워드 */
  keywords?: string;
  /** 좌측 미니 라벨 (강의 이름, 위저드 카테고리 등) */
  meta?: string;
  /** 좌측 마커 색 (강의별 점) */
  dotColor?: string;
  /** Enter 시 동작 */
  run: () => void;
}

const PAGES: { href: string; label: string; hint: string }[] = [
  { href: "/dashboard/today", label: "Today", hint: "오늘 마감과 5분 학습" },
  { href: "/dashboard/study", label: "Study", hint: "강의별 자료와 문제" },
  { href: "/dashboard/calendar", label: "Calendar", hint: "학기 일정 + 강의계획서" },
  { href: "/dashboard/tools", label: "Tools", hint: "발표·과제·시험 위저드" },
  { href: "/dashboard/history", label: "히스토리", hint: "지금까지 활동 전체" },
];

const WIZARD_ACTIONS: { label: string; hint: string; href: string }[] = [
  {
    label: "발표자료 구조화",
    hint: "5단계 · 슬라이드 + 대본 + 예상 질문",
    href: "/dashboard/tools/presentation",
  },
  {
    label: "기출형 문제 만들기",
    hint: "내 자료로 객관식·주관식·서술형",
    href: "/dashboard/tools",
  },
  {
    label: "벼락치기 학습 계획",
    hint: "30분·1시간·3시간 시나리오",
    href: "/dashboard/tools",
  },
  {
    label: "리포트 구조 설계",
    hint: "본문 X. 목차와 가이드만",
    href: "/dashboard/tools",
  },
];

/* ─────────── component ─────────── */

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // 글로벌 단축키
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      // "/" 단축키 — 입력 중이 아닐 때만
      if (
        e.key === "/" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !isEditableTarget(e.target)
      ) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 열릴 때 input focus + 쿼리 초기화 + body scroll lock
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    setTimeout(() => inputRef.current?.focus(), 30);

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // 명령 빌드
  const allCommands = useMemo<Command[]>(() => {
    const list: Command[] = [];

    // 페이지 이동
    for (const p of PAGES) {
      list.push({
        id: `page:${p.href}`,
        kind: "이동",
        label: p.label,
        hint: p.hint,
        meta: "페이지",
        run: () => router.push(p.href),
      });
    }

    // 강의 이동
    for (const c of COURSES) {
      list.push({
        id: `course:${c.slug}`,
        kind: "이동",
        label: c.slug,
        hint: `${c.materials.length}개 자료 · ${c.professor}`,
        keywords: c.professor,
        meta: "강의",
        dotColor: COURSE_COLOR[c.slug],
        run: () => router.push(`/dashboard/study/${c.slug}`),
      });
    }

    // 자료 이동
    for (const c of COURSES) {
      for (const m of c.materials) {
        list.push({
          id: `material:${c.slug}:${m.id}`,
          kind: "이동",
          label: m.title,
          hint: m.oneLine,
          keywords: `${c.slug} ${m.unit ?? ""}`,
          meta: c.slug,
          dotColor: COURSE_COLOR[c.slug],
          run: () => router.push(`/dashboard/study/${c.slug}/${m.id}`),
        });
      }
    }

    // 액션 — 위저드
    for (const w of WIZARD_ACTIONS) {
      list.push({
        id: `action:${w.label}`,
        kind: "액션",
        label: w.label,
        hint: w.hint,
        meta: "위저드",
        run: () => router.push(w.href),
      });
    }

    // 최근 활동 — 5개
    for (const a of ACTIVITIES.slice(0, 5)) {
      list.push({
        id: `recent:${a.id}`,
        kind: "최근",
        label: a.title,
        hint: a.meta,
        keywords: a.course ?? "",
        meta: a.kind,
        dotColor: a.course
          ? COURSE_COLOR[a.course as keyof typeof COURSE_COLOR]
          : undefined,
        run: () => router.push(a.href),
      });
    }

    return list;
  }, [router]);

  // 필터링
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allCommands;
    return allCommands.filter((c) => {
      const hay =
        `${c.label} ${c.hint ?? ""} ${c.meta ?? ""} ${c.keywords ?? ""}`.toLowerCase();
      // 띄어쓰기로 나눈 모든 토큰이 다 포함돼야 함
      return q.split(/\s+/).every((t) => hay.includes(t));
    });
  }, [query, allCommands]);

  // 그룹화 (필터 후)
  const groups = useMemo(() => groupByKind(filtered), [filtered]);

  // activeIndex가 범위 벗어나지 않게
  useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(0);
  }, [filtered, activeIndex]);

  // 키보드 네비
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[activeIndex];
      if (cmd) {
        setOpen(false);
        cmd.run();
      }
    }
  };

  // 활성 항목으로 스크롤
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!mounted || !open) return null;

  let runningIndex = -1;

  const dialog = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="명령 팔레트"
      className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[10vh] sm:pt-[12vh]"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="닫기"
        onClick={() => setOpen(false)}
        tabIndex={-1}
        className="absolute inset-0 bg-[var(--color-fg-strong)]/30 backdrop-blur-[2px] fade-up"
      />

      {/* Panel */}
      <div
        className="relative w-full max-w-[600px] overflow-hidden rounded-2xl bg-[var(--color-bg)] shadow-[var(--shadow-lift)] fade-up"
        onKeyDown={onKeyDown}
      >
        {/* Search row */}
        <div className="flex items-center gap-3 border-b border-[var(--color-line)] px-4 py-3">
          <SearchIcon />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="강의·자료·위저드 검색하거나 어디로 갈지 입력하세요"
            className="flex-1 bg-transparent text-[14px] wght-450 kerning-tight text-[var(--color-fg)] placeholder:wght-380 placeholder:text-[var(--color-fg-disabled)] focus-visible:outline-none"
          />
          <Kbd>ESC</Kbd>
        </div>

        {/* Results */}
        <div
          ref={listRef}
          className="max-h-[60vh] overflow-y-auto overscroll-contain px-2 py-2"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-10 text-center">
              <p className="text-[13.5px] wght-560 kerning-tight text-[var(--color-fg)]">
                "{query}"에 해당하는 항목이 없어요
              </p>
              <p className="mt-1 text-[11.5px] wght-450 kerning-tight text-[var(--color-fg-muted)]">
                강의명·자료명·위저드 이름으로 다시 검색해보세요
              </p>
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.kind} className="mb-2 last:mb-0">
                <div className="px-3 pb-1 pt-2 text-[10px] wght-700 kerning-mono uppercase text-[var(--color-fg-subtle)]">
                  {g.kind}
                </div>
                <ul className="flex flex-col gap-px">
                  {g.items.map((c) => {
                    runningIndex++;
                    const idx = runningIndex;
                    const active = idx === activeIndex;
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          data-index={idx}
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => {
                            setOpen(false);
                            c.run();
                          }}
                          className={cn(
                            "group flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors",
                            active && "bg-[var(--color-surface)]",
                          )}
                        >
                          {/* dot */}
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                            {c.dotColor ? (
                              <span
                                aria-hidden
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ backgroundColor: c.dotColor }}
                              />
                            ) : (
                              <span
                                aria-hidden
                                className={cn(
                                  "h-1.5 w-1.5 rounded-full",
                                  active
                                    ? "bg-[var(--color-fg-muted)]"
                                    : "bg-[var(--color-fg-disabled)]",
                                )}
                              />
                            )}
                          </span>

                          {/* content */}
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="flex items-baseline gap-2">
                              <span className="truncate text-[13.5px] wght-560 kerning-tight text-[var(--color-fg-strong)]">
                                {c.label}
                              </span>
                              {c.meta && (
                                <span className="shrink-0 text-[10px] wght-560 kerning-mono uppercase text-[var(--color-fg-subtle)]">
                                  {c.meta}
                                </span>
                              )}
                            </span>
                            {c.hint && (
                              <span className="truncate text-[11.5px] wght-450 kerning-tight text-[var(--color-fg-muted)]">
                                {c.hint}
                              </span>
                            )}
                          </span>

                          {/* enter hint */}
                          {active && (
                            <span className="shrink-0 text-[10.5px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
                              <Kbd>↵</Kbd>
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center justify-between gap-3 border-t border-[var(--color-line)] px-4 py-2.5 text-[10.5px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              <span>이동</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>↵</Kbd>
              <span>선택</span>
            </span>
          </div>
          <span className="inline-flex items-center gap-1">
            <Kbd>{isMac() ? "⌘" : "Ctrl"}</Kbd>
            <Kbd>K</Kbd>
            <span>다시 열기</span>
          </span>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}

/* ─────────── helpers ─────────── */

function groupByKind(items: Command[]) {
  const order: CommandKind[] = ["이동", "액션", "최근"];
  return order
    .map((kind) => ({
      kind,
      items: items.filter((c) => c.kind === kind),
    }))
    .filter((g) => g.items.length > 0);
}

function isEditableTarget(t: EventTarget | null) {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    t.isContentEditable
  );
}

function isMac() {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className="shrink-0 text-[var(--color-fg-subtle)]"
    >
      <circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth={1.4} />
      <path
        d="M11 11l3 3"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
      />
    </svg>
  );
}
