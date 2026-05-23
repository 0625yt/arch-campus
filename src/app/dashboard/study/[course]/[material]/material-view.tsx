"use client";

import { useState } from "react";
import { SummaryColumn } from "./summary-column";
import { SplitControl, useSplitView } from "./split-control";
import { ChatPanel } from "./chat-panel";
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
  materialId,
  materialTitle,
  className,
}: {
  pdfUrl: string;
  summary: SummarizeOutputT;
  materialId: string;
  materialTitle: string;
  className?: string;
}) {
  const [page, setPage] = useState<number>(1);
  const [view, setView] = useSplitView();
  const [chatOpen, setChatOpen] = useState(false);

  function jumpDesktop(target: number) {
    setPage(target);
    // PDF만 닫혀 있던 상태라면 5:5로 자동 전환 — 학생이 페이지 칩 누른 의도는 PDF 보기
    if (view === "summary-only") setView("split");
  }
  function jumpMobile(target: number) {
    window.open(`${pdfUrl}#page=${target}`, "_blank", "noopener");
  }

  // 인용 chip 클릭 — 데스크탑은 PDF 점프, 모바일은 새 탭
  function jumpFromChat(target: number) {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) {
      jumpDesktop(target);
    } else {
      jumpMobile(target);
    }
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
      {/* 데스크톱: split 컨트롤 + 챗 토글. 우상단 정렬. */}
      <div className="mb-4 hidden items-center justify-end gap-2 md:flex">
        <SplitControl view={view} onChange={setView} />
        <button
          type="button"
          onClick={() => setChatOpen(true)}
          className="inline-flex h-[30px] items-center rounded-full border border-[var(--color-apple-hairline)] bg-white px-3 text-[12px] wght-560 text-[var(--color-apple-ink)] hover:border-[var(--color-apple-action)] hover:text-[var(--color-apple-action)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          이 자료 같이 보기
        </button>
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

      {/* 모바일 floating action button — md 미만에서만 표시 */}
      {!chatOpen && (
        <button
          type="button"
          onClick={() => setChatOpen(true)}
          className="fixed right-5 bottom-5 z-30 inline-flex h-12 items-center gap-2 rounded-full bg-[var(--color-apple-ink)] px-5 text-[13px] wght-560 text-white shadow-lg transition-opacity hover:opacity-90 md:hidden"
          style={{ letterSpacing: "-0.012em" }}
          aria-label="이 자료 같이 보기"
        >
          💬 같이 보기
        </button>
      )}

      <ChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        materialId={materialId}
        materialTitle={materialTitle}
        onJumpPage={jumpFromChat}
      />
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
