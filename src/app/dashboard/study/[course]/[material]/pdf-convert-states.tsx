"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useActiveJobs } from "@/lib/hooks/use-active-jobs";
import type { SummarizeOutputT } from "@/lib/schemas";
import { SummaryColumn } from "./summary-column";

/**
 * Office 원본인데 PDF 변환이 아직 안 끝난 상태의 split-view.
 * 좌측: spinner + "PDF 변환 중" 카드. polling.
 * 우측: 일반 SummaryColumn (page 칩은 변환 끝나기 전엔 동작 X — 일단 그대로 클릭 가능,
 *       모바일 새 탭으로 가도 원본 파일이라 페이지 점프 미지원이지만 다운은 됨).
 */
export function SplitWithConvertingLeft({
  materialId,
  summary,
  className,
}: {
  materialId: string;
  summary: SummarizeOutputT;
  className?: string;
}) {
  const router = useRouter();
  const { jobs } = useActiveJobs();
  const sawActiveRef = useRef(false);
  const active = jobs.find((j) => j.materialId === materialId && j.tool === "convert-pdf");

  useEffect(() => {
    if (active) {
      sawActiveRef.current = true;
      return;
    }
    if (sawActiveRef.current) {
      router.refresh();
    }
  }, [active, router]);

  function onChipClick() {
    // 변환 끝나기 전엔 페이지 점프 의미 없음 — no-op
  }

  return (
    <section className={className}>
      <div className="hidden md:grid md:grid-cols-[1.2fr_1fr] md:gap-6 lg:grid-cols-[1.3fr_1fr] lg:gap-8">
        <div className="sticky top-4 flex h-[calc(100vh-2rem)] flex-col items-center justify-center rounded-[18px] bg-white px-8 py-12 text-center">
          <span
            aria-hidden
            className="h-9 w-9 animate-spin rounded-full border-2 border-[var(--color-apple-hairline)] border-t-[var(--color-apple-action)]"
          />
          <p
            className="mt-5 text-[15px] wght-560 text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            원본을 PDF로 바꾸는 중이에요
          </p>
          <p
            className="mt-2 max-w-[340px] text-[13px] leading-[1.55] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.022em" }}
          >
            보통 10~30초 걸려요. 끝나면 자동으로 원본이 표시돼요.
          </p>
        </div>
        <SummaryColumn summary={summary} onPageClick={onChipClick} />
      </div>
      <div className="md:hidden">
        <SummaryColumn summary={summary} onPageClick={onChipClick} />
      </div>
    </section>
  );
}

/**
 * Office 원본 + PDF 변환 실패한 상태.
 * 좌측: "변환 실패, 원본 다운로드" fallback. 우측: SummaryColumn.
 */
export function SplitWithFailedLeft({
  materialId,
  summary,
  filename,
  className,
}: {
  materialId: string;
  summary: SummarizeOutputT;
  filename: string;
  className?: string;
}) {
  async function onDownload() {
    const r = await fetch(`/api/materials/${materialId}/original-url`, { cache: "no-store" });
    const b = (await r.json().catch(() => null)) as
      | { ok: true; url: string }
      | { ok: false; error: string }
      | null;
    if (b && b.ok) {
      window.open(b.url, "_blank", "noopener");
    } else {
      alert(b && !b.ok ? b.error : "다운로드 URL 발급 실패");
    }
  }

  return (
    <section className={className}>
      <div className="hidden md:grid md:grid-cols-[1.2fr_1fr] md:gap-6 lg:grid-cols-[1.3fr_1fr] lg:gap-8">
        <div className="sticky top-4 flex h-[calc(100vh-2rem)] flex-col items-center justify-center rounded-[18px] bg-white px-8 py-12 text-center">
          <p
            className="text-[15px] wght-560 text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            원본을 PDF로 바꾸지 못했어요
          </p>
          <p
            className="mt-2 max-w-[340px] text-[13px] leading-[1.55] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.022em" }}
          >
            요약은 정상이에요. 원본 파일은 아래에서 받을 수 있어요.
          </p>
          <button
            type="button"
            onClick={onDownload}
            className="mt-6 rounded-[8px] border border-[var(--color-apple-hairline)] bg-white px-4 py-2 text-[13px] wght-560 text-[var(--color-apple-ink)] hover:border-[var(--color-apple-action)] hover:text-[var(--color-apple-action)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {filename} 다운로드
          </button>
        </div>
        <SummaryColumn summary={summary} onPageClick={() => {}} />
      </div>
      <div className="md:hidden">
        <SummaryColumn summary={summary} onPageClick={() => {}} />
      </div>
    </section>
  );
}
