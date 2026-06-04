"use client";

import { useReveal } from "@/hooks/use-reveal";

/**
 * Study 흐름 데모 — PDF → 요약 → 문제 → 오답 4 카드 가로 시퀀스.
 */
export function StudySection() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section
      className="border-b px-5 py-20 sm:px-8 sm:py-24 lg:px-12"
      style={{ borderColor: "var(--color-landing-hairline)" }}
    >
      <div className="mx-auto max-w-[1180px]">
        <div className="max-w-[520px]">
          <p
            className="text-[11px] wght-700 uppercase tracking-[0.08em]"
            style={{ color: "var(--color-apple-action)" }}
          >
            Study
          </p>
          <h2
            className="mt-3 text-[32px] leading-[1.08] wght-700 sm:text-[44px]"
            style={{
              color: "var(--color-landing-text-strong)",
              letterSpacing: "-0.022em",
            }}
          >
            한 번 올린 자료가
            <br />
            요약 · 문제 · 오답까지
          </h2>
          <p
            className="mt-5 max-w-[480px] text-[15px] leading-[1.6] wght-450"
            style={{ color: "var(--color-landing-text-muted)" }}
          >
            과목별로 자료가 쌓이고, 자료 한 장에서 시작한 흐름이 시험 직전 복습까지 이어집니다.
          </p>
        </div>

        <div
          ref={ref}
          data-reveal
          className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <StepCard
            step="01"
            kind="자료"
            title="운영체제 5주차.pdf"
            sub="42쪽 · 1.4MB"
            color="#7aa6d6"
          />
          <StepCard
            step="02"
            kind="요약"
            title="핵심 단원 5"
            sub="페이지 인용 7곳"
            color="#7fb38c"
          />
          <StepCard step="03" kind="문제" title="객관식·서술 15" sub="정답률 73%" color="#cca06b" />
          <StepCard
            step="04"
            kind="오답"
            title="다시 풀기 4"
            sub="자료 인용 살아있음"
            color="#e0445e"
          />
        </div>
      </div>
    </section>
  );
}

function StepCard({
  step,
  kind,
  title,
  sub,
  color,
}: {
  step: string;
  kind: string;
  title: string;
  sub: string;
  color: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-[14px] border p-5 backdrop-blur-xl transition-transform hover:-translate-y-0.5"
      style={{
        borderColor: "var(--color-landing-hairline)",
        background: "var(--color-landing-card)",
      }}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] wght-700 tabular-nums" style={{ color }}>
          {step}
        </span>
        <span
          className="text-[10px] wght-560 uppercase tracking-[0.06em]"
          style={{ color: "var(--color-landing-text-muted)" }}
        >
          {kind}
        </span>
      </div>
      <h3
        className="mt-5 text-[15px] leading-[1.25] wght-700"
        style={{
          color: "var(--color-landing-text-strong)",
          letterSpacing: "-0.012em",
        }}
      >
        {title}
      </h3>
      <p
        className="mt-1.5 text-[12px] wght-450"
        style={{ color: "var(--color-landing-text-muted)" }}
      >
        {sub}
      </p>
      <div
        className="mt-4 h-1 rounded-full"
        style={{
          background: `linear-gradient(to right, ${color} 0%, transparent 70%)`,
        }}
      />
    </div>
  );
}
