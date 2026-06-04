import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { WizardWatermark } from "@/components/wizard-shell";
import { tryGetOwnerId } from "@/lib/auth";
import { getLatestJob } from "@/lib/data/jobs";
import {
  getMaterialDetail,
  listMaterialsByCourse,
  type MaterialDetail,
  type MaterialListItem,
} from "@/lib/data/materials";
import { getExtractedExam, listQuizzesForMaterial } from "@/lib/data/quizzes";
import { getDefaultStyles, type SummaryStyle } from "@/lib/material-policy";
import type { SummarizeOutputT } from "@/lib/schemas";
import { createSignedReadUrl } from "@/lib/storage";
import { detectSubject } from "@/lib/subject-detector";
import { DownloadSummaryButton } from "./download-summary-button";
import { ExtractExamView } from "./extract-exam-view";
import { GenerateButton, type SiblingMaterialOption } from "./generate-button";
import { MaterialTabs } from "./material-tabs";
import { MaterialView } from "./material-view";
import { ResummarizePanel } from "./resummarize-panel";
import { SummarizeWithStyles } from "./summarize-with-styles";
import { SummaryLoading } from "./summary-loading";

export const dynamic = "force-dynamic";

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

  // mime 분기:
  //   - PDF + signed URL OK → MaterialView (split iframe + summary)
  //   - 그 외 (이미지·텍스트 등 PDF 아님)  → SummaryArticle (요약만)
  // Office/HWP는 finalize에서 422로 차단되어 여기 도달하지 않음 (2026-05-31 CloudConvert 제거).
  const isPdf = detail.mimeType === "application/pdf";
  let pdfUrl: string | null = null;
  if (isPdf && detail.storagePath) {
    try {
      pdfUrl = await createSignedReadUrl({ storagePath: detail.storagePath });
    } catch {
      pdfUrl = null;
    }
  }

  // summary가 아직 없을 때 — 잡 상태로 안내 분기
  const summarizeJob = detail.summary
    ? null
    : await getLatestJob({ ownerId, materialId: detail.id, tool: "summarize" });
  const summarizeStatus = summarizeJob?.status ?? null;
  const summarizeError = summarizeJob?.errorMessage ?? null;

  // type=exam은 별도 흐름 — 본문에서 기출문제·정답·해설 추출
  // (요약 생성 X. CLAUDE.md §4 치팅 라인)
  const isExamType = detail.type === "exam";
  const extracted = isExamType ? await getExtractedExam({ ownerId, materialId: detail.id }) : null;
  const extractJob =
    isExamType && !extracted
      ? await getLatestJob({ ownerId, materialId: detail.id, tool: "exam-extract" })
      : null;

  // 요약 스타일 default — 강의명·자료 제목에서 과목 추론 후 type별 추천 (2~3개)
  // exam은 빈 배열 — picker 자체를 안 보임
  const subject = detectSubject({
    courseName: detail.course?.name ?? null,
    materialTitle: detail.title,
  });
  const defaultStyles: SummaryStyle[] = isExamType ? [] : getDefaultStyles(detail.type, subject);

  // 이 자료로 만든 모든 퀴즈 — 요약 다 읽은 뒤 "전에 만든 문제 다시 풀기" 진입점.
  // 종전엔 풀어본 적 있는 퀴즈만 today에 보였고, 만들기만 한 퀴즈는 어디서도 못 찾았음.
  // exam type은 별도 흐름이라 제외.
  const materialQuizzes = isExamType
    ? []
    : await listQuizzesForMaterial({ ownerId, materialId: detail.id, limit: 10 });

  // 같은 과목의 다른 자료들 — 상단 chip rail로 바로 전환 (사용자 요청 2026-05-30).
  // course 없는 개인 공부 자료(orphan)는 nav 안 띄움 (의미 없음).
  const siblingMaterials: MaterialListItem[] = detail.course?.id
    ? await listMaterialsByCourse({ ownerId, courseId: detail.course.id })
    : [];

  return (
    <div>
      <div className="mx-auto w-full max-w-[920px] px-5 pb-24 pt-6 sm:px-8 sm:pb-28 sm:pt-8 md:max-w-[1400px] md:px-10">
        <Breadcrumb courseLabel={courseLabel} dotColor={dotColor} />
        <MaterialTabs
          courseLabel={courseLabel}
          materials={siblingMaterials}
          currentMaterialId={detail.id}
        />
        <Hero detail={detail} />

        {!isExamType && detail.summary && (
          <div className="mt-4 flex flex-wrap items-center gap-2 fade-up fade-up-2">
            <DownloadSummaryButton filename={`${detail.title} 요약`} />
          </div>
        )}

        {isExamType ? (
          extracted ? (
            <ExtractExamView extracted={extracted} className="mt-6 fade-up fade-up-3 sm:mt-8" />
          ) : extractJob?.status === "pending" || extractJob?.status === "running" ? (
            <ExtractExamLoading className="mt-6 fade-up fade-up-3 sm:mt-8" />
          ) : (
            <ExtractExamEmpty
              courseLabel={courseLabel}
              detail={detail}
              extractError={
                extractJob?.status === "error" ? (extractJob.errorMessage ?? null) : null
              }
              className="mt-6 fade-up fade-up-3 sm:mt-8"
              siblingMaterials={siblingMaterials.map((s) => ({
                id: s.id,
                title: s.title,
                type: s.type,
              }))}
            />
          )
        ) : detail.summary ? (
          isPdf && pdfUrl ? (
            <MaterialView
              pdfUrl={pdfUrl}
              summary={detail.summary}
              materialId={detail.id}
              materialTitle={detail.title}
              className="mt-6 fade-up fade-up-3 sm:mt-8"
            />
          ) : (
            <SummaryArticle summary={detail.summary} className="mt-6 fade-up fade-up-3 sm:mt-8" />
          )
        ) : summarizeStatus === "error" ? (
          <SummaryErrorCard
            materialId={detail.id}
            filename={detail.title}
            summarizeError={summarizeError}
            defaultStyles={defaultStyles}
            className="mt-6 fade-up fade-up-3 sm:mt-8"
          />
        ) : (
          <SummaryLoading
            materialId={detail.id}
            className="mt-6 fade-up fade-up-3 sm:mt-8"
            fallback={<EmptySummary materialId={detail.id} defaultStyles={defaultStyles} />}
          />
        )}

        {!isExamType && detail.summary && (
          <ResummarizePanel materialId={detail.id} className="mt-6 fade-up fade-up-3 sm:mt-8" />
        )}

        {!isExamType && detail.summaryKeywords && detail.summaryKeywords.length > 0 && (
          <Keywords keywords={detail.summaryKeywords} className="mt-6 fade-up fade-up-2" />
        )}

        {materialQuizzes.length > 0 && (
          <MaterialQuizzes
            quizzes={materialQuizzes}
            dotColor={dotColor}
            className="mt-6 fade-up fade-up-3 sm:mt-8"
          />
        )}

        <CtaCard
          detail={detail}
          courseLabel={courseLabel}
          dotColor={dotColor}
          siblingMaterials={siblingMaterials.map((s) => ({
            id: s.id,
            title: s.title,
            type: s.type,
          }))}
        />
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
    <header className="mt-5 fade-up fade-up-2 sm:mt-6">
      <p className="text-[11px] wght-700 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
        {labelForType(detail.type)}
      </p>
      <h1
        className="mt-2 text-[24px] leading-[1.1] wght-700 text-[var(--color-apple-ink)] sm:text-[32px] sm:leading-[1.05] md:text-[36px]"
        style={{ letterSpacing: "-0.022em" }}
      >
        {detail.title}
      </h1>

      <div
        className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] wght-450 text-[var(--color-apple-muted)]"
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

/* ─────────── type=exam 분기 컴포넌트들 ─────────── */

function ExtractExamEmpty({
  courseLabel,
  detail,
  extractError,
  className,
  siblingMaterials,
}: {
  courseLabel: string;
  detail: MaterialDetail;
  extractError: string | null;
  className?: string;
  siblingMaterials: SiblingMaterialOption[];
}) {
  const isErrorState = extractError !== null;
  return (
    <section className={className}>
      <div className="elev-1 rounded-[18px] bg-white px-7 py-12 text-center sm:py-16">
        {isErrorState && (
          <span
            aria-hidden
            className="mx-auto mb-4 flex h-7 w-7 items-center justify-center rounded-full bg-[#fde8eb] text-[14px] wght-700 text-[var(--color-urgent)]"
          >
            !
          </span>
        )}
        <p
          className="text-[18px] wght-620 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {isErrorState ? "기출 추출에 실패했어요" : "기출문제를 추출해 볼까요?"}
        </p>
        <p
          className="mx-auto mt-3 max-w-[460px] text-[14px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.022em" }}
        >
          {isErrorState
            ? (extractError ??
              "잠시 후 다시 시도하면 보통 풀려요. 자료가 시험지가 아니라면 자료 종류를 다시 설정해 주세요.")
            : "이 자료의 문제·정답·해설을 그대로 가져와요. 새 문제를 만들지 않아요. 본인이 풀어보고 답을 적은 뒤 정답을 확인할 수 있어요."}
        </p>
        <div className="mt-7 flex justify-center">
          <GenerateButton
            variant="primary"
            courseSlug={courseLabel}
            materialId={detail.id}
            materialTitle={detail.title}
            materialType={detail.type}
            siblingMaterials={siblingMaterials.map((s) => ({
              id: s.id,
              title: s.title,
              type: s.type,
            }))}
          />
        </div>
      </div>
    </section>
  );
}

function ExtractExamLoading({ className }: { className?: string }) {
  return (
    <section className={className}>
      <div className="elev-1 rounded-[18px] bg-white px-7 py-12 text-center sm:py-16">
        <p
          className="text-[16px] wght-560 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          기출문제를 추출하는 중이에요
        </p>
        <p
          className="mx-auto mt-3 max-w-[460px] text-[13px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.022em" }}
        >
          본문에서 문제·정답·해설을 그대로 가져오고 있어요. 30~60초 정도 걸려요.
        </p>
      </div>
    </section>
  );
}

function EmptySummary({
  materialId,
  defaultStyles,
  className,
}: {
  materialId: string;
  defaultStyles: SummaryStyle[];
  className?: string;
}) {
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
          자료 본문에서 핵심 단원·키워드·복습 포인트를 정리합니다. 30~60초 소요.
        </p>
        <div className="mt-7 flex justify-center">
          <SummarizeWithStyles materialId={materialId} defaultStyles={defaultStyles} />
        </div>
      </div>
    </section>
  );
}

/**
 * summary 잡이 error로 끝났을 때 — 사용자에게 이유를 보여주고 다시 시도하게.
 * "그냥 다시 만들기"만 띄우면 무한 retry될 수 있으니 "다른 자료 올리러 가기" fallback도 함께.
 */
function SummaryErrorCard({
  materialId,
  filename,
  summarizeError,
  defaultStyles,
  className,
}: {
  materialId: string;
  filename: string;
  summarizeError: string | null;
  defaultStyles: SummaryStyle[];
  className?: string;
}) {
  const body =
    summarizeError || "잠시 후 다시 시도하면 보통 풀려요. 같은 자료를 다시 올리는 것도 방법이에요.";
  return (
    <section className={className}>
      <div className="elev-1 rounded-[18px] bg-white px-7 py-10 sm:px-10 sm:py-12">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded-full bg-[#fde8eb] text-[14px] wght-700 text-[var(--color-urgent,#c44)]"
          >
            !
          </span>
          <p
            className="text-[18px] wght-620 text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            요약을 만들지 못했어요
          </p>
        </div>
        <p
          className="mt-4 max-w-[560px] text-[14px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.022em" }}
        >
          {body}
        </p>
        <div className="mt-7 flex flex-wrap items-start gap-4">
          <SummarizeWithStyles materialId={materialId} defaultStyles={defaultStyles} />
          <Link
            href="/dashboard/study"
            className="rounded-[8px] border border-[var(--color-apple-hairline)] bg-white px-3.5 py-2 text-[13px] wght-560 text-[var(--color-apple-ink)] hover:border-[var(--color-apple-action)] hover:text-[var(--color-apple-action)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            다른 자료 올리러 가기
          </Link>
        </div>
        <p
          className="mt-4 text-[11px] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {filename}
        </p>
      </div>
    </section>
  );
}

/**
 * 이 자료로 만든 퀴즈 목록 — 요약 바로 아래·CTA 위에 박힘.
 *
 * 사용자가 자료를 다시 열었을 때 "전에 만든 다른 난이도 문제 다시 풀기"로 직진할 수 있게
 * 항상 자료 시야 안에 둔다. 사이드바 "내 문제"가 글로벌이라면 여기는 자료별 로컬 인덱스.
 *
 * 정책:
 *   - quizzes 0개면 호출부에서 컴포넌트 자체를 안 띄움 (조용히 숨김)
 *   - 풀어본 적 있는 세트는 최근 점수, 안 풀어본 세트는 "아직 안 풀었어요" 액센트
 *   - 카드 클릭 시 풀이 화면으로 직진 (자료 슬러그 모름·이미 자료 안이라 quizId만)
 */
function MaterialQuizzes({
  quizzes,
  dotColor,
  className,
}: {
  quizzes: Array<{
    id: string;
    title: string;
    difficulty: "쉬움" | "보통" | "어려움";
    questionCount: number;
    createdAt: string;
    attemptCount: number;
    lastScore: number | null;
  }>;
  dotColor: string;
  className?: string;
}) {
  return (
    <section className={className}>
      <header className="flex items-baseline justify-between gap-3">
        <h2
          className="text-[14px] wght-620 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "0.06em" }}
        >
          이 자료로 만든 문제 · {quizzes.length}세트
        </h2>
        <Link
          href="/dashboard/quiz"
          className="text-[12px] wght-450 text-[var(--color-apple-action)] hover:underline"
          style={{ letterSpacing: "-0.012em" }}
        >
          내 문제 전체 ›
        </Link>
      </header>
      <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {quizzes.map((q) => (
          <li key={q.id}>
            <Link
              href={`/dashboard/quiz/${q.id}`}
              className="group block rounded-[14px] border border-[var(--color-apple-hairline)] bg-white px-4 py-3.5 transition-colors hover:border-[var(--color-apple-action)]/30"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className="text-[11px] wght-560 uppercase tracking-[0.06em]"
                  style={{ color: dotColor, letterSpacing: "0.06em" }}
                >
                  {q.difficulty} · {q.questionCount}문제
                </span>
                <span
                  className="shrink-0 text-[11px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  {formatRelative(q.createdAt)}
                </span>
              </div>
              <p
                className="mt-2 line-clamp-1 text-[14px] wght-560 text-[var(--color-apple-ink)] group-hover:text-[var(--color-apple-action)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                {q.title}
              </p>
              <p
                className="mt-1 text-[12px] wght-450 text-[var(--color-apple-muted)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                {q.attemptCount === 0 ? (
                  <span className="wght-560 text-[var(--color-apple-action)]">
                    아직 안 풀었어요
                  </span>
                ) : q.lastScore !== null ? (
                  <span className="tabular-nums">
                    최근 {q.lastScore}/{q.questionCount} · {q.attemptCount}회 풀이
                  </span>
                ) : (
                  <span className="tabular-nums">{q.attemptCount}회 풀이</span>
                )}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CtaCard({
  detail,
  courseLabel,
  dotColor,
  siblingMaterials,
}: {
  detail: MaterialDetail;
  courseLabel: string;
  dotColor: string;
  siblingMaterials: SiblingMaterialOption[];
}) {
  // type=exam은 별도 흐름 — 위쪽에 추출 결과·게이트가 이미 있으니 CTA 카드 X (정보 중복).
  if (detail.type === "exam") return null;

  return (
    // 결과 화면 "새 문제 만들기"가 #generate 해시로 직진하면 여기로 스크롤된다.
    // scroll-mt-* 는 sticky 헤더 가림 보정 — 윗 헤더 약 56px + 여백 여유로 80px.
    <section id="generate" className="mt-8 fade-up fade-up-4 scroll-mt-[80px] sm:mt-10">
      {/* 캘린더 EventChip 톤 — 좌측 컬러 ribbon + hover 시 살짝 글로우. dotColor가 카테고리 단서. */}
      <div
        className="card-glow-ribbon elev-1 relative overflow-hidden rounded-[18px] bg-white px-7 py-9 sm:px-12 sm:py-12"
        style={{ ["--ribbon-color" as string]: dotColor }}
      >
        <p
          className="text-[12px] wght-560 uppercase tracking-[0.06em]"
          style={{ color: dotColor, letterSpacing: "0.06em" }}
        >
          {detail.summary ? "요약을 다 읽었다면" : "요약 없이도 문제 생성 가능"}
        </p>
        <h2
          className="mt-3 text-[26px] leading-[1.12] wght-620 text-[var(--color-apple-ink)] sm:text-[34px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          직접 풀어보면서 점검
        </h2>
        <p
          className="mt-4 max-w-[520px] text-[14px] leading-[1.6] wght-450 text-[var(--color-apple-muted)] sm:text-[15px]"
          style={{ letterSpacing: "-0.022em" }}
        >
          객관식, 단답형, 서술형까지 이 자료 기준으로 바로 점검할 수 있어요. 모든 문제는 이 자료의
          문장에서만 나와요.
        </p>

        <div className="mt-7">
          <GenerateButton
            variant="primary"
            courseSlug={courseLabel}
            materialId={detail.id}
            materialTitle={detail.title}
            materialType={detail.type}
            siblingMaterials={siblingMaterials.map((s) => ({
              id: s.id,
              title: s.title,
              type: s.type,
            }))}
          />
        </div>
      </div>
    </section>
  );
}

/* ─────────── 요약 본문 ─────────── */

function SummaryArticle({ summary, className }: { summary: SummarizeOutputT; className?: string }) {
  return (
    <section className={className}>
      <article className="arch-print-target elev-1 rounded-[18px] bg-white px-7 py-9 sm:px-10 sm:py-12">
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
