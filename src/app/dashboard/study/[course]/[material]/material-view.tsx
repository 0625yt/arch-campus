"use client";

import { useState } from "react";
import { SummaryColumn } from "./summary-column";
import type { SummarizeOutputT } from "@/lib/schemas";

/**
 * 자료 상세의 split-view 본체.
 *
 * 데스크톱(md+): 좌측 sticky PDF iframe + 우측 스크롤 summary.
 * 모바일(<md): 단일 컬럼 summary만. 페이지 칩은 새 탭으로 PDF를 열도록 분기.
 *
 * iframe은 page 바뀔 때 key remount — Chrome이 같은 URL의 #page=N fragment만
 * 바뀌면 가끔 점프 안 하는 버그가 있어, 안정성 우선 위해 강제 remount.
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

  function jumpDesktop(target: number) {
    setPage(target);
  }
  function jumpMobile(target: number) {
    window.open(`${pdfUrl}#page=${target}`, "_blank", "noopener");
  }

  return (
    <section className={className}>
      <div className="hidden md:grid md:grid-cols-[1.2fr_1fr] md:gap-6 lg:grid-cols-[1.3fr_1fr] lg:gap-8">
        <div className="sticky top-4 h-[calc(100vh-2rem)] overflow-hidden rounded-[18px] bg-white">
          <PdfViewer src={pdfUrl} page={page} />
        </div>
        <SummaryColumn summary={summary} onPageClick={jumpDesktop} />
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
