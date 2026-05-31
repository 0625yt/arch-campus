"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { EventView } from "@/lib/data/events";
import { formatEventHeading, formatEventLabel } from "@/lib/format-event";

/**
 * 오늘의 포커스 — 가장 임박한 시험·과제 카운트다운.
 * 1초 갱신은 24시간 안쪽일 때만 (의미 있는 단위 변화).
 */
export function TodayHero({
  focus,
  nextEvent,
  kindLabel,
  className,
}: {
  focus: EventView;
  nextEvent: EventView | null;
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
  // D-day는 자정 기준 — 캘린더 Inspector의 D-day와 일치시킴. 시계 시각으로 자르면
  // "오늘 새벽 1시 시험"이 D-1로 보이는 어색함이 생김.
  const days = (() => {
    if (!now) return 0;
    const t = new Date(target);
    t.setHours(0, 0, 0, 0);
    const n = new Date(now);
    n.setHours(0, 0, 0, 0);
    return Math.round((t.getTime() - n.getTime()) / 86400000);
  })();
  const within24h = diffSec > 0 && diffSec < 24 * 3600;
  const isUrgent = diffSec < 6 * 3600;

  const kindStyle = kindHeroStyle(focus.kind);
  const dDayLabel = now ? (days === 0 ? "오늘" : days < 0 ? `D+${-days}` : `D-${days}`) : "";
  const reason = buildReason(focus, dDayLabel, within24h);
  const caution = focus.notes ?? fallbackCaution(focus.kind);
  const evidence = buildEvidence(focus);
  const startHref = startHrefFor(focus);
  const nextLabel = nextEvent
    ? `${formatEventLabel(nextEvent)} · ${formatSimpleWhen(nextEvent)}`
    : "끝나면 오답이나 방치 자료를 한 번만 확인";

  return (
    <section className={className}>
      <div
        className="relative overflow-hidden rounded-[20px] bg-white"
        style={{
          boxShadow:
            "0 1px 2px rgba(0,0,0,0.04), 0 20px 50px -28px rgba(0,0,0,0.22)",
          backgroundImage: `linear-gradient(135deg, ${kindStyle.tintBg} 0%, transparent 42%)`,
        }}
      >
        <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="px-5 py-5 sm:px-7 sm:py-6">
            <div className="flex items-baseline justify-between gap-3">
              <p
                className="flex items-baseline gap-2 text-[12px] wght-700 tabular-nums"
                style={{ letterSpacing: "-0.012em", color: kindStyle.dot }}
              >
                <span>지금 1개</span>
                <span className="text-[var(--color-apple-muted)] wght-450">
                  · {dDayLabel || "오늘"} · {kindLabel[focus.kind]}
                  {focus.weightPercent != null && ` · ${focus.weightPercent}%`}
                </span>
              </p>
            </div>

            <h1
              className="mt-3 text-[28px] leading-[1.05] wght-700 text-[var(--color-apple-ink)] sm:text-[36px] md:text-[42px]"
              style={{ letterSpacing: "-0.022em" }}
            >
              {formatEventHeading(focus)}
            </h1>

            <div className="mt-5 grid gap-2">
              <FactLine label="이유" value={reason} tone={kindStyle.tintInk} />
              <FactLine label="유의" value={caution} />
              <FactLine label="근거" value={evidence} />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Link
                href={startHref}
                className="spring-press inline-flex h-[40px] items-center rounded-full bg-[var(--color-apple-ink)] px-5 text-[13px] wght-700 text-white transition-all hover:opacity-90"
                style={{ letterSpacing: "-0.012em" }}
              >
                바로 시작
              </Link>
              <Link
                href="/dashboard/calendar"
                className="spring-press inline-flex h-[40px] items-center rounded-full bg-[var(--color-apple-pearl)] px-4 text-[12.5px] wght-620 text-[var(--color-apple-muted)] transition-colors hover:text-[var(--color-apple-ink)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                일정 보기
              </Link>
            </div>
          </div>

          <aside
            className="relative border-t border-[var(--color-apple-hairline-soft)] px-5 py-5 sm:px-7 sm:py-6 lg:border-l lg:border-t-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(248,249,251,0.92), rgba(255,255,255,0.98))",
            }}
          >
            <p
              className="text-[11px] wght-620 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]"
            >
              남은 시간
            </p>
            <div
              className={`mt-3 flex items-baseline gap-1.5 ${isUrgent ? "urgent-pulse" : ""}`}
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

            <div
              className="mt-5 rounded-[12px] border border-[var(--color-apple-hairline-soft)] bg-white px-3.5 py-3"
            >
              <p
                className="text-[10.5px] wght-700 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]"
              >
                이거 끝나면
              </p>
              <p
                className="mt-1.5 text-[13px] leading-[1.4] wght-620 text-[var(--color-apple-ink)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                {nextLabel}
              </p>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

function FactLine({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="grid grid-cols-[44px_1fr] gap-3">
      <span
        className="text-[12px] wght-700 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {label}
      </span>
      <span
        className="text-[14px] leading-[1.45] wght-560 text-[var(--color-apple-ink)]"
        style={{ letterSpacing: "-0.012em", color: tone }}
      >
        {value}
      </span>
    </div>
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

function buildReason(event: EventView, dDayLabel: string, within24h: boolean): string {
  const when = formatSimpleWhen(event);
  if (event.kind === "exam") return `${dDayLabel || "오늘"} 시험 · ${when}`;
  if (event.kind === "assignment")
    return within24h ? `오늘 마감 · ${when}` : `${dDayLabel} 마감 · ${when}`;
  if (event.kind === "presentation") return `${dDayLabel || "오늘"} 발표 · ${when}`;
  return `${dDayLabel || "오늘"} 일정 · ${when}`;
}

function fallbackCaution(kind: EventView["kind"]): string {
  switch (kind) {
    case "assignment":
      return "제출 파일명, 형식, LMS 제출 위치를 먼저 확인하세요";
    case "exam":
      return "새 범위보다 안 본 자료와 오답을 먼저 확인하세요";
    case "presentation":
      return "제출 자료와 발표 시간을 먼저 맞춰두세요";
    case "class":
      return "강의실·온라인 여부를 출발 전에 확인하세요";
    default:
      return "장소·시간·준비물을 먼저 확인하세요";
  }
}

function buildEvidence(event: EventView): string {
  if (event.sourceMaterialTitle) {
    const status = event.confirmed ? "확인됨" : "확인 필요";
    const confidence =
      event.confidence == null ? "" : ` · 확신도 ${Math.round(event.confidence * 100)}%`;
    return `${event.sourceMaterialTitle} · ${status}${confidence}`;
  }
  if (event.confidence != null && !event.confirmed) {
    return `자료 기반 후보 · 확신도 ${Math.round(event.confidence * 100)}%`;
  }
  return event.confirmed ? "사용자가 확인한 일정" : "직접 입력한 일정";
}

function startHrefFor(event: EventView): string {
  if (event.kind === "exam") return "/dashboard/tools/exam-cram";
  if (event.kind === "assignment" || event.kind === "presentation") {
    return event.courseName
      ? `/dashboard/study/${encodeURIComponent(event.courseName)}`
      : "/dashboard/tools/report-checklist";
  }
  if (event.courseName) return `/dashboard/study/${encodeURIComponent(event.courseName)}`;
  return "/dashboard/calendar";
}

function formatSimpleWhen(event: EventView): string {
  const date = new Date(event.startsAt);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (event.allDay) return `${month}/${day}`;
  return `${month}/${day} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/**
 * 카운트다운 셀 — 숫자가 바뀔 때 살짝 위로 올라오는 디지털 플립 톤.
 *
 * 구현: key를 display에 묶어 React가 값 변경 시 재마운트 → CSS 키프레임이 매번 재생.
 *
 * 폭: 최소 자릿수 보장을 위해 `min-width: {len}ch`. days가 D-30이면 두 자리,
 * D-365 같은 케이스에도 자릿수만큼 자동 확장. overflow-hidden은 빼서 잘림 방지.
 */
function ClockCell({ value, unit }: { value: number; unit: string }) {
  const display = String(value).padStart(2, "0");
  return (
    <span className="inline-flex items-baseline gap-0.5">
      <span
        key={display}
        className="clock-tick inline-block text-[32px] wght-620 leading-none tabular-nums sm:text-[40px]"
        style={{
          letterSpacing: "-0.024em",
          minWidth: `${display.length}ch`,
          textAlign: "right",
        }}
      >
        {display}
      </span>
      <span className="text-[12px] wght-560 text-[var(--color-apple-muted)] sm:text-[13px]">
        {unit}
      </span>
    </span>
  );
}
