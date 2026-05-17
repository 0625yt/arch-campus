import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { WizardWatermark } from "@/components/wizard-shell";
import { tryGetOwnerId } from "@/lib/auth";
import { getLatestJob } from "@/lib/data/jobs";
import { getMaterialDetail, type MaterialDetail } from "@/lib/data/materials";
import type { SummarizeOutputT } from "@/lib/schemas";
import { createSignedReadUrl } from "@/lib/storage";
import { GenerateButton } from "./generate-button";
import { MaterialView } from "./material-view";
import { SplitWithConvertingLeft, SplitWithFailedLeft } from "./pdf-convert-states";
import { SummarizeNowButton } from "./summarize-now-button";
import { SummaryLoading } from "./summary-loading";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MaterialDetailPage({
  params,
}: {
  params: Promise<{ course: string; material: string }>;
}) {
  const { course: courseParam, material: materialParam } = await params;
  const courseSlug = decodeURIComponent(courseParam);
  const materialId = decodeURIComponent(materialParam);

  if (!UUID_RE.test(materialId)) notFound();

  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  const detail = await getMaterialDetail({ ownerId, materialId });
  if (!detail) notFound();

  const courseLabel = detail.course?.name ?? courseSlug;
  const dotColor = detail.course?.color ?? "var(--color-apple-action)";

  // mime + convert-pdf job 상태로 4-way 분기:
  //   1) PDF + signed URL OK  → MaterialView (split iframe + summary)
  //   2) Office + 변환 중      → SplitWithConvertingLeft (polling)
  //   3) Office + 변환 실패    → SplitWithFailedLeft (다운로드 fallback)
  //   4) 그 외 (변환 잡 없음 등) → 기존 SummaryArticle
  const isPdf = detail.mimeType === "application/pdf";
  let pdfUrl: string | null = null;
  let convertingPdf = false;
  let convertFailed = false;

  if (isPdf && detail.storagePath) {
    try {
      pdfUrl = await createSignedReadUrl({ storagePath: detail.storagePath });
    } catch {
      pdfUrl = null;
    }
  } else if (!isPdf) {
    const convertJob = await getLatestJob({
      ownerId,
      materialId: detail.id,
      tool: "convert-pdf",
    });
    if (convertJob && (convertJob.status === "pending" || convertJob.status === "running")) {
      convertingPdf = true;
    } else if (convertJob && convertJob.status === "error") {
      convertFailed = true;
    }
  }

  return (
    <div>
      <div className="mx-auto w-full max-w-[920px] px-6 pb-32 pt-8 sm:px-10 sm:pb-40 sm:pt-12 md:max-w-[1400px] md:px-12">
        <Breadcrumb courseLabel={courseLabel} dotColor={dotColor} />
        <Hero detail={detail} />

        {detail.summary ? (
          isPdf && pdfUrl ? (
            <MaterialView
              pdfUrl={pdfUrl}
              summary={detail.summary}
              className="mt-14 fade-up fade-up-3 sm:mt-16"
            />
          ) : convertingPdf ? (
            <SplitWithConvertingLeft
              materialId={detail.id}
              summary={detail.summary}
              className="mt-14 fade-up fade-up-3 sm:mt-16"
            />
          ) : convertFailed ? (
            <SplitWithFailedLeft
              materialId={detail.id}
              summary={detail.summary}
              filename={detail.title}
              className="mt-14 fade-up fade-up-3 sm:mt-16"
            />
          ) : (
            <SummaryArticle summary={detail.summary} className="mt-14 fade-up fade-up-3 sm:mt-16" />
          )
        ) : (
          <SummaryLoading
            materialId={detail.id}
            className="mt-14 fade-up fade-up-3 sm:mt-16"
            fallback={<EmptySummary materialId={detail.id} />}
          />
        )}

        {detail.summaryKeywords && detail.summaryKeywords.length > 0 && (
          <Keywords keywords={detail.summaryKeywords} className="mt-12 fade-up fade-up-2" />
        )}

        <CtaCard detail={detail} courseLabel={courseLabel} dotColor={dotColor} />
      </div>
    </div>
  );
}

function Breadcrumb({ courseLabel, dotColor }: { courseLabel: string; dotColor: string }) {
  return (
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
        href={`/dashboard/study/${courseLabel}`}
        className="shrink-0 wght-560 hover:opacity-80"
        style={{ color: dotColor }}
      >
        {courseLabel}
      </Link>
    </nav>
  );
}

function Hero({ detail }: { detail: MaterialDetail }) {
  return (
    <header className="mt-10 fade-up fade-up-1 sm:mt-14">
      <p
        className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {labelForType(detail.type)}
      </p>
      <h1
        className="mt-3 text-[30px] leading-[1.1] wght-620 text-[var(--color-apple-ink)] sm:text-[40px] sm:leading-[1.06] md:text-[44px]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {detail.title}.
      </h1>

      <div
        className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] wght-450 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {detail.pageCount != null && (
          <>
            <span className="tabular-nums">{detail.pageCount}쪽</span>
            <span className="text-[var(--color-apple-hairline)]">·</span>
          </>
        )}
        <span>{formatRelative(detail.uploadedAt)} 업로드</span>
        {detail.lastSummarizedAt && (
          <>
            <span className="text-[var(--color-apple-hairline)]">·</span>
            <span>요약 {formatRelative(detail.lastSummarizedAt)}</span>
          </>
        )}
      </div>
    </header>
  );
}

function Keywords({ keywords, className }: { keywords: string[]; className?: string }) {
  return (
    <section className={className}>
      <h2 className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
        핵심 키워드
      </h2>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {keywords.slice(0, 16).map((k) => (
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
  );
}

function EmptySummary({ materialId, className }: { materialId: string; className?: string }) {
  return (
    <section className={className}>
      <div className="elev-1 rounded-[18px] bg-white px-7 py-12 text-center sm:py-16">
        <p
          className="text-[18px] wght-620 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          아직 요약이 없어요
        </p>
        <p
          className="mx-auto mt-3 max-w-[420px] text-[14px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.022em" }}
        >
          자료 본문을 읽어 핵심 단원·키워드·복습 포인트를 정리해드려요. 30~60초 정도 걸려요.
        </p>
        <div className="mt-7 flex justify-center">
          <SummarizeNowButton materialId={materialId} />
        </div>
      </div>
    </section>
  );
}

function CtaCard({
  detail,
  courseLabel,
  dotColor,
}: {
  detail: MaterialDetail;
  courseLabel: string;
  dotColor: string;
}) {
  return (
    <section className="mt-14 fade-up fade-up-4 sm:mt-20">
      <div className="elev-1 rounded-[18px] bg-white px-7 py-9 sm:px-12 sm:py-12">
        <p
          className="text-[12px] wght-560 uppercase tracking-[0.06em]"
          style={{ color: dotColor, letterSpacing: "0.06em" }}
        >
          {detail.summary ? "요약을 다 읽으셨다면" : "요약 없이도 문제를 만들 수 있어요"}
        </p>
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
          4지선다 문제를 1~10개까지 만들 수 있어요. 모든 문제는 이 자료의 문장에서만 나와요.
        </p>

        <div className="mt-7">
          <GenerateButton
            variant="primary"
            courseSlug={courseLabel}
            materialId={detail.id}
            materialTitle={detail.title}
          />
        </div>
      </div>
    </section>
  );
}

/* ─────────── 요약 본문 ─────────── */

function SummaryArticle({
  summary,
  className,
}: {
  summary: SummarizeOutputT;
  className?: string;
}) {
  return (
    <section className={className}>
      <article className="elev-1 rounded-[18px] bg-white px-7 py-9 sm:px-10 sm:py-12">
        <p
          className="text-[15px] leading-[1.65] wght-560 text-[var(--color-apple-ink)] sm:text-[16px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {summary.leadSentence}
        </p>

        <SummaryBlocks blocks={summary.blocks} />

        {summary.reviewSpots.length > 0 && (
          <div className="mt-12 border-t border-[var(--color-apple-hairline)] pt-7">
            <h3 className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
              한 번 더 보면 좋은 부분
            </h3>
            <ul className="mt-4 flex flex-col gap-4">
              {summary.reviewSpots.map((spot, i) => (
                <li key={i}>
                  <p
                    className="text-[15px] wght-560 text-[var(--color-apple-ink)]"
                    style={{ letterSpacing: "-0.012em" }}
                  >
                    {spot.title}
                  </p>
                  <p
                    className="mt-1 text-[13.5px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]"
                    style={{ letterSpacing: "-0.022em" }}
                  >
                    {spot.why}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>

      <div className="mt-4 px-2">
        <WizardWatermark modelText={summary.watermark} />
      </div>
    </section>
  );
}

function SummaryBlocks({ blocks }: { blocks: SummarizeOutputT["blocks"] }) {
  return (
    <div>
      {blocks.map((b, i) => {
        const pageHint = "sourcePage" in b && b.sourcePage ? `p.${b.sourcePage}` : null;
        if (b.type === "h2") {
          return (
            <h3
              key={i}
              className="mt-9 flex items-baseline gap-2 first:mt-0 text-[19px] wght-620 text-[var(--color-apple-ink)] sm:text-[21px]"
              style={{ letterSpacing: "-0.012em" }}
            >
              <span>{b.content}</span>
              {pageHint && (
                <span className="text-[11px] wght-450 tabular-nums text-[var(--color-apple-muted)]">
                  {pageHint}
                </span>
              )}
            </h3>
          );
        }
        if (b.type === "para") {
          return (
            <p
              key={i}
              className="mt-4 text-[15px] leading-[1.7] text-[var(--color-apple-ink)] sm:text-[16px]"
              style={{ letterSpacing: "-0.012em" }}
            >
              {b.content}
              {pageHint && (
                <span className="ml-1.5 text-[11px] wght-450 tabular-nums text-[var(--color-apple-muted)]">
                  ({pageHint})
                </span>
              )}
            </p>
          );
        }
        if (b.type === "bullets") {
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
                  <span>
                    {item}
                    {j === 0 && pageHint && (
                      <span className="ml-1.5 text-[11px] wght-450 tabular-nums text-[var(--color-apple-muted)]">
                        ({pageHint})
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          );
        }
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
              {b.content}
              {pageHint && (
                <span className="ml-1.5 text-[11px] wght-450 tabular-nums opacity-70">
                  ({pageHint})
                </span>
              )}
            </p>
          </aside>
        );
      })}
    </div>
  );
}

/* ─────────── 헬퍼 ─────────── */

function labelForType(type: MaterialDetail["type"]): string {
  switch (type) {
    case "lecture":
      return "강의자료";
    case "assignment":
      return "과제";
    case "exam":
      return "시험";
    case "syllabus":
      return "강의계획서";
    case "team":
      return "팀플";
    case "notice":
      return "공지";
    default:
      return "자료";
  }
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "최근";
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}일 전`;
  const mon = Math.round(day / 30);
  return `${mon}개월 전`;
}
