import Link from "next/link";
import { redirect } from "next/navigation";
import { tryGetOwnerId } from "@/lib/auth";
import { ReportChecklistWizard } from "./wizard";

export const dynamic = "force-dynamic";

export default async function ReportChecklistPage() {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  return (
    <div>
      <div className="mx-auto w-full max-w-[820px] px-6 pb-32 pt-8 sm:px-10 sm:pb-40 sm:pt-12 md:px-12">
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
            과제 · 2단계
          </span>
        </header>

        <section className="mt-10 fade-up fade-up-1 sm:mt-14">
          <p
            className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-action)]"
          >
            교수 요구사항 체크
          </p>
          <h1
            className="mt-3 text-[34px] leading-[1.07] wght-620 text-[var(--color-apple-ink)] sm:text-[44px] md:text-[52px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            공지에 숨은 <span className="text-[var(--color-apple-muted)]">감점 포인트.</span>
          </h1>
          <p
            className="mt-4 max-w-[560px] text-[15px] leading-[1.55] wght-450 text-[var(--color-apple-muted)] sm:text-[17px] sm:leading-[1.5]"
            style={{ letterSpacing: "-0.022em" }}
          >
            과제 공지를 붙이면 분량·형식·인용·마감·제출방식까지 빠짐없이 체크리스트로
            정리해드려요. 본문은 본인이 직접 씁니다.
          </p>
        </section>

        <div className="mt-12 fade-up fade-up-2 sm:mt-14">
          <ReportChecklistWizard />
        </div>
      </div>
    </div>
  );
}
