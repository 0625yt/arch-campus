"use client";

import Link from "next/link";
import type { EventView } from "@/lib/data/events";
import type { CourseListItem } from "@/lib/data/materials";
import type { SafetySignal } from "@/lib/data/semester-safety";
import { formatEventLabel } from "@/lib/format-event";
import { kstStartOfDay } from "@/lib/kst";

/**
 * Dashboard 하단 3-카드 strip — 한 화면 fit fold의 마지막 라인.
 *
 *   [긴급 신호]  [다음 일정]  [강의 진척]
 *
 * 각 카드는 컴팩트한 readout 톤. 클릭하면 해당 영역(today/calendar/study)로 이동.
 */
export function BottomCards({
  signals,
  events,
  courses,
}: {
  signals: SafetySignal[];
  events: EventView[];
  courses: CourseListItem[];
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <UrgentCard signal={signals[0] ?? null} />
      <NextEventCard event={events[0] ?? null} />
      <CoursesCard courses={courses} />
    </div>
  );
}

/* ─────────────────────────── Urgent Signal ─────────────────────────── */

function UrgentCard({ signal }: { signal: SafetySignal | null }) {
  if (!signal) {
    return (
      <BaseCard href="/dashboard/today" label="긴급 신호" tone="muted" title="이상 없음" meta="" />
    );
  }
  const tone: CardTone =
    signal.tone === "urgent" ? "urgent" : signal.tone === "warn" ? "warn" : "muted";
  return (
    <BaseCard
      href={signal.href}
      label={signal.label}
      tone={tone}
      title={signal.title}
      meta={signal.reason}
    />
  );
}

/* ─────────────────────────── Next Event ─────────────────────────── */

function NextEventCard({ event }: { event: EventView | null }) {
  if (!event) {
    return (
      <BaseCard
        href="/dashboard/calendar"
        label="다음 일정"
        tone="muted"
        title="일정 없음"
        meta="강의계획서로 자동 등록"
      />
    );
  }
  const today = kstStartOfDay();
  const startMs = new Date(event.startsAt).getTime();
  const days = Math.round((startMs - today.getTime()) / 86400000);
  const dDay = days === 0 ? "오늘" : days < 0 ? `D+${-days}` : `D-${days}`;
  const tone: CardTone = days <= 1 ? "warn" : "calm";
  return (
    <BaseCard
      href="/dashboard/calendar"
      label="다음 일정"
      tone={tone}
      title={formatEventLabel(event)}
      meta={`${dDay} · ${formatTime(event)}`}
    />
  );
}

function formatTime(event: EventView): string {
  const d = new Date(event.startsAt);
  if (!Number.isFinite(d.getTime())) return "";
  if (event.allDay) return "하루 종일";
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/* ─────────────────────────── Courses ─────────────────────────── */

function CoursesCard({ courses }: { courses: CourseListItem[] }) {
  const semester = courses.filter((c) => c.category === "semester");
  const total = semester.length;
  if (total === 0) {
    return (
      <BaseCard
        href="/dashboard/study"
        label="강의"
        tone="muted"
        title="강의 없음"
        meta="강의계획서 한 장으로 시작"
      />
    );
  }
  const withMaterials = semester.filter((c) => c.materialCount > 0).length;
  const pct = Math.round((withMaterials / total) * 100);
  return (
    <BaseCard
      href="/dashboard/study"
      label="강의"
      tone="calm"
      title={`${total}개 강의 진행`}
      meta={`${withMaterials}/${total} 자료 등록 · ${pct}%`}
      progress={pct}
    />
  );
}

/* ─────────────────────────── Base Card ─────────────────────────── */

type CardTone = "urgent" | "warn" | "calm" | "muted";

function toneStyles(tone: CardTone): {
  label: string;
  ring: string;
  glow?: string;
} {
  switch (tone) {
    case "urgent":
      return {
        label: "text-[var(--color-urgent)]",
        ring: "ring-1 ring-[var(--color-urgent)]/22",
        glow: "linear-gradient(135deg, rgba(224,68,94,0.04), transparent 60%)",
      };
    case "warn":
      return {
        label: "text-[#cc7a30]",
        ring: "ring-1 ring-[#cc7a30]/22",
        glow: "linear-gradient(135deg, rgba(204,122,48,0.04), transparent 60%)",
      };
    case "calm":
      return {
        label: "text-[var(--color-apple-action)]",
        ring: "ring-1 ring-[var(--color-apple-action)]/18",
        glow: "linear-gradient(135deg, rgba(0,113,227,0.04), transparent 60%)",
      };
    case "muted":
      return {
        label: "text-[var(--color-apple-muted)]",
        ring: "ring-1 ring-[var(--color-apple-hairline-soft)]",
      };
  }
}

function BaseCard({
  href,
  label,
  tone,
  title,
  meta,
  progress,
}: {
  href: string;
  label: string;
  tone: CardTone;
  title: string;
  meta: string;
  progress?: number;
}) {
  const s = toneStyles(tone);
  return (
    <Link
      href={href}
      className={`spring-press group relative flex flex-col justify-between overflow-hidden rounded-[14px] bg-white px-4 py-3.5 transition-all hover:-translate-y-px ${s.ring}`}
      style={{
        backgroundImage: s.glow,
        backgroundRepeat: "no-repeat",
        backgroundSize: "100% 100%",
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={`text-[10px] uppercase wght-620 ${s.label}`}
          style={{ letterSpacing: "0.08em" }}
        >
          {label}
        </span>
        <span
          aria-hidden
          className="text-[12px] text-[var(--color-apple-muted)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--color-apple-ink)]"
        >
          ›
        </span>
      </div>
      <div className="mt-1.5 min-w-0">
        <p
          className="line-clamp-1 text-[14px] wght-620 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {title}
        </p>
        <p
          className="mt-0.5 line-clamp-1 text-[11.5px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {meta}
        </p>
      </div>
      {progress !== undefined && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--color-apple-pearl)]">
          <div
            className="h-full rounded-full bg-[var(--color-apple-action)] transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </Link>
  );
}
