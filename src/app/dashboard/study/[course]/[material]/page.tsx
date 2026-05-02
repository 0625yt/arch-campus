import Link from "next/link";
import { notFound } from "next/navigation";
import { Dot, ProgressLine } from "@/components/primitives";
import { PageShell, PageFooter } from "@/components/page-shell";
import { COURSE_COLOR, getMaterial, type SummaryBlock } from "../../data";
import { GenerateButton } from "./generate-button";

export default async function MaterialDetailPage({
  params,
}: {
  params: Promise<{ course: string; material: string }>;
}) {
  const { course: courseParam, material: materialParam } = await params;
  const courseSlug = decodeURIComponent(courseParam);
  const materialId = decodeURIComponent(materialParam);
  const found = getMaterial(courseSlug, materialId);
  if (!found) notFound();

  const { course, material } = found;
  const pct =
    material.problems.total > 0
      ? material.problems.done / material.problems.total
      : 0;
  const acc =
    material.problems.done > 0
      ? Math.round((material.problems.correct / material.problems.done) * 100)
      : 0;

  return (
    <PageShell width="md">
      {/* breadcrumb */}
      <nav className="fade-up flex min-w-0 items-baseline gap-2 text-[12px] wght-450 kerning-tight">
        <Link
          href="/dashboard/study"
          className="shrink-0 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
        >
          강의
        </Link>
        <span className="shrink-0 text-[var(--color-line-strong)]">/</span>
        <Link
          href={`/dashboard/study/${course.slug}`}
          className="inline-flex shrink-0 items-center gap-1.5 text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
        >
          <Dot color={COURSE_COLOR[course.slug]} size={5} />
          {course.slug}
        </Link>
        <span className="shrink-0 text-[var(--color-line-strong)]">/</span>
        <span className="min-w-0 truncate wght-560 text-[var(--color-fg-strong)]">
          {material.title}
        </span>
      </nav>

      {/* 자료 헤더 — 타이틀 + 메타 + 우상단 액션 */}
      <header className="mt-8 fade-up fade-up-1 flex flex-wrap items-start justify-between gap-x-5 gap-y-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[24px] leading-[1.25] kerning-tight wght-700 text-[var(--color-fg-strong)] sm:text-[28px] md:text-[30px]">
            {material.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11.5px] wght-450 kerning-tight tabular-nums text-[var(--color-fg-subtle)]">
            <span>{material.pages}p</span>
            <span className="text-[var(--color-line-strong)]">·</span>
            <span>{material.uploaded}</span>
            {material.problems.total > 0 && (
              <>
                <span className="text-[var(--color-line-strong)]">·</span>
                <span>
                  {material.problems.done}/{material.problems.total} 풂
                </span>
                {acc > 0 && (
                  <>
                    <span className="text-[var(--color-line-strong)]">·</span>
                    <span>정답률 {acc}%</span>
                  </>
                )}
              </>
            )}
          </div>
        </div>
        {/* 헤더 우측 — 작은 버튼 */}
        <div className="shrink-0 self-center">
          <GenerateButton
            variant="compact"
            courseSlug={course.slug}
            materialId={material.id}
            materialTitle={material.title}
          />
        </div>
      </header>

      {material.problems.total > 0 && (
        <ProgressLine value={pct} className="mt-4 max-w-[300px] fade-up fade-up-1" />
      )}

      {/* 키워드 — 요약 위, 빠르게 훑기용 */}
      {material.keywords && material.keywords.length > 0 && (
        <section className="mt-8 fade-up fade-up-2">
          <h2 className="text-[10.5px] wght-700 kerning-mono uppercase text-[var(--color-fg-subtle)]">
            핵심 키워드
          </h2>
          <ul className="mt-2 flex flex-wrap gap-x-1.5 gap-y-1.5 text-[12.5px] wght-500 kerning-tight">
            {material.keywords.map((k) => (
              <li
                key={k}
                className="rounded-full border border-[var(--color-line)] px-2.5 py-1 text-[var(--color-fg-muted)]"
              >
                {k}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 요약 본문 — 페이지의 주인공 */}
      {material.summary && material.summary.length > 0 && (
        <section className="mt-10 fade-up fade-up-3">
          <h2 className="text-[10.5px] wght-700 kerning-mono uppercase text-[var(--color-fg-subtle)]">
            요약
          </h2>
          <SummaryBody blocks={material.summary} className="mt-4" />
        </section>
      )}

      {/* 푸터 액션 — 큰 버튼. 요약 다 읽고 자연스럽게 도착 */}
      <section className="mt-12 fade-up fade-up-4 flex flex-wrap items-center gap-4 border-t border-[var(--color-line)] pt-8">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] wght-560 kerning-tight text-[var(--color-fg-strong)] sm:text-[16px]">
            요약 다 읽으셨어요?
          </p>
          <p className="mt-1 text-[12.5px] wght-450 kerning-tight text-[var(--color-fg-muted)]">
            객관식·주관식·서술형 중에 골라 문제를 만들 수 있어요
          </p>
        </div>
        <GenerateButton
          variant="primary"
          courseSlug={course.slug}
          materialId={material.id}
          materialTitle={material.title}
        />
      </section>

      <PageFooter>
        문제는 자료에 있는 문장으로만 만들어요. 출처 페이지·문단이 모든 문제에
        붙어요.
      </PageFooter>
    </PageShell>
  );
}

/* ─────────── 요약 렌더러 — 노션 톤 ─────────── */

function SummaryBody({
  blocks,
  className,
}: {
  blocks: SummaryBlock[];
  className?: string;
}) {
  return (
    <div className={className}>
      {blocks.map((b, i) => {
        if (b.kind === "h2") {
          return (
            <h3
              key={i}
              className="mt-7 first:mt-0 text-[15.5px] wght-700 kerning-tight text-[var(--color-fg-strong)] sm:text-[16px]"
            >
              {b.text}
            </h3>
          );
        }
        if (b.kind === "para") {
          return (
            <p
              key={i}
              className="mt-3 text-[14.5px] leading-[1.75] kerning-tight text-[var(--color-fg)] sm:text-[15px]"
            >
              {b.text}
            </p>
          );
        }
        if (b.kind === "bullets") {
          return (
            <ul
              key={i}
              className="mt-3 flex flex-col gap-1.5 text-[14px] leading-[1.7] kerning-tight text-[var(--color-fg)] sm:text-[14.5px]"
            >
              {b.items.map((item, j) => (
                <li key={j} className="flex gap-3">
                  <span
                    aria-hidden
                    className="shrink-0 select-none text-[var(--color-fg-disabled)]"
                  >
                    ·
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          );
        }
        // callout
        const isWarn = b.tone === "warn";
        return (
          <aside
            key={i}
            className={
              isWarn
                ? "mt-4 rounded-md border-l-2 border-[var(--color-warn)] bg-[var(--color-warn-soft)]/40 px-4 py-3"
                : "mt-4 rounded-md border-l-2 border-[var(--color-accent)] bg-[var(--color-accent-soft)]/60 px-4 py-3"
            }
          >
            <p
              className={
                isWarn
                  ? "text-[13px] leading-[1.6] kerning-tight wght-500 text-[var(--color-warn)] sm:text-[13.5px]"
                  : "text-[13px] leading-[1.6] kerning-tight wght-500 text-[var(--color-accent-strong)] sm:text-[13.5px]"
              }
            >
              {b.text}
            </p>
          </aside>
        );
      })}
    </div>
  );
}
