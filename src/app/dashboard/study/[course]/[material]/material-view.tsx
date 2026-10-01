"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SummarizeOutputT } from "@/lib/schemas";
import { ChatPanel } from "./chat-panel";
import { SplitControl, useSplitView } from "./split-control";
import { SummaryColumn } from "./summary-column";

// react-pdf는 클라이언트 전용 (SSR 평가 시 DOMMatrix 터짐) — ssr:false로만 로드.
const PdfCanvasViewer = dynamic(
  () => import("./pdf-canvas-viewer").then((m) => m.PdfCanvasViewer),
  { ssr: false },
);

/**
 * 자료 상세의 split-view 본체.
 *
 * 데스크톱(md+):
 *  - flex row — 좌 PDF / 가운데 핸들 / 우 요약. 좌측 flex-basis %로 비율.
 *  - segmented preset: PDF만 / 5:5 / 요약만.
 *  - 핸들 드래그: setPointerCapture()로 핸들이 포인터 잡고, mousemove에서
 *    React state 거치지 않고 ref로 직접 inline style 갱신 → 60fps 부드러움.
 *    pointerup 1회만 React state + localStorage 커밋.
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
  const [pageRequest, setPageRequest] = useState({ page: 1, nonce: 0 });
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
    // 같은 p.N을 다시 눌러도 사용자가 PDF를 수동으로 스크롤한 뒤
    // 원문 위치로 돌아갈 수 있도록 요청 자체를 매번 새로 만든다.
    setPageRequest((current) => ({
      page: target,
      nonce: current.nonce + 1,
    }));
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
      if (handle?.hasPointerCapture(e.pointerId)) {
        handle.releasePointerCapture(e.pointerId);
      }
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      const left = leftRef.current;
      const right = rightRef.current;
      if (left) left.style.removeProperty("transition");
      if (right) right.style.removeProperty("transition");
      // React state + localStorage에 한 번만 반영
      commitRatio(liveRatioRef.current);
    },
    [commitRatio],
  );

  const resizeFromKeyboard = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (view !== "split") return;

      let next: number;
      switch (event.key) {
        case "ArrowLeft":
          next = liveRatioRef.current - KEYBOARD_RATIO_STEP;
          break;
        case "ArrowRight":
          next = liveRatioRef.current + KEYBOARD_RATIO_STEP;
          break;
        case "Home":
          next = MIN_RATIO;
          break;
        case "End":
          next = MAX_RATIO;
          break;
        default:
          return;
      }

      event.preventDefault();
      const safe = clamp(next, MIN_RATIO, MAX_RATIO);
      liveRatioRef.current = safe;
      commitRatio(safe);
    },
    [commitRatio, view],
  );

  // unmount cleanup
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
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
          className="sticky top-4 h-[calc(100dvh-2rem)] min-w-0 shrink-0 overflow-hidden rounded-[18px] bg-white transition-[flex-basis,opacity] duration-300 ease-out"
          style={{
            flexBasis: leftBasis,
            opacity: view === "summary-only" ? 0 : 1,
            pointerEvents: view === "summary-only" ? "none" : undefined,
          }}
        >
          <div className="h-full w-full" id="arch-pdf-wrap">
            <PdfCanvasViewer
              src={pdfUrl}
              page={pageRequest.page}
              requestNonce={pageRequest.nonce}
            />
          </div>
        </div>

        {/* 가운데 핸들 — 16px 폭. ::before로 ±8px hit-area. setPointerCapture로 드래그 안정성. */}
        {/* biome-ignore lint/a11y/useSemanticElements: range-valued interactive separator는 자식 grip을 가질 수 없는 void 요소 <hr>로 표현할 수 없다. */}
        <div
          ref={handleRef}
          role="separator"
          aria-orientation="vertical"
          aria-label="PDF와 요약 너비 조절"
          aria-controls="arch-pdf-wrap arch-summary-wrap"
          aria-valuemin={MIN_RATIO * 100}
          aria-valuemax={MAX_RATIO * 100}
          aria-valuenow={Math.round(ratio * 100)}
          aria-valuetext={`PDF ${Math.round(ratio * 100)}%, 요약 ${Math.round((1 - ratio) * 100)}%`}
          tabIndex={view === "split" ? 0 : -1}
          onKeyDown={resizeFromKeyboard}
          onPointerDown={startDrag}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={() => commitRatio(0.5)}
          title="드래그하거나 방향키로 너비 조절 · 더블클릭하면 5:5"
          className={`group sticky top-4 z-20 h-[calc(100dvh-2rem)] w-4 shrink-0 cursor-col-resize touch-none select-none rounded-[6px] outline-none before:absolute before:inset-y-0 before:-left-2 before:-right-2 before:content-[''] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-apple-action)] ${
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
          id="arch-summary-wrap"
          className="min-w-0 shrink-0 transition-[flex-basis,opacity] duration-300 ease-out"
          style={{
            flexBasis: rightBasis,
            opacity: view === "pdf-only" ? 0 : 1,
            pointerEvents: view === "pdf-only" ? "none" : undefined,
          }}
        >
          <SummaryColumn summary={summary} onPageClick={jumpDesktop} materialId={materialId} />
        </div>
      </div>

      <div className="md:hidden">
        <SummaryColumn summary={summary} onPageClick={jumpMobile} materialId={materialId} />
      </div>

      {!chatOpen && (
        // mobile-nav가 bottom-0 h-14 + safe-area라 그 위에 띄움. 이모지 본문 X (DESIGN §10).
        <button
          type="button"
          onClick={() => setChatOpen(true)}
          className="fixed right-5 z-30 inline-flex h-12 items-center gap-2 rounded-full bg-[var(--color-apple-ink)] px-5 text-[13px] wght-560 text-white shadow-lg transition-opacity hover:opacity-90 md:hidden"
          style={{
            letterSpacing: "-0.012em",
            bottom: "calc(56px + env(safe-area-inset-bottom, 0px) + 12px)",
          }}
          aria-label="이 자료 같이 보기"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <title>이 자료 같이 보기</title>
            <path
              d="M21 12a9 9 0 1 1-3.46-7.1L21 4l-1.1 3.46A8.96 8.96 0 0 1 21 12Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          같이 보기
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
const KEYBOARD_RATIO_STEP = 0.05; // 방향키 한 번에 5%p

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
