"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Arrow, Dot } from "@/components/primitives";
import { COURSE_COLOR } from "@/app/dashboard/study/data";
import type { Activity, ActivityKind } from "./data";

type Filter = "전체" | ActivityKind;

const FILTERS: Filter[] = ["전체", "문제", "위저드", "자료", "오답"];

export function HistoryView({
  activities,
  className,
}: {
  activities: Activity[];
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("전체");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activities.filter((a) => {
      if (filter !== "전체" && a.kind !== filter) return false;
      if (!q) return true;
      const hay = `${a.title} ${a.course ?? ""} ${a.meta ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [activities, query, filter]);

  const groups = useMemo(() => groupByTime(filtered), [filtered]);
  const counts = useMemo(() => countByKind(activities), [activities]);

  return (
    <section className={className}>
      {/* 검색 */}
      <div className="relative">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="자료·문제·위저드 검색"
          className="w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-bg)] px-4 py-3 text-[14px] wght-450 kerning-tight text-[var(--color-fg)] placeholder:wght-380 placeholder:text-[var(--color-fg-disabled)] focus:border-[var(--color-fg-disabled)] focus-visible:outline-none"
        />
      </div>

      {/* 필터 */}
      <nav className="mt-4 -mx-1 flex flex-wrap gap-x-1 gap-y-2">
        {FILTERS.map((f) => {
          const active = filter === f;
          const count = f === "전체" ? activities.length : counts[f as ActivityKind] ?? 0;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "inline-flex items-baseline gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] kerning-tight transition-colors",
                active
                  ? "wght-560 bg-[var(--color-fg-strong)] text-white"
                  : "wght-450 text-[var(--color-fg-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)]"
              )}
            >
              {f}
              <span
                className={cn(
                  "tabular-nums",
                  active ? "text-white/60" : "text-[var(--color-fg-subtle)]"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </nav>

      {/* 결과 */}
      {filtered.length === 0 ? (
        <Empty query={query} className="mt-10" />
      ) : (
        <div className="mt-8 flex flex-col gap-7">
          {groups.map((g) => (
            <div key={g.label}>
              <h3 className="text-[10.5px] wght-700 kerning-mono uppercase text-[var(--color-fg-subtle)]">
                {g.label}
                <span className="ml-2 wght-450 tabular-nums text-[var(--color-fg-disabled)]">
                  {g.items.length}건
                </span>
              </h3>
              <ul className="mt-2 border-t border-[var(--color-line)]">
                {g.items.map((a) => (
                  <li key={a.id}>
                    <Row activity={a} mounted={mounted} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ─────────── row ─────────── */

function Row({ activity, mounted }: { activity: Activity; mounted: boolean }) {
  return (
    <Link
      href={activity.href}
      className="row-shift group flex items-baseline gap-3 border-b border-[var(--color-line)] py-3 sm:py-3.5"
    >
      {/* kind label */}
      <span className="shrink-0 text-[10px] wght-700 kerning-mono uppercase tabular-nums text-[var(--color-fg-subtle)] sm:w-[52px]">
        {activity.kind}
      </span>

      {activity.course && (
        <span className="inline-flex shrink-0 items-center gap-1.5 sm:w-[88px]">
          <Dot color={COURSE_COLOR[activity.course as keyof typeof COURSE_COLOR]} size={5} />
          <span className="hidden text-[10.5px] wght-560 kerning-mono uppercase text-[var(--color-fg-subtle)] sm:inline">
            {activity.course}
          </span>
        </span>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13.5px] wght-500 kerning-tight text-[var(--color-fg)] group-hover:text-[var(--color-fg-strong)] sm:text-[14px]">
          {activity.title}
        </span>
        {activity.meta && (
          <span className="mt-0.5 truncate text-[11px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
            {activity.meta}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-baseline gap-2.5 self-baseline">
        {activity.result && (
          <span
            className={cn(
              "hidden text-[10.5px] wght-560 kerning-mono uppercase sm:inline",
              activity.result.tone === "good" && "text-[var(--color-success)]",
              activity.result.tone === "bad" && "text-[var(--color-urgent)]",
              activity.result.tone === "neutral" && "text-[var(--color-fg-subtle)]"
            )}
          >
            {activity.result.label}
          </span>
        )}
        <span
          suppressHydrationWarning
          className="text-[11px] wght-450 kerning-tight tabular-nums text-[var(--color-fg-subtle)]"
        >
          {mounted ? relativeTime(activity.at) : ""}
        </span>
        <Arrow className="reveal-right text-[12px] text-[var(--color-fg-subtle)]" />
      </div>
    </Link>
  );
}

/* ─────────── empty ─────────── */

function Empty({ query, className }: { query: string; className?: string }) {
  return (
    <div className={cn("py-10 text-center", className)}>
      <p className="text-[14px] wght-560 kerning-tight text-[var(--color-fg)]">
        {query ? `"${query}"에 해당하는 활동이 없어요` : "아직 활동이 없어요"}
      </p>
      <p className="mt-1.5 text-[12px] wght-450 kerning-tight text-[var(--color-fg-muted)]">
        {query
          ? "다른 키워드로 검색해보거나 필터를 바꿔보세요"
          : "강의 자료를 올려서 첫 활동을 시작해보세요"}
      </p>
    </div>
  );
}

/* ─────────── helpers ─────────── */

function relativeTime(d: Date) {
  const now = Date.now();
  const diff = Math.max(0, now - d.getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  if (day < 30) return `${Math.floor(day / 7)}주 전`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function groupByTime(items: Activity[]) {
  const now = new Date();
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday); startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday); startOfWeek.setDate(startOfWeek.getDate() - 7);
  const startOfLastWeek = new Date(startOfToday); startOfLastWeek.setDate(startOfLastWeek.getDate() - 14);

  const buckets: { label: string; items: Activity[] }[] = [
    { label: "오늘", items: [] },
    { label: "어제", items: [] },
    { label: "이번 주", items: [] },
    { label: "지난주", items: [] },
    { label: "이번 학기", items: [] },
  ];

  const sorted = [...items].sort((a, b) => b.at.getTime() - a.at.getTime());
  for (const a of sorted) {
    const t = a.at.getTime();
    if (t >= startOfToday.getTime()) buckets[0].items.push(a);
    else if (t >= startOfYesterday.getTime()) buckets[1].items.push(a);
    else if (t >= startOfWeek.getTime()) buckets[2].items.push(a);
    else if (t >= startOfLastWeek.getTime()) buckets[3].items.push(a);
    else buckets[4].items.push(a);
  }

  return buckets.filter((b) => b.items.length > 0);
}

function countByKind(items: Activity[]): Record<ActivityKind, number> {
  const result: Record<ActivityKind, number> = {
    문제: 0,
    위저드: 0,
    자료: 0,
    오답: 0,
  };
  for (const a of items) result[a.kind]++;
  return result;
}
