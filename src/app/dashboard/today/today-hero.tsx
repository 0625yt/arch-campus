"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { EventView } from "@/lib/data/events";
import { formatEventHeading } from "@/lib/format-event";

/**
 * 오늘의 포커스 — 가장 임박한 시험·과제 카운트다운.
 * 1초 갱신은 24시간 안쪽일 때만 (의미 있는 단위 변화).
 */
export function TodayHero({
  focus,
  kindLabel,
  className,
}: {
  focus: EventView;
  kindLabel: Record<EventView["kind"], string>;
  className?: string;
}) {
  const target = new Date(focus.startsAt);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  let h = 0;
  let m = 0;
  let s = 0;
  let diffSec = 0;
  if (now) {
    diffSec = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
    h = Math.floor(diffSec / 3600);
    m = Math.floor((diffSec % 3600) / 60);
    s = diffSec % 60;
  }
  const days = now ? Math.floor((target.getTime() - now.getTime()) / 86400000) : 0;
  const within24h = diffSec > 0 && diffSec < 24 * 3600;
  const isUrgent = diffSec < 6 * 3600;

  const kindStyle = kindHeroStyle(focus.kind);

  return (
    <section className={className}>
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
        <span
          className="inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] wght-620"
          style={{
            backgroundColor: kindStyle.tintBg,
            color: kindStyle.tintInk,
            letterSpacing: "-0.012em",
          }}
        >
          {kindLabel[focus.kind]}
          {focus.weightPercent != null && ` · ${focus.weightPercent}%`}
        </span>
        <div
          className="flex items-baseline gap-2"
          style={{ color: isUrgent ? "var(--color-urgent)" : "var(--color-apple-ink)" }}
        >
          {within24h ? (
            <>
              <ClockCell value={h} unit="h" />
              <ClockCell value={m} unit="m" />
              <ClockCell value={s} unit="s" />
            </>
          ) : (
            <ClockCell value={Math.max(0, days)} unit="d" />
          )}
        </div>
      </div>

      <h1
        className="mt-6 text-[34px] leading-[1.07] wght-620 text-[var(--color-apple-ink)] sm:text-[48px] md:text-[56px]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {formatEventHeading(focus)}.
      </h1>
      {focus.courseName && (
        <p
          className="mt-3 text-[14px] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {focus.courseName}
          {focus.notes && (
            <span className="mx-2 text-[var(--color-apple-hairline)]">·</span>
          )}
          {focus.notes}
        </p>
      )}

      <div className="mt-7 flex flex-wrap gap-3">
        <Link
          href="/dashboard/calendar"
          className="inline-flex h-[44px] items-center rounded-full bg-[var(--color-apple-ink)] px-6 text-[14px] wght-560 text-white transition-all hover:opacity-90 active:scale-[0.97]"
        >
          캘린더에서 보기 →
        </Link>
      </div>
    </section>
  );
}

interface KindHeroStyle {
  tintBg: string;
  tintInk: string;
  dot: string;
}

function kindHeroStyle(kind: EventView["kind"]): KindHeroStyle {
  switch (kind) {
    case "exam":
      return {
        tintBg: "var(--color-tint-exam)",
        tintInk: "var(--color-tint-exam-ink)",
        dot: "var(--color-urgent)",
      };
    case "assignment":
      return {
        tintBg: "var(--color-tint-assign)",
        tintInk: "var(--color-tint-assign-ink)",
        dot: "#cca06b",
      };
    case "presentation":
      return {
        tintBg: "var(--color-tint-prez)",
        tintInk: "var(--color-tint-prez-ink)",
        dot: "var(--color-apple-action)",
      };
    case "class":
      return {
        tintBg: "var(--color-tint-class)",
        tintInk: "var(--color-tint-class-ink)",
        dot: "#7fb38c",
      };
    default:
      return {
        tintBg: "var(--color-tint-etc)",
        tintInk: "var(--color-tint-etc-ink)",
        dot: "#a08bc4",
      };
  }
}

function ClockCell({ value, unit }: { value: number; unit: string }) {
  return (
    <span className="flex items-baseline gap-1">
      <span
        className="text-[44px] wght-620 leading-none tabular-nums sm:text-[60px]"
        style={{ letterSpacing: "-0.024em" }}
      >
        {String(value).padStart(2, "0")}
      </span>
      <span className="text-[14px] wght-560 text-[var(--color-apple-muted)] sm:text-[16px]">
        {unit}
      </span>
    </span>
  );
}
