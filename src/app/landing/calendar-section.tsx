"use client";

import { useReveal } from "@/hooks/use-reveal";

/**
 * Calendar Import 데모 — 파일 칩 → 화살표 → 일정 카드 시퀀스.
 */
export function CalendarSection() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section
      id="features"
      className="border-b px-5 py-20 sm:px-8 sm:py-24 lg:px-12"
      style={{ borderColor: "var(--color-landing-hairline)", background: "var(--color-landing-pearl)" }}
    >
      <div className="mx-auto grid max-w-[1180px] gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-center lg:gap-14">
        <div ref={ref} data-reveal>
          <DemoCard>
            <div
              className="flex items-center justify-between border-b pb-3"
              style={{ borderColor: "var(--color-landing-hairline)" }}
            >
              <span
                className="text-[12px] wght-700"
                style={{ color: "var(--color-landing-text-strong)" }}
              >
                자료 → 일정 추출
              </span>
              <span
                className="text-[10px] wght-560 uppercase tracking-[0.08em] opacity-60"
                style={{ color: "var(--color-landing-text-muted)" }}
              >
                예시
              </span>
            </div>

            <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
              {/* 좌측 — 파일 */}
              <div className="space-y-2">
                <FileChip name="강의계획서.pdf" />
                <FileChip name="공지.docx" />
                <FileChip name="시간표.png" />
              </div>

              {/* 화살표 */}
              <svg width="36" height="24" viewBox="0 0 36 24" fill="none" aria-hidden>
                <path
                  className="line-draw"
                  d="M2 12 L30 12 M22 4 L30 12 L22 20"
                  stroke="var(--color-apple-action)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ ["--len" as string]: 60 }}
                />
              </svg>

              {/* 우측 — 일정 카드 */}
              <div className="space-y-2">
                <EventChip kind="시험" title="중간고사" date="D-7" color="#e0445e" />
                <EventChip kind="과제" title="주차 3 제출" date="D-3" color="#cca06b" />
                <EventChip kind="발표" title="DB 발표" date="D-5" color="#7aa6d6" />
              </div>
            </div>

            <p
              className="mt-5 text-[12px] wght-450"
              style={{ color: "var(--color-landing-text-muted)" }}
            >
              자료에서 7개 일정 후보를 찾았어요 · 확인 후 추가
            </p>
          </DemoCard>
        </div>

        <div>
          <p
            className="text-[11px] wght-700 uppercase tracking-[0.08em]"
            style={{ color: "var(--color-apple-action)" }}
          >
            Calendar
          </p>
          <h2
            className="mt-3 text-[32px] leading-[1.08] wght-700 sm:text-[44px]"
            style={{
              color: "var(--color-landing-text-strong)",
              letterSpacing: "-0.022em",
            }}
          >
            자료에서 일정을
            <br />
            바로 캘린더로
          </h2>
          <p
            className="mt-5 max-w-[460px] text-[15px] leading-[1.6] wght-450"
            style={{ color: "var(--color-landing-text-muted)" }}
          >
            강의계획서 · 공지 · 시간표를 올리면 시험 · 과제 · 발표 일정을 자동 추출. 확인 후
            바로 캘린더에 등록.
          </p>
        </div>
      </div>
    </section>
  );
}

function FileChip({ name }: { name: string }) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-[8px] border px-3 py-2 text-[12px] wght-560"
      style={{
        borderColor: "var(--color-landing-hairline)",
        background: "var(--color-landing-card-strong)",
        color: "var(--color-landing-text-strong)",
      }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
        <path
          d="M3 1h4l2 2v8H3V1z"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>
      {name}
    </div>
  );
}

function EventChip({
  kind,
  title,
  date,
  color,
}: {
  kind: string;
  title: string;
  date: string;
  color: string;
}) {
  return (
    <div
      className="rounded-[8px] border px-3 py-2"
      style={{
        borderColor: "var(--color-landing-hairline)",
        background: "var(--color-landing-card-strong)",
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div className="flex items-center justify-between">
        <span
          className="text-[10px] wght-620 uppercase tracking-[0.06em]"
          style={{ color }}
        >
          {kind}
        </span>
        <span
          className="text-[10px] wght-700 tabular-nums"
          style={{ color: "var(--color-landing-text-muted)" }}
        >
          {date}
        </span>
      </div>
      <p
        className="mt-1 text-[12px] wght-620"
        style={{ color: "var(--color-landing-text-strong)" }}
      >
        {title}
      </p>
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
