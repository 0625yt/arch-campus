import Link from "next/link";
import { Arrow } from "@/components/primitives";
import { Wizard } from "./wizard";

export default function PresentationWizardPage() {
  return (
    <div className="mx-auto w-full max-w-[680px] px-5 pb-12 pt-6 sm:px-7 sm:pt-8 md:px-12 md:pt-10 md:pb-20 xl:max-w-[760px]">
      <header className="fade-up flex items-baseline justify-between gap-3 text-[12px] wght-450 kerning-tight">
        <Link
          href="/dashboard/tools"
          className="group inline-flex items-baseline gap-1.5 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
        >
          <Arrow
            variant="right"
            className="rotate-180 text-[12px] transition-transform group-hover:-translate-x-0.5"
          />
          위저드 목록
        </Link>
        <span className="text-[var(--color-fg-subtle)]">발표 · 5단계</span>
      </header>

      <Intro className="mt-10 fade-up fade-up-1 sm:mt-14" />

      <div className="mt-12 fade-up fade-up-2 sm:mt-14">
        <Wizard />
      </div>

      <p className="mt-20 text-[11px] wght-380 kerning-tight text-[var(--color-fg-subtle)]">
        결과물은 학습 보조용이에요. 발표 전에 본인이 한 번 검토하고 다듬어 주세요.
      </p>
    </div>
  );
}

function Intro({ className }: { className?: string }) {
  return (
    <section className={className}>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent-soft)] px-2.5 py-1 text-[10.5px] wght-700 kerning-mono uppercase text-[var(--color-accent-strong)]">
        발표자료 구조화
      </span>
      <h1 className="mt-5 text-[28px] leading-[1.25] kerning-tight sm:text-[32px] md:text-[36px]">
        <span className="wght-700 text-[var(--color-fg-strong)]">5단계로 답하면 </span>
        <span className="relative inline-block wght-700 text-[var(--color-accent-strong)]">
          <span
            aria-hidden
            className="absolute inset-x-[-0.12em] inset-y-[0.08em] -z-10 rounded-[2px] bg-[var(--color-highlight)]"
          />
          발표 한 세트
        </span>
        <span className="wght-700 text-[var(--color-fg-strong)]">가 만들어져요</span>
      </h1>
      <p className="mt-3 text-[14px] wght-450 kerning-tight text-[var(--color-fg-muted)] sm:text-[15px]">
        슬라이드 구조 · 발표 대본 · 예상 질문까지. 평균 2분 안쪽.
      </p>
    </section>
  );
}
