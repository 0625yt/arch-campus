"use client";

import { useState } from "react";
import { SummaryColumn } from "./summary-column";
import { SplitControl, useSplitView } from "./split-control";
import type { SummarizeOutputT } from "@/lib/schemas";

/**
 * 자료 상세의 split-view 본체.
 *
 * 데스크톱(md+):
 *  - 좌 sticky PDF iframe + 우 스크롤 요약
 *  - 우상단 SplitControl segmented로 PDF만 / 5:5 / 요약만 분기
 *  - 상태 localStorage 영속 (useSplitView)
 *
 * 모바일(<md): 단일 컬럼 요약만. 페이지 칩 클릭은 새 탭으로 PDF.
 *
 * iframe은 page 바뀔 때 key remount — Chrome이 같은 URL의 #page=N fragment만 바뀌면
 * 가끔 점프 안 하는 버그 회피.
 *
 * 분할 변경 시 iframe DOM은 유지 + grid-cols로 컬럼 폭만 0으로 줄임 → display:none이 PDF
 * 로드 끊는 브라우저 회피.
 */
export function MaterialView({
  pdfUrl,
  summary,
  className,
}: {
  pdfUrl: string;
  summary: SummarizeOutputT;
  className?: string;
}) {
  const [page, setPage] = useState<number>(1);
  const [view, setView] = useSplitView();

  function jumpDesktop(target: number) {
    setPage(target);
    // PDF만 닫혀 있던 상태라면 5:5로 자동 전환 — 학생이 페이지 칩 누른 의도는 PDF 보기
    if (view === "summary-only") setView("split");
  }
  function jumpMobile(target: number) {
    window.open(`${pdfUrl}#page=${target}`, "_blank", "noopener");
  }

  // grid-cols-template 동적. summary-only는 PDF 컬럼을 0fr로 → DOM 유지하며 폭만 압축.
  const gridCols =
    view === "pdf-only"
      ? "md:grid-cols-[1fr_0fr]"
      : view === "summary-only"
        ? "md:grid-cols-[0fr_1fr]"
        : "md:grid-cols-[1.2fr_1fr] lg:grid-cols-[1.3fr_1fr]";

  return (
    <section className={className}>
      {/* 데스크톱: split 컨트롤. 우상단 정렬. fade-up은 안 박음 (자료 페이지 진입 자체가 이미 fade). */}
      <div className="mb-4 hidden justify-end md:flex">
        <SplitControl view={view} onChange={setView} />
      </div>

      <div className={`hidden md:grid md:gap-6 lg:gap-8 ${gridCols} transition-[grid-template-columns] duration-300 ease-out`}>
        <div
          className={`sticky top-4 h-[calc(100vh-2rem)] overflow-hidden rounded-[18px] bg-white transition-opacity duration-300 ${
            view === "summary-only" ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        >
          <PdfViewer src={pdfUrl} page={page} />
        </div>
        <div
          className={`transition-opacity duration-300 ${
            view === "pdf-only" ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        >
          <SummaryColumn summary={summary} onPageClick={jumpDesktop} />
        </div>
      </div>

      <div className="md:hidden">
        <SummaryColumn summary={summary} onPageClick={jumpMobile} />
      </div>
    </section>
  );
}

function PdfViewer({ src, page }: { src: string; page: number }) {
  // key remount로 fragment 점프를 안정적으로
  return (
    <iframe
      key={page}
      src={`${src}#page=${page}`}
      title="자료 원본 PDF"
      className="h-full w-full"
    />
  );
}

export function PageChip({ page, onClick }: { page: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center rounded-[6px] border border-[var(--color-apple-hairline)] bg-white px-1.5 py-0.5 text-[11px] wght-560 tabular-nums text-[var(--color-apple-muted)] hover:border-[var(--color-apple-action)] hover:text-[var(--color-apple-action)]"
      style={{ letterSpacing: "-0.012em" }}
    >
      p.{page}
    </button>
  );
}
