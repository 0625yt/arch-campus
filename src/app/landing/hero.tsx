"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * 랜딩 hero — 압축 (min-h clamp + grid 2-컬럼) + 라이브 미니 시간표 카드.
 *
 * 진짜 데이터는 아니지만 우리 토큰·폰트·now-glow 그대로라서 다크/라이트 같이 살아남음.
 * 우상단 "예시 화면" 라벨로 정직.
 *
 * 모션:
 *  - 배경 blob-drift (12s 슈퍼 슬로우)
 *  - 진입 시 좌측 fade-up + 우측 sheet-up (delay 240ms)
 *  - 진행 중 강의 row만 now-glow
 */
export function LandingHero({ startHref, startLabel }: { startHref: string; startLabel: string }) {
  return (
    <section
      className="relative isolate overflow-hidden border-b"
      style={{
        minHeight: "clamp(600px, 78dvh, 880px)",
        borderColor: "var(--color-landing-hairline)",
      }}
    >
      <HeroBackdrop />

      <div className="relative z-10 mx-auto grid max-w-[1180px] grid-cols-1 gap-10 px-5 pb-16 pt-10 sm:px-8 sm:pb-20 sm:pt-14 lg:grid-cols-[1.05fr_1.1fr] lg:gap-12 lg:px-12">
        {/* 좌측 카피 */}
        <div className="fade-up fade-up-1 flex flex-col justify-center">
          <div
            className="inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] wght-620 backdrop-blur-xl"
            style={{
              borderColor: "var(--color-landing-hairline)",
              background: "var(--color-landing-card)",
              color: "var(--color-landing-text-muted)",
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-apple-action)]" />
            대학생을 위한 한 학기 안전망
          </div>

          <h1
            className="mt-6 text-[42px] leading-[1.02] wght-700 sm:text-[60px] lg:text-[72px]"
            style={{
              color: "var(--color-landing-text-strong)",
              letterSpacing: "-0.022em",
            }}
          >
            강의자료를 넣으면,
            <br />
            <span style={{ color: "var(--color-apple-action)" }}>오늘 할 일</span>이 보입니다.
          </h1>

          <p
            className="mt-6 max-w-[520px] text-[15px] leading-[1.6] wght-450 sm:text-[17px]"
            style={{ color: "var(--color-landing-text-muted)" }}
          >
            흩어진 PDF · 강의계획서 · 시간표를 올리면 과제 마감 · 시험 범위 · 복습 · 발표 준비가 한
            화면에서 이어집니다.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={startHref}
              className="spring-press inline-flex h-[50px] items-center justify-center rounded-full bg-[var(--color-apple-action)] px-7 text-[14px] wght-700 text-white shadow-[0_14px_34px_-12px_rgba(0,113,227,0.55)] transition-all hover:bg-[var(--color-apple-action-hover)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              {startLabel}
            </Link>
            <a
              href="#flow"
              className="spring-press inline-flex h-[50px] items-center justify-center rounded-full border px-7 text-[14px] wght-620 backdrop-blur-xl transition-all"
              style={{
                borderColor: "var(--color-landing-hairline)",
                background: "var(--color-landing-card)",
                color: "var(--color-landing-text-strong)",
                letterSpacing: "-0.012em",
              }}
            >
              어떻게 바뀌는지 보기
            </a>
          </div>

          <p
            className="mt-5 text-[12.5px] wght-450"
            style={{ color: "var(--color-landing-text-muted)" }}
          >
            구글 계정 10초 시작 · LMS 연동 없이도 자료 1개면 충분
          </p>
        </div>

        {/* 우측 라이브 미니 시간표 */}
        <div
          className="fade-up fade-up-2 relative flex items-center justify-center"
          style={{ animationDelay: "240ms" }}
        >
          <HeroLiveTimetable />
        </div>
      </div>
    </section>
  );
}

function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 30% 20%, color-mix(in oklab, var(--color-apple-action) 18%, transparent), transparent 60%), radial-gradient(ellipse 60% 50% at 80% 80%, color-mix(in oklab, #a08bc4 16%, transparent), transparent 65%)",
        }}
      />
      <div
        className="blob-drift absolute -left-[10%] -top-[10%] h-[60vh] w-[60vw] rounded-full opacity-50"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--color-apple-action) 22%, transparent) 0%, transparent 65%)",
          filter: "blur(60px)",
        }}
      />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
 * HeroLiveTimetable — 라이브 미니 시간표 카드.
 * 가짜 데이터 4 강의, 현재 시각 따라 "지금 강의" now-glow.
 * ────────────────────────────────────────────────────────── */

interface FakeCourse {
  name: string;
  day: 0 | 1 | 2 | 3 | 4;
  start: number; // 0~23 (시간 단위)
  end: number;
  color: string;
}

const FAKE_COURSES: FakeCourse[] = [
  { name: "자료구조", day: 0, start: 9, end: 11, color: "#e0445e" },
  { name: "운영체제", day: 1, start: 10, end: 12, color: "#7fb38c" },
  { name: "DB", day: 2, start: 13, end: 15, color: "#7aa6d6" },
  { name: "알고리즘", day: 3, start: 9, end: 11, color: "#cca06b" },
  { name: "통계학", day: 4, start: 14, end: 16, color: "#a08bc4" },
];

const DAYS = ["월", "화", "수", "목", "금"];
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17];

function HeroLiveTimetable() {
  const [now, setNow] = useState<{ day: number; hour: number }>({ day: 0, hour: 10 });

  useEffect(() => {
    const update = () => {
      const d = new Date();
      const kstDay = (d.getUTCDay() + 9) % 7; // KST 환산. 0=일
      const kstHour = (d.getUTCHours() + 9) % 24;
      // 일·토는 임의로 월 10시로 매핑 (데모용)
      const day = kstDay >= 1 && kstDay <= 5 ? kstDay - 1 : 0;
      const hour = kstHour >= 9 && kstHour <= 17 ? kstHour : 10;
      setNow({ day, hour });
    };
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, []);

  const isNow = (c: FakeCourse) => c.day === now.day && now.hour >= c.start && now.hour < c.end;

  return (
    <div
      className="relative w-full max-w-[520px] overflow-hidden rounded-[20px] border p-4 backdrop-blur-xl sm:p-5"
      style={{
        borderColor: "var(--color-landing-hairline)",
        background: "var(--color-landing-card)",
        boxShadow:
          "0 30px 80px -40px color-mix(in oklab, var(--color-landing-text-strong) 22%, transparent)",
      }}
    >
      {/* 카드 header */}
      <div
        className="flex items-baseline justify-between border-b pb-3"
        style={{ borderColor: "var(--color-landing-hairline)" }}
      >
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-apple-action)]" />
          <span
            className="text-[12.5px] wght-700"
            style={{
              color: "var(--color-landing-text-strong)",
              letterSpacing: "-0.012em",
            }}
          >
            내 캠퍼스 · 이번 주
          </span>
        </div>
        <span
          className="text-[10px] wght-560 uppercase tracking-[0.08em] opacity-60"
          style={{ color: "var(--color-landing-text-muted)" }}
        >
          예시 화면
        </span>
      </div>

      {/* 시간표 grid */}
      <div className="mt-3 grid grid-cols-[28px_repeat(5,minmax(0,1fr))] gap-px overflow-hidden rounded-[10px]">
        {/* 헤더 row */}
        <div />
        {DAYS.map((d, i) => (
          <div
            key={d}
            className="py-1.5 text-center text-[10px] wght-700"
            style={{
              color:
                i === now.day ? "var(--color-apple-action)" : "var(--color-landing-text-muted)",
              background: "var(--color-landing-card-strong)",
            }}
          >
            {d}
          </div>
        ))}
        {/* 시간 row들 */}
        {HOURS.map((h) => (
          <Row key={h} hour={h} currentDay={now.day} currentHour={now.hour} isNow={isNow} />
        ))}
      </div>

      {/* 카드 footer — 오늘 강의 */}
      <div className="mt-3 flex items-center gap-2">
        {FAKE_COURSES.filter((c) => c.day === now.day).map((c) => (
          <span
            key={c.name}
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10.5px] wght-620"
            style={{
              background: `color-mix(in oklab, ${c.color} 14%, var(--color-landing-card-strong))`,
              color: "var(--color-landing-text-strong)",
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.color }} />
            {c.name}
          </span>
        ))}
        {FAKE_COURSES.filter((c) => c.day === now.day).length === 0 && (
          <span
            className="text-[10.5px] wght-450"
            style={{ color: "var(--color-landing-text-muted)" }}
          >
            오늘 강의 없음
          </span>
        )}
      </div>
    </div>
  );
}

function Row({
  hour,
  currentDay,
  currentHour,
  isNow,
}: {
  hour: number;
  currentDay: number;
  currentHour: number;
  isNow: (c: FakeCourse) => boolean;
}) {
  return (
    <>
      <div
        className="py-2 text-right pr-1 text-[9px] wght-560 tabular-nums"
        style={{
          color: "var(--color-landing-text-muted)",
          background: "var(--color-landing-card-strong)",
        }}
      >
        {hour}
      </div>
      {[0, 1, 2, 3, 4].map((d) => {
        const c = FAKE_COURSES.find((x) => x.day === d && hour >= x.start && hour < x.end);
        const isCurrentCell = d === currentDay && hour === currentHour;
        if (!c) {
          return (
            <div
              key={d}
              className="min-h-[24px]"
              style={{
                background: isCurrentCell
                  ? "color-mix(in oklab, var(--color-apple-action) 10%, var(--color-landing-card-strong))"
                  : "var(--color-landing-card-strong)",
              }}
            />
          );
        }
        const showLabel = hour === c.start;
        const nowCourse = isNow(c);
        return (
          <div
            key={d}
            className={`min-h-[24px] px-1.5 py-1 ${nowCourse ? "now-glow" : ""}`}
            style={{
              background: `color-mix(in oklab, ${c.color} ${nowCourse ? 24 : 14}%, var(--color-landing-card-strong))`,
              borderLeft: `2px solid ${c.color}`,
            }}
          >
            {showLabel && (
              <span
                className="text-[9.5px] wght-620"
                style={{ color: "var(--color-landing-text-strong)" }}
              >
                {c.name}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}
