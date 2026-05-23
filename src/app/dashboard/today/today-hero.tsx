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

  // Apple "MacBook Air" 카피 패턴 — 작은 라벨(eyebrow) → 큰 두 문장 헤드 → 코랄 한 줄 부제.
  // 카운트다운/CTA 같은 인터랙션은 헤드라인 아래로 옮겨 카피가 호흡할 공간을 만든다.
  //
  // 2026-05-23: eyebrow를 캘린더 Inspector "D-3 · 글로컬 영어 I" 한 줄 헤드라인 패턴으로 일관화.
  // kind 컬러로 강조, course 있으면 함께 노출. 정보 위계로 곧장 의미 전달.
  const dDayLabel = now ? (days === 0 ? "오늘" : days < 0 ? `D+${-days}` : `D-${days}`) : "";
  const headlineA = focus.courseName ?? formatEventHeading(focus);
  const headlineB = headlineCallout(focus.kind, isUrgent, within24h);
  const coralLine = focus.notes ?? formatEventHeading(focus);

  return (
    <section className={className}>
      {/* 1. eyebrow — "D-3 · 시험 · 20%" 한 줄. kind 컬러로 강조 (캘린더 Inspector 톤). */}
      <p
        className="flex items-baseline gap-2 text-[14px] wght-620 tabular-nums sm:text-[15px]"
        style={{ letterSpacing: "-0.012em", color: kindStyle.dot }}
      >
        {dDayLabel && <span>{dDayLabel}</span>}
        <span className="text-[var(--color-apple-muted)] wght-450">
          · {kindLabel[focus.kind]}
          {focus.weightPercent != null && ` · ${focus.weightPercent}%`}
        </span>
      </p>

      {/* 2. 큰 두 문장 헤드 — "강력하게. 비상하다." 자리 */}
      <h1
        className="mt-4 text-[40px] leading-[1.04] wght-700 text-[var(--color-apple-ink)] sm:text-[56px] md:text-[68px]"
        style={{ letterSpacing: "-0.022em" }}
      >
        {headlineA}.{" "}
        <span style={{ color: kindStyle.tintInk }}>{headlineB}</span>
      </h1>

      {/* 3. 코랄 한 줄 부제 — "이제 막강한 성능의 M5 탑재." 자리 */}
      {coralLine && coralLine !== headlineA && (
        <p
          className="mt-5 text-[15px] wght-620 sm:text-[17px]"
          style={{
            color: "var(--color-urgent)",
            letterSpacing: "-0.012em",
          }}
        >
          {coralLine}.
        </p>
      )}

      {/* 4. 카운트다운 + CTA — Apple 가격 + 구입하기 자리.
          urgent(6시간 이내)이면 카운트다운 전체가 미세 박동(urgent-pulse 유틸). */}
      <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4 sm:mt-14">
        <div
          className={`flex items-baseline gap-2 ${isUrgent ? "urgent-pulse" : ""}`}
          style={{
            color: isUrgent ? "var(--color-urgent)" : "var(--color-apple-ink)",
          }}
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
        <Link
          href="/dashboard/calendar"
          className="inline-flex h-[44px] items-center rounded-full bg-[var(--color-apple-action)] px-6 text-[14px] wght-560 text-white transition-all hover:bg-[var(--color-apple-action-hover)] active:scale-[0.97]"
          style={{ letterSpacing: "-0.012em" }}
        >
          캘린더에서 보기
        </Link>
      </div>
    </section>
  );
}

/**
 * 두 번째 문장 — Apple "비상하다" 자리.
 * 임박도에 따라 톤이 바뀜. 카운트다운이 따로 있어 정보 중복 아닌, 감정 강조.
 */
function headlineCallout(kind: EventView["kind"], isUrgent: boolean, within24h: boolean): string {
  if (isUrgent) return "지금부터 진심";
  if (within24h) return "오늘 안에 끝내자";
  switch (kind) {
    case "exam":
      return "준비할 시간이 있다";
    case "assignment":
      return "차근차근 끝내자";
    case "presentation":
      return "리허설할 차례";
    case "class":
      return "한 주가 시작된다";
    default:
      return "한 걸음씩";
  }
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

/**
 * 카운트다운 셀 — 숫자가 바뀔 때 살짝 위로 올라오는 디지털 플립 톤.
 *
 * 구현: key를 value에 묶어 React가 값 변경 시 재마운트 → CSS 키프레임이 매번 재생.
 * 자연스러움 위해 50ms 짧은 fade-up. 시각적 노이즈는 없고, 시간이 살아 있다는 신호만.
 */
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
    <span className="inline-flex items-baseline gap-1">
      <span
        key={display}
        className="clock-tick inline-block text-[44px] wght-620 leading-none tabular-nums sm:text-[60px]"
        style={{
          letterSpacing: "-0.024em",
          minWidth: `${display.length}ch`,
          textAlign: "right",
        }}
      >
        {display}
      </span>
      <span className="text-[14px] wght-560 text-[var(--color-apple-muted)] sm:text-[16px]">
        {unit}
      </span>
    </span>
  );
}
