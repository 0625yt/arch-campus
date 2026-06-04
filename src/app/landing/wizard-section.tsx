"use client";

import { useReveal } from "@/hooks/use-reveal";

/**
 * Wizard 데모 — 발표 위저드 5단계 → 결과 카드 미리보기.
 */
export function WizardSection() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section
      className="border-b px-5 py-20 sm:px-8 sm:py-24 lg:px-12"
      style={{
        borderColor: "var(--color-landing-hairline)",
        background: "var(--color-landing-pearl)",
      }}
    >
      <div className="mx-auto grid max-w-[1180px] gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-center lg:gap-14">
        <div>
          <p
            className="text-[11px] wght-700 uppercase tracking-[0.08em]"
            style={{ color: "var(--color-apple-action)" }}
          >
            Tools
          </p>
          <h2
            className="mt-3 text-[32px] leading-[1.08] wght-700 sm:text-[44px]"
            style={{
              color: "var(--color-landing-text-strong)",
              letterSpacing: "-0.022em",
            }}
          >
            막혔을 때 꺼내는
            <br />
            짧은 흐름
          </h2>
          <p
            className="mt-5 max-w-[460px] text-[15px] leading-[1.6] wght-450"
            style={{ color: "var(--color-landing-text-muted)" }}
          >
            발표 구조 · 리포트 목차 · 시험 벼락치기. 4~5단계로 답하면 시작점이 한 묶음으로 나옵니다.
          </p>
        </div>

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
                발표자료 구조화 · 5단계
              </span>
              <span
                className="text-[10px] wght-560 uppercase tracking-[0.08em] opacity-60"
                style={{ color: "var(--color-landing-text-muted)" }}
              >
                예시
              </span>
            </div>

            <div className="mt-5 space-y-3">
              <StepRow num={1} label="주제" value="운영체제 페이지 교체" done />
              <StepRow num={2} label="시간·청중" value="10분 · 동기" done />
              <StepRow num={3} label="목적" value="설득" done />
              <StepRow num={4} label="제약" value="슬라이드 12장 이내" done />
              <StepRow num={5} label="참고 자료" value="OS 5주차.pdf · 9쪽" />
            </div>

            <div
              className="mt-5 rounded-[10px] border p-4"
              style={{
                borderColor: "var(--color-landing-hairline)",
                background: "var(--color-landing-card-strong)",
              }}
            >
              <p
                className="text-[10px] wght-700 uppercase tracking-[0.08em]"
                style={{ color: "var(--color-apple-action)" }}
              >
                결과 미리보기
              </p>
              <p
                className="mt-2 text-[13.5px] wght-620"
                style={{
                  color: "var(--color-landing-text-strong)",
                  letterSpacing: "-0.012em",
                }}
              >
                슬라이드 12장 · 스피커 노트 · 예상 질문 5
              </p>
              <p
                className="mt-1 text-[11.5px] wght-450"
                style={{ color: "var(--color-landing-text-muted)" }}
              >
                자료 9쪽 인용 박힘 · 본문은 본인이 채움
              </p>
            </div>
          </DemoCard>
        </div>
      </div>
    </section>
  );
}

function StepRow({
  num,
  label,
  value,
  done,
}: {
  num: number;
  label: string;
  value: string;
  done?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] wght-700 tabular-nums"
        style={{
          background: done ? "var(--color-apple-action)" : "var(--color-landing-card-strong)",
          color: done ? "white" : "var(--color-landing-text-muted)",
          border: done ? "none" : "1px solid var(--color-landing-hairline)",
        }}
      >
        {done ? "✓" : num}
      </span>
      <span
        className="text-[11px] wght-560 uppercase tracking-[0.06em]"
        style={{ color: "var(--color-landing-text-muted)" }}
      >
        {label}
      </span>
      <span
        className="flex-1 truncate text-[13px] wght-560"
        style={{ color: "var(--color-landing-text-strong)" }}
      >
        {value}
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
