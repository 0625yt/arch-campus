"use client";

import { useReveal } from "@/hooks/use-reveal";

/**
 * Today 데모 섹션 — "오늘 할 일만" 라이브 카운트다운.
 */
export function TodaySection() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section
      id="flow"
      className="border-b px-5 py-20 sm:px-8 sm:py-24 lg:px-12"
      style={{ borderColor: "var(--color-landing-hairline)" }}
    >
      <div className="mx-auto grid max-w-[1180px] gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-center lg:gap-14">
        <div>
          <p
            className="text-[11px] wght-700 uppercase tracking-[0.08em]"
            style={{ color: "var(--color-apple-action)" }}
          >
            Today
          </p>
          <h2
            className="mt-3 text-[32px] leading-[1.08] wght-700 sm:text-[44px]"
            style={{
              color: "var(--color-landing-text-strong)",
              letterSpacing: "-0.022em",
            }}
          >
            오늘 처리할 것부터,
            <br />한 줄로
          </h2>
          <p
            className="mt-5 max-w-[460px] text-[15px] leading-[1.6] wght-450"
            style={{ color: "var(--color-landing-text-muted)" }}
          >
            마감과 복습을 한꺼번에 보여주지 않습니다. 지금 손대야 할 것 한 가지부터.
          </p>
        </div>

        <div ref={ref} data-reveal>
          <DemoCard>
            <div
              className="flex items-center justify-between border-b pb-3"
              style={{ borderColor: "var(--color-landing-hairline)" }}
            >
              <span
                className="text-[13px] wght-700"
                style={{ color: "var(--color-landing-text-strong)" }}
              >
                오늘 · 3개
              </span>
              <span
                className="text-[10px] wght-560 uppercase tracking-[0.08em] opacity-60"
                style={{ color: "var(--color-landing-text-muted)" }}
              >
                예시
              </span>
            </div>
            <div className="mt-4 space-y-2">
              <TodoRow
                bar="#e0445e"
                title="자료구조 과제 제출"
                meta="오늘 23:59"
                chip="D-0"
                chipColor="#e0445e"
                glow
              />
              <TodoRow
                bar="#7fb38c"
                title="운영체제 5주차 복습"
                meta="오전 10:30"
                chip="D-1"
                chipColor="#7fb38c"
              />
              <TodoRow
                bar="#7aa6d6"
                title="DB 발표 자료 점검"
                meta="수요일 15:00"
                chip="D-2"
                chipColor="#7aa6d6"
              />
            </div>
          </DemoCard>
        </div>
      </div>
    </section>
  );
}

function TodoRow({
  bar,
  title,
  meta,
  chip,
  chipColor,
  glow,
}: {
  bar: string;
  title: string;
  meta: string;
  chip: string;
  chipColor: string;
  glow?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-[10px] px-3 py-2.5 ${glow ? "now-glow" : ""}`}
      style={{
        background: "var(--color-landing-card-strong)",
        borderLeft: `3px solid ${bar}`,
      }}
    >
      <span className="text-[13px] wght-620" style={{ color: "var(--color-landing-text-strong)" }}>
        {title}
      </span>
      <span className="flex items-center gap-2">
        <span className="text-[11px] wght-560" style={{ color: "var(--color-landing-text-muted)" }}>
          {meta}
        </span>
        <span
          className="inline-flex h-5 items-center rounded-full px-2 text-[10px] wght-700 tabular-nums"
          style={{
            background: `color-mix(in oklab, ${chipColor} 16%, var(--color-landing-card-strong))`,
            color: chipColor,
          }}
        >
          {chip}
        </span>
      </span>
    </div>
  );
}

function DemoCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative overflow-hidden rounded-[16px] border p-4 backdrop-blur-xl sm:p-5"
      style={{
        borderColor: "var(--color-landing-hairline)",
        background: "var(--color-landing-card)",
        boxShadow:
          "0 20px 50px -30px color-mix(in oklab, var(--color-landing-text-strong) 22%, transparent)",
      }}
    >
      {children}
    </div>
  );
}
