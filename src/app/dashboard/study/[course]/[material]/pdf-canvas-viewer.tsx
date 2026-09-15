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
 * - 점프: page/requestNonce가 바뀌면 해당 페이지 wrapper 위치로 PDF 패널만 스크롤.
 *
 * requestNonce는 같은 페이지를 다시 요청한 경우도 점프를 재실행하기 위한 값.
 */
export function PdfCanvasViewer({
  src,
  page,
  requestNonce,
}: {
  src: string;
  page: number;
  requestNonce: number;
}) {
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

  // 점프 — PDF 내부 컨테이너만 이동한다.
  // scrollIntoView는 스크롤 가능한 모든 조상을 함께 움직여 자료 상세의 제목까지
  // 화면 밖으로 밀어냈다. 컨테이너 기준 좌표를 계산해 PDF 패널에만 적용한다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: requestNonce는 같은 page 값의 재점프를 의도적으로 다시 실행하는 트리거다.
  useEffect(() => {
    if (numPages === 0) return;
    const container = containerRef.current;
    const target = pageRefs.current.get(page);
    if (!container || !target) return;

    const containerTop = container.getBoundingClientRect().top;
    const targetTop = target.getBoundingClientRect().top;
    container.scrollTo({
      top: container.scrollTop + targetTop - containerTop,
      behavior:
        page === 1 || window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
    });
  }, [page, requestNonce, numPages]);

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
