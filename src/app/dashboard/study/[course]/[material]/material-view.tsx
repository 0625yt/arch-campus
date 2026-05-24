"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SummaryColumn } from "./summary-column";
import { SplitControl, useSplitView } from "./split-control";
import { ChatPanel } from "./chat-panel";
import type { SummarizeOutputT } from "@/lib/schemas";

/**
 * 자료 상세의 split-view 본체.
 *
 * 데스크톱(md+):
 *  - 좌 sticky PDF iframe + 우 스크롤 요약
 *  - 우상단 SplitControl segmented (PDF만 / 5:5 / 요약만 preset)
 *  - 두 컬럼 사이 hairline divider를 드래그하면 임의 비율 — localStorage 영속.
 *  - 드래그 중에는 iframe pointer-events: none (iframe이 mousemove 가로채는 문제 회피).
 *
 * 모바일(<md): 단일 컬럼 요약만. 페이지 칩 클릭은 새 탭으로 PDF.
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
  const [ratio, setRatio] = useSplitRatio();
  const [chatOpen, setChatOpen] = useState(false);

  const gridRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  function jumpDesktop(target: number) {
    setPage(target);
    if (view === "summary-only") setView("split");
  }
  function jumpMobile(target: number) {
    window.open(`${pdfUrl}#page=${target}`, "_blank", "noopener");
  }
  function jumpFromChat(target: number) {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) {
      jumpDesktop(target);
    } else {
      jumpMobile(target);
    }
  }

  // 드래그 핸들러 — pointer 이벤트로 마우스·터치·펜 모두 커버
  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const grid = gridRef.current;
      if (!grid) return;
      const rect = grid.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const next = clamp(x / rect.width, MIN_RATIO, MAX_RATIO);
      setRatio(next);
      // 사용자가 드래그하면 preset(pdf-only·summary-only)에서 자동으로 split로 — 컬럼이 보여야 함
      if (view !== "split") setView("split");
    },
    [setRatio, setView, view],
  );

  const stopDrag = useCallback(() => {
    setDragging(false);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", stopDrag);
    window.removeEventListener("pointercancel", stopDrag);
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
  }, [onPointerMove]);

  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  // cleanup on unmount
  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
    };
  }, [onPointerMove, stopDrag]);

  // grid-cols: preset이면 0fr / 1fr / ratio 분기.
  // split일 때는 ratio (드래그로 자유 조절). preset 클릭하면 segmented가 즉시 적용 — ratio는 유지.
  const gridStyle =
    view === "pdf-only"
      ? { gridTemplateColumns: "1fr 0px 0fr" }
      : view === "summary-only"
        ? { gridTemplateColumns: "0fr 0px 1fr" }
        : {
            gridTemplateColumns: `${ratio}fr 16px ${1 - ratio}fr`,
          };

  return (
    <section className={className}>
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

      <div
        ref={gridRef}
        className="hidden md:grid transition-[grid-template-columns] duration-300 ease-out"
        style={{ ...gridStyle, ...(dragging && { transitionDuration: "0ms" }) }}
      >
        <div
          className={`sticky top-4 h-[calc(100vh-2rem)] overflow-hidden rounded-[18px] bg-white transition-opacity duration-300 ${
            view === "summary-only" ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        >
          {/* 드래그 중엔 iframe이 mousemove 가로채지 않게 */}
          <div className={dragging ? "pointer-events-none h-full w-full" : "h-full w-full"}>
            <PdfViewer src={pdfUrl} page={page} />
          </div>
        </div>

        {/* 드래그 핸들 — 16px 폭. 호버하면 액션 컬러 강조. hit-area는 ::before로 좌우 8px씩 추가 확장 */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="너비 조절"
          onPointerDown={startDrag}
          onDoubleClick={() => setRatio(0.5)}
          title="드래그해서 너비 조절 · 더블클릭하면 5:5"
          className={`group sticky top-4 z-20 h-[calc(100vh-2rem)] cursor-col-resize touch-none select-none before:absolute before:inset-y-0 before:-left-2 before:-right-2 before:content-[''] ${
            view === "split" ? "" : "pointer-events-none opacity-0"
          }`}
        >
          {/* 가운데 1px 라인 + 호버 시 강조 */}
          <span
            className={`pointer-events-none absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 transition-colors ${
              dragging
                ? "bg-[var(--color-apple-action)]"
                : "bg-[var(--color-apple-hairline)] group-hover:bg-[var(--color-apple-action)]"
            }`}
          />
          {/* 가운데 grip 인디케이터 — 항상 옅게 보이고, 호버하면 진해짐 */}
          <span
            className={`pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[11px] wght-560 transition-all ${
              dragging
                ? "text-[var(--color-apple-action)] opacity-100"
                : "text-[var(--color-apple-muted)] opacity-40 group-hover:opacity-100 group-hover:text-[var(--color-apple-action)]"
            }`}
            aria-hidden
          >
            ⋮⋮
          </span>
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

// ─────────────────────────────────────────────────────────────
// 드래그 ratio 영속 + 한계
// ─────────────────────────────────────────────────────────────
const RATIO_STORAGE_KEY = "arch.material.splitRatio";
const MIN_RATIO = 0.2; // PDF가 20% 미만으로 줄면 의미 없음
const MAX_RATIO = 0.8; // 요약이 20% 미만이면 글자 잘림

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function useSplitRatio(): [number, (v: number) => void] {
  // SSR-safe: 기본 0.55 (PDF 약간 더 넓게 — 기존 1.2fr_1fr 비슷)
  const [ratio, setRatioState] = useState<number>(0.55);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RATIO_STORAGE_KEY);
      if (raw) {
        const n = parseFloat(raw);
        if (Number.isFinite(n)) setRatioState(clamp(n, MIN_RATIO, MAX_RATIO));
      }
    } catch {
      /* localStorage 막혀있으면 기본값 */
    }
  }, []);

  const setRatio = useCallback((next: number) => {
    const safe = clamp(next, MIN_RATIO, MAX_RATIO);
    setRatioState(safe);
    try {
      window.localStorage.setItem(RATIO_STORAGE_KEY, String(safe));
    } catch {
      /* noop */
    }
  }, []);

  return [ratio, setRatio];
}
