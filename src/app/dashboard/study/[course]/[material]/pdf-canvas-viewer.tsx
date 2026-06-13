"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Turbopack에서 same-origin 200으로 emit됨이 스텝 0에서 검증된 패턴 — 모듈 스코프 1회.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

/**
 * 강의자료 PDF를 react-pdf 캔버스로 렌더. iframe PdfViewer 대체 (스텝 1).
 *
 * - 이 컴포넌트가 스크롤 컨테이너 — 루트가 overflow-auto h-full. 이제 우리가 스크롤 소유.
 * - 모든 페이지를 세로 스택으로 렌더(전체 렌더). 페이지 많은 PDF의 성능은
 *   스텝 4에서 가상화로 다룬다 — 지금은 단순 전체 렌더.
 * - width: 컨테이너 px 너비를 ResizeObserver로 측정해 FitH 대응(컬럼 가로에 맞춤).
 * - 점프: page prop이 바뀌면 해당 페이지 wrapper로 scrollIntoView.
 *
 * 시그니처는 기존 PdfViewer와 동일({ src, page })로 호출부 변경 최소화.
 */
export function PdfCanvasViewer({ src, page }: { src: string; page: number }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Map<number, HTMLElement>>(new Map());
  const debounceRef = useRef<number | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [width, setWidth] = useState(0);
  const [hasError, setHasError] = useState(false);

  // 컨테이너 px 너비 측정 — 초기 ref 측정값, 변경 시 약 120ms 디바운스로 재렌더.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width;
      if (!next) return;
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        setWidth(next);
      }, 120);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    };
  }, []);

  // 점프 — page prop이 바뀌면 해당 페이지 wrapper로 부드럽게 스크롤.
  useEffect(() => {
    if (numPages === 0) return;
    const target = pageRefs.current.get(page);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [page, numPages]);

  if (hasError) {
    return (
      <div className="flex h-full w-full items-center justify-center px-6 text-center text-[13px] wght-560 text-[var(--color-apple-muted)]">
        PDF를 불러오지 못했습니다.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-auto"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <Document
        file={src}
        loading={null}
        error={null}
        onLoadSuccess={(doc) => setNumPages(doc.numPages)}
        onLoadError={(err) => {
          // version mismatch 등 — console에 원인 남기고 사용자에게 한 줄.
          console.error("[pdf-canvas-viewer] PDF load failed:", err);
          setHasError(true);
        }}
      >
        {width > 0 &&
          Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
            <div
              key={n}
              ref={(el) => {
                if (el) pageRefs.current.set(n, el);
                else pageRefs.current.delete(n);
              }}
            >
              <Page pageNumber={n} width={width} />
            </div>
          ))}
      </Document>
    </div>
  );
}
