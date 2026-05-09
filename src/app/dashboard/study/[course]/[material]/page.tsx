import Link from "next/link";
import { notFound } from "next/navigation";
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
  const dotColor = COURSE_COLOR[course.slug];
  const pct = material.problems.total > 0 ? material.problems.done / material.problems.total : 0;
  const acc =
    material.problems.done > 0
      ? Math.round((material.problems.correct / material.problems.done) * 100)
      : 0;

  return (
    <div className="bg-[var(--color-apple-pearl)]">
      <div className="mx-auto w-full max-w-[920px] px-6 pb-32 pt-8 sm:px-10 sm:pb-40 sm:pt-12 md:px-12">
        {/* ─── Breadcrumb ─────────────── */}
        <nav
          className="fade-up flex min-w-0 items-center gap-1.5 text-[12px] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          <Link href="/dashboard/study" className="shrink-0 hover:text-[var(--color-apple-ink)]">
            공부
          </Link>
          <span aria-hidden className="shrink-0 text-[var(--color-apple-hairline)]">
            ›
          </span>
          <Link
            href={`/dashboard/study/${course.slug}`}
            className="inline-flex shrink-0 items-center gap-1.5 hover:text-[var(--color-apple-ink)]"
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dotColor }} />
            {course.slug}
          </Link>
        </nav>

        {/* ─── Hero ─────────────── */}
        <header className="mt-10 fade-up fade-up-1 sm:mt-14">
          <p
            className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {material.unit ?? "자료"}
          </p>
          <h1
            className="mt-3 text-[30px] leading-[1.1] wght-620 text-[var(--color-apple-ink)] sm:text-[40px] sm:leading-[1.06] md:text-[44px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {material.title}.
          </h1>

          {/* 메타 라인 — 위계 정리 */}
          <div
            className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            <span className="tabular-nums">{material.pages}쪽</span>
            <span className="text-[var(--color-apple-hairline)]">·</span>
            <span>{material.uploaded}</span>
            {material.problems.total > 0 && (
              <>
                <span className="text-[var(--color-apple-hairline)]">·</span>
                <span className="tabular-nums">
                  {material.problems.done}/{material.problems.total} 풂
                </span>
                {acc > 0 && (
                  <span
                    className={`tabular-nums wght-560 ${
                      acc >= 80
                        ? "text-[var(--color-apple-success)]"
                        : acc >= 60
                          ? "text-[var(--color-apple-ink)]"
                          : "text-[var(--color-urgent)]"
                    }`}
                  >
                    정답률 {acc}%
                  </span>
                )}
              </>
            )}
          </div>

          {/* 진행률 바 */}
          {material.problems.total > 0 && (
            <div className="mt-4 h-1 w-full max-w-[320px] overflow-hidden rounded-full bg-[var(--color-apple-hairline)]">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.max(2, pct * 100)}%`,
                  backgroundColor: dotColor,
                }}
              />
            </div>
          )}
        </header>

        {/* ─── 키워드 ─────────────── */}
        {material.keywords && material.keywords.length > 0 && (
          <section className="mt-12 fade-up fade-up-2">
            <h2 className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
              핵심 키워드
            </h2>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {material.keywords.map((k) => (
                <li key={k}>
                  <span
                    className="inline-block rounded-full bg-white px-3 py-1.5 text-[12px] wght-450 text-[var(--color-apple-ink)]"
                    style={{ letterSpacing: "-0.012em" }}
                  >
                    {k}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ─── 요약 본문 ─────────────── */}
        {material.summary && material.summary.length > 0 && (
          <section className="mt-14 fade-up fade-up-3 sm:mt-16">
            <article className="rounded-[18px] bg-white px-7 py-9 sm:px-10 sm:py-12">
              <SummaryBody blocks={material.summary} />
            </article>
          </section>
        )}

        {/* ─── Footer CTA ─────────────── */}
        <section className="mt-14 fade-up fade-up-4 sm:mt-20">
          <div className="rounded-[18px] bg-white px-7 py-9 sm:px-12 sm:py-12">
            <div className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} />
              <p
                className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                요약을 다 읽으셨다면
              </p>
            </div>
            <h2
              className="mt-3 text-[26px] leading-[1.12] wght-620 text-[var(--color-apple-ink)] sm:text-[34px]"
              style={{ letterSpacing: "-0.012em" }}
            >
              이제 직접 풀어보면서 점검해 봐요.
            </h2>
            <p
              className="mt-4 max-w-[520px] text-[14px] leading-[1.6] wght-450 text-[var(--color-apple-muted)] sm:text-[15px]"
              style={{ letterSpacing: "-0.022em" }}
            >
              객관식 · 주관식 · 서술형 중에 골라 문제를 만들 수 있어요. 모든 문제는 이 자료의
              문장에서만 나와요.
            </p>

            <div className="mt-7">
              <GenerateButton
                variant="primary"
                courseSlug={course.slug}
                materialId={material.id}
                materialTitle={material.title}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ─────────── 요약 렌더러 — 노션 톤 + Apple ─────────── */

function SummaryBody({ blocks }: { blocks: SummaryBlock[] }) {
  return (
    <div>
      {blocks.map((b, i) => {
        if (b.kind === "h2") {
          return (
            <h3
              key={i}
              className="mt-9 first:mt-0 text-[19px] wght-620 text-[var(--color-apple-ink)] sm:text-[21px]"
              style={{ letterSpacing: "-0.012em" }}
            >
              {b.text}
            </h3>
          );
        }
        if (b.kind === "para") {
          return (
            <p
              key={i}
              className="mt-4 text-[15px] leading-[1.7] text-[var(--color-apple-ink)] sm:text-[16px]"
              style={{ letterSpacing: "-0.012em" }}
            >
              {b.text}
            </p>
          );
        }
        if (b.kind === "bullets") {
          return (
            <ul
              key={i}
              className="mt-4 flex flex-col gap-2 text-[15px] leading-[1.65] text-[var(--color-apple-ink)] sm:text-[16px]"
              style={{ letterSpacing: "-0.012em" }}
            >
              {b.items.map((item, j) => (
                <li key={j} className="flex gap-3">
                  <span
                    aria-hidden
                    className="mt-[10px] h-1 w-1 shrink-0 select-none rounded-full bg-[var(--color-apple-muted)]"
                  />
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
            className={`mt-5 rounded-[12px] px-5 py-4 ${
              isWarn ? "bg-[var(--color-urgent-soft)]" : "bg-[var(--color-apple-pearl)]"
            }`}
          >
            <p
              className={`text-[14px] leading-[1.6] wght-450 ${
                isWarn ? "text-[var(--color-urgent-strong)]" : "text-[var(--color-apple-ink)]"
              }`}
              style={{ letterSpacing: "-0.012em" }}
            >
              {b.text}
            </p>
          </aside>
        );
      })}
    </div>
  );
}
