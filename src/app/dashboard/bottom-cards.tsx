"use client";

import Link from "next/link";
import type { EventView } from "@/lib/data/events";
import type { CourseListItem } from "@/lib/data/materials";
import type { SafetySignal } from "@/lib/data/semester-safety";
import { formatEventLabel } from "@/lib/format-event";
import { dateKeyToDayNumber, kstDateKey } from "@/lib/kst";

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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
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
      <BaseCard
        href="/dashboard/today"
        label="오늘의 우선순위"
        tone="muted"
        title="급한 일 없이 차분하게"
        meta="오늘 할 일 살펴보기"
      />
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
      statusDot
    />
  );
}

/* ─────────────────────────── Next Event ─────────────────────────── */

function NextEventCard({ event }: { event: EventView | null }) {
  if (!event) {
    return (
      <BaseCard
        href="/dashboard/calendar/import?kind=syllabus"
        label="다음 일정"
        tone="muted"
        title="다음 마감도 놓치지 않게"
        meta="강의계획서에서 가져오기"
      />
    );
  }
  const days =
    dateKeyToDayNumber(kstDateKey(event.startsAt)) - dateKeyToDayNumber(kstDateKey(new Date()));
  const dDay = days === 0 ? "오늘" : days < 0 ? `D+${-days}` : `D-${days}`;
  const tone: CardTone = days <= 1 ? "warn" : "calm";
  return (
    <BaseCard
      href="/dashboard/calendar"
      label="다음 일정"
      tone={tone}
      title={formatEventLabel(event)}
      meta={formatTime(event)}
      bigStat={dDay}
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
        title="첫 과목을 추가해 보세요"
        meta="과목별로 자료와 문제 모으기"
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
      meta={`${withMaterials}/${total} 자료 등록`}
      donut={pct}
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
        label: "text-[var(--color-apple-warn-ink)]",
        ring: "ring-1 ring-[var(--color-apple-warn-ink)]/22",
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
  statusDot,
  bigStat,
  donut,
}: {
  href: string;
  label: string;
  tone: CardTone;
  title: string;
  meta: string;
  statusDot?: boolean;
  bigStat?: string;
  donut?: number;
}) {
  const s = toneStyles(tone);
  return (
    <Link
      href={href}
      className={`spring-press elev-1 card-lift group relative flex min-h-[102px] flex-col justify-between overflow-hidden rounded-[12px] bg-white px-4 py-3.5 transition-all hover:-translate-y-0.5 ${s.ring}`}
      style={{
        backgroundImage: s.glow,
        backgroundRepeat: "no-repeat",
        backgroundSize: "100% 100%",
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={`flex items-center gap-1.5 text-[10px] uppercase wght-620 ${s.label}`}
          style={{ letterSpacing: "0.08em" }}
        >
          {statusDot && tone !== "muted" && (
            <span
              aria-hidden
              className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                tone === "urgent"
                  ? "bg-[var(--color-urgent)]"
                  : tone === "warn"
                    ? "bg-[var(--color-apple-warn-ink)]"
                    : "bg-[var(--color-apple-action)]"
              }`}
            />
          )}
          {label}
        </span>
        <span
          aria-hidden
          className="text-[15px] text-[var(--color-apple-muted)] transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-[var(--color-accent)]"
        >
          ↗
        </span>
      </div>
      <div className="mt-1.5 flex min-w-0 items-end justify-between gap-2">
        <div className="min-w-0">
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
        {bigStat && (
          <span
            className={`shrink-0 text-[22px] leading-none wght-700 tabular-nums ${s.label}`}
            style={{ letterSpacing: "-0.022em" }}
          >
            {bigStat}
          </span>
        )}
        {donut !== undefined && <DonutRing pct={donut} />}
      </div>
    </Link>
  );
}

/* ─────────────────────────── Donut Ring ─────────────────────────── */

function DonutRing({ pct }: { pct: number }) {
  const r = 11;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden className="-rotate-90 shrink-0">
      <title>자료 등록 비율</title>
      <circle
        className="ring-track"
        cx="14"
        cy="14"
        r={r}
        fill="none"
        stroke="var(--color-apple-hairline)"
        strokeWidth="3"
      />
      <circle
        cx="14"
        cy="14"
        r={r}
        fill="none"
        stroke="var(--color-apple-action)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
      />
    </svg>
  );
}
