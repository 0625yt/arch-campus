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
 *  - flex row — 좌 PDF / 가운데 핸들 / 우 요약. 좌측 flex-basis %로 비율.
 *  - segmented preset: PDF만 / 5:5 / 요약만.
 *  - 핸들 드래그: setPointerCapture()로 핸들이 포인터 잡고, mousemove에서
 *    React state 거치지 않고 ref로 직접 inline style 갱신 → 60fps 부드러움.
 *    pointerup 1회만 React state + localStorage 커밋.
 *  - 드래그 중 iframe은 pointer-events:none — mousemove 가로채기 방지.
 *
 * 모바일(<md): 단일 컬럼 요약만. 페이지 칩은 새 탭 PDF.
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
  const [ratio, commitRatio] = useSplitRatio();
  const [chatOpen, setChatOpen] = useState(false);

  // 드래그 중 부드러움을 위해 — DOM 직접 갱신용 refs.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const liveRatioRef = useRef(ratio);

  // ratio가 외부에서(localStorage 로드 등) 바뀌면 ref 동기화
  useEffect(() => {
    liveRatioRef.current = ratio;
  }, [ratio]);

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

  // 드래그 시작 — setPointerCapture로 핸들이 포인터 독점.
  // 캡처되면 마우스가 어디로 가든 pointermove 이벤트는 핸들이 받음.
  const startDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const handle = handleRef.current;
      if (!handle) return;
      handle.setPointerCapture(e.pointerId);
      draggingRef.current = true;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      // iframe이 mousemove 가로채지 않게 — global CSS hook
      document.body.setAttribute("data-arch-dragging", "1");
      // 드래그 시작하면 split로 전환 — 컬럼 둘 다 보여야 함
      if (view !== "split") setView("split");
      // 드래그 중 transition off
      const left = leftRef.current;
      const right = rightRef.current;
      if (left) left.style.transition = "none";
      if (right) right.style.transition = "none";
    },
    [view, setView],
  );

  // 핸들에 바인딩된 pointermove — capture된 상태라 어디서든 호출됨.
  // requestAnimationFrame으로 throttle.
  const rafRef = useRef<number | null>(null);
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const root = rootRef.current;
    if (!root) return;
    // 매 이벤트마다 rAF — 한 프레임에 여러 번 발화해도 한 번만 페인트
    if (rafRef.current != null) return;
    const clientX = e.clientX;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const rect = root.getBoundingClientRect();
      const x = clientX - rect.left;
      const next = clamp(x / rect.width, MIN_RATIO, MAX_RATIO);
      liveRatioRef.current = next;
      const left = leftRef.current;
      const right = rightRef.current;
      if (left) left.style.flexBasis = `${next * 100}%`;
      if (right) right.style.flexBasis = `${(1 - next) * 100}%`;
    });
  }, []);

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      const handle = handleRef.current;
      if (handle && handle.hasPointerCapture(e.pointerId)) {
        handle.releasePointerCapture(e.pointerId);
      }
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      document.body.removeAttribute("data-arch-dragging");
      const left = leftRef.current;
      const right = rightRef.current;
      if (left) left.style.removeProperty("transition");
      if (right) right.style.removeProperty("transition");
      // React state + localStorage에 한 번만 반영
      commitRatio(liveRatioRef.current);
    },
    [commitRatio],
  );

  // unmount cleanup
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      document.body.removeAttribute("data-arch-dragging");
    };
  }, []);

  // preset(pdf-only / summary-only) — flex-basis로 즉시 잠금
  const leftBasis =
    view === "pdf-only" ? "100%" : view === "summary-only" ? "0%" : `${ratio * 100}%`;
  const rightBasis =
    view === "pdf-only" ? "0%" : view === "summary-only" ? "100%" : `${(1 - ratio) * 100}%`;

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

      <div ref={rootRef} className="hidden md:flex md:flex-row md:items-stretch">
        {/* 좌: PDF — flex item. 드래그 중엔 transition off (style 직접 변경) */}
        <div
          ref={leftRef}
          className="sticky top-4 h-[calc(100vh-2rem)] min-w-0 shrink-0 overflow-hidden rounded-[18px] bg-white transition-[flex-basis,opacity] duration-300 ease-out"
          style={{
            flexBasis: leftBasis,
            opacity: view === "summary-only" ? 0 : 1,
            pointerEvents: view === "summary-only" ? "none" : undefined,
          }}
        >
          <div className="h-full w-full" id="arch-pdf-wrap">
            <PdfViewer src={pdfUrl} page={page} />
          </div>
        </div>

        {/* 가운데 핸들 — 16px 폭. ::before로 ±8px hit-area. setPointerCapture로 드래그 안정성. */}
        <div
          ref={handleRef}
          role="separator"
          aria-orientation="vertical"
          aria-label="너비 조절"
          onPointerDown={startDrag}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={() => commitRatio(0.5)}
          title="드래그해서 너비 조절 · 더블클릭하면 5:5"
          className={`group sticky top-4 z-20 h-[calc(100vh-2rem)] w-4 shrink-0 cursor-col-resize touch-none select-none before:absolute before:inset-y-0 before:-left-2 before:-right-2 before:content-[''] ${
            view === "split" ? "" : "pointer-events-none opacity-0"
          }`}
        >
          {/* 가운데 1px 라인 */}
          <span className="pointer-events-none absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-[var(--color-apple-hairline)] transition-colors group-hover:bg-[var(--color-apple-action)] group-active:bg-[var(--color-apple-action)]" />
          {/* grip — 옅게 상시, 호버/드래그 시 강조 */}
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[11px] wght-560 text-[var(--color-apple-muted)] opacity-40 transition-all group-hover:text-[var(--color-apple-action)] group-hover:opacity-100 group-active:text-[var(--color-apple-action)] group-active:opacity-100"
          >
            ⋮⋮
          </span>
        </div>

        {/* 우: 요약 */}
        <div
          ref={rightRef}
          className="min-w-0 shrink-0 transition-[flex-basis,opacity] duration-300 ease-out"
          style={{
            flexBasis: rightBasis,
            opacity: view === "pdf-only" ? 0 : 1,
            pointerEvents: view === "pdf-only" ? "none" : undefined,
          }}
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

      {/* 드래그 중 PDF iframe이 mousemove 가로채지 못하게 — body attr → CSS.
          핸들이 setPointerCapture를 잡아도 iframe 안에서 발화한 이벤트는
          별도 frame이라 capture가 안 되므로, iframe pointer-events 자체를 막는 게 안전. */}
      <style jsx global>{`
        body[data-arch-dragging="1"] iframe {
          pointer-events: none !important;
        }
      `}</style>
    </section>
  );
}

function PdfViewer({ src, page }: { src: string; page: number }) {
  // #view=FitH — 페이지 가로 너비에 자동 맞춤. 컬럼 너비 바뀌어도 비례.
  // 일부 브라우저(Chrome 내장 뷰어)는 toolbar 표시 영역 때문에 약간 작게 잡히므로
  // FitH가 안 먹는 경우 사용자가 뷰어 줌으로 직접 조정.
  return (
    <iframe
      key={page}
      src={`${src}#page=${page}&view=FitH`}
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
  // SSR-safe: 첫 렌더 기본 0.55. 마운트 후 localStorage 반영.
  const [ratio, setRatioState] = useState<number>(0.55);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RATIO_STORAGE_KEY);
      if (raw) {
        const n = parseFloat(raw);
        if (Number.isFinite(n)) setRatioState(clamp(n, MIN_RATIO, MAX_RATIO));
      }
    } catch {
      /* noop */
    }
  }, []);

  const commit = useCallback((next: number) => {
    const safe = clamp(next, MIN_RATIO, MAX_RATIO);
    setRatioState(safe);
    try {
      window.localStorage.setItem(RATIO_STORAGE_KEY, String(safe));
    } catch {
      /* noop */
    }
  }, []);

  return [ratio, commit];
}
