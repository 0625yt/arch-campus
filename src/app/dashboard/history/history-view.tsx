"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
          className="w-full rounded-full border border-[var(--color-apple-hairline-soft)] bg-white px-5 py-3 text-[14px] wght-450 text-[var(--color-apple-ink)] placeholder:wght-450 placeholder:text-[var(--color-apple-muted)] transition-colors hover:border-[var(--color-apple-hairline)] focus:border-[var(--color-apple-action)] focus-visible:outline-none"
          style={{ letterSpacing: "-0.012em" }}
        />
      </div>

      {/* 필터 */}
      <nav className="mt-5 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const active = filter === f;
          const count = f === "전체" ? activities.length : (counts[f as ActivityKind] ?? 0);
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={
                active
                  ? "inline-flex h-[32px] items-center gap-1.5 rounded-full bg-[var(--color-apple-ink)] px-3.5 text-[13px] wght-560 text-white"
                  : "inline-flex h-[32px] items-center gap-1.5 rounded-full border border-[var(--color-apple-hairline-soft)] bg-white px-3.5 text-[13px] wght-450 text-[var(--color-apple-muted)] transition-colors hover:border-[var(--color-apple-hairline)] hover:text-[var(--color-apple-ink)]"
              }
              style={{ letterSpacing: "-0.012em" }}
            >
              {f}
              <span
                className={
                  active
                    ? "tabular-nums text-white/60"
                    : "tabular-nums text-[var(--color-apple-muted)]"
                }
              >
                {count}
              </span>
            </button>
          );
        })}
      </nav>

      {/* 결과 */}
      {filtered.length === 0 ? (
        <Empty query={query} className="mt-12" />
      ) : (
        <div className="mt-8 flex flex-col gap-9">
          {groups.map((g) => (
            <div key={g.label}>
              <div className="flex items-baseline gap-2">
                <h3 className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
                  {g.label}
                </h3>
                <span
                  className="text-[11px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  {g.items.length}건
                </span>
              </div>
              <ul className="mt-3 overflow-hidden rounded-[12px] border border-[var(--color-apple-hairline)] bg-white">
                {g.items.map((a, idx) => (
                  <li
                    key={a.id}
                    className={
                      idx !== g.items.length - 1
                        ? "border-b border-[var(--color-apple-hairline-soft)]"
                        : ""
                    }
                  >
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
  const dotColor = activity.course
    ? COURSE_COLOR[activity.course as keyof typeof COURSE_COLOR]
    : undefined;

  return (
    <Link
      href={activity.href}
      className="group grid grid-cols-[60px_1fr_auto] items-center gap-4 px-5 py-[18px] transition-colors hover:bg-[var(--color-apple-pearl)] sm:grid-cols-[64px_1fr_auto] sm:gap-5 sm:px-7"
    >
      <span className="text-[11px] wght-450 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
        {activity.kind}
      </span>

      <span className="min-w-0">
        <span className="flex items-center gap-2">
          {dotColor && (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: dotColor }}
            />
          )}
          <span
            className="truncate text-[14px] leading-[1.3] wght-560 text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {activity.title}
          </span>
        </span>
        {activity.meta && (
          <span
            className="mt-1 block truncate text-[12px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.022em" }}
          >
            {activity.meta}
          </span>
        )}
        {activity.result && (
          <span
            className={`mt-1 inline-block text-[11px] wght-560 ${
              activity.result.tone === "good"
                ? "text-[var(--color-apple-success)]"
                : activity.result.tone === "bad"
                  ? "text-[var(--color-urgent)]"
                  : "text-[var(--color-apple-muted)]"
            }`}
            style={{ letterSpacing: "-0.012em" }}
          >
            {activity.result.label}
          </span>
        )}
      </span>

      <div className="flex shrink-0 items-center gap-2">
        <span
          suppressHydrationWarning
          className="text-[12px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {mounted ? relativeTime(activity.at) : ""}
        </span>
        <span className="text-[15px] text-[var(--color-apple-muted)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--color-apple-action)]">
          ›
        </span>
      </div>
    </Link>
  );
}

/* ─────────── empty ─────────── */

function Empty({ query, className }: { query: string; className?: string }) {
  return (
    <div className={`rounded-[18px] bg-white px-8 py-12 text-center ${className ?? ""}`}>
      <p
        className="text-[15px] wght-560 text-[var(--color-apple-ink)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {query ? `"${query}"에 해당하는 활동이 없어요` : "아직 활동이 없어요"}
      </p>
      <p
        className="mt-2 text-[13px] wght-450 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.022em" }}
      >
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
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 7);
  const startOfLastWeek = new Date(startOfToday);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 14);

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
