import Link from "next/link";
import { Wizard } from "./wizard";

export default function PresentationWizardPage() {
  return (
    <div className="bg-[var(--color-apple-pearl)]">
      <div className="mx-auto w-full max-w-[820px] px-6 pb-32 pt-8 sm:px-10 sm:pb-40 sm:pt-12 md:px-12">
        {/* Top bar */}
        <header className="fade-up flex items-baseline justify-between gap-3">
          <Link
            href="/dashboard/tools"
            className="group inline-flex items-baseline gap-1 text-[12px] wght-450 text-[var(--color-apple-muted)] hover:text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            <span className="transition-transform group-hover:-translate-x-0.5">‹</span>
            도구
          </Link>
          <span className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
            발표 · 5단계
          </span>
        </header>

        {/* Hero */}
        <section className="mt-10 fade-up fade-up-1 sm:mt-14">
          <p
            className="text-[12px] wght-560 uppercase tracking-[0.06em]"
            style={{ color: "var(--color-apple-cobalt)" }}
          >
            발표자료 구조화
          </p>
          <h1
            className="mt-3 text-[34px] leading-[1.07] wght-620 text-[var(--color-apple-ink)] sm:text-[44px] md:text-[52px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            5단계로 답하면 <span className="text-[var(--color-apple-muted)]">발표 한 세트가</span>{" "}
            만들어져요.
          </h1>
          <p
            className="mt-4 max-w-[560px] text-[15px] leading-[1.55] wght-450 text-[var(--color-apple-muted)] sm:text-[17px] sm:leading-[1.5]"
            style={{ letterSpacing: "-0.022em" }}
          >
            슬라이드 구조 · 발표 대본 · 예상 질문까지. 평균 2분 안쪽.
          </p>
        </section>

        <div className="mt-12 fade-up fade-up-2 sm:mt-14">
          <Wizard />
        </div>
      </div>
    </div>
  );
}
