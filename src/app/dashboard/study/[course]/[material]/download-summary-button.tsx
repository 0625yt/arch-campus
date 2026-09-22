"use client";

import { useCallback } from "react";

/**
 * 요약을 PDF로 저장 — window.print() 기반.
 *
 * 동작:
 *   1) body에 .arch-printing 클래스 토글
 *   2) globals.css @media print 규칙이 .arch-print-target 영역만 출력하게 함
 *   3) window.print() 호출 → 브라우저 인쇄 다이얼로그에서 "PDF로 저장" 선택
 *   4) afterprint 이벤트로 클래스 정리
 *
 * 비용·서버 부담 0 — 클라이언트만으로 처리.
 * 한국어 폰트는 브라우저 시스템 폰트가 그대로 박혀서 임베디드 폰트 문제 없음.
 */
export function DownloadSummaryButton({
  filename,
  className,
}: {
  /** 저장 다이얼로그 기본 제목 — 브라우저 document.title에 잠시 적용 */
  filename: string;
  className?: string;
}) {
  const handle = useCallback(() => {
    if (typeof window === "undefined") return;
    const target = document.querySelector<HTMLElement>(".arch-print-target");
    if (!target) {
      window.alert("요약 영역을 찾지 못했어요. 페이지를 새로고침한 뒤 다시 시도해주세요.");
      return;
    }

    // ancestor의 sticky·100vh·split-view layout이 print 시 빈 공간을 차지하는 문제를
    // 피하기 위해 target을 잠시 body 직속으로 옮긴다. afterprint에서 원래 자리로 복귀.
    const originalParent = target.parentElement;
    const originalNextSibling = target.nextSibling;
    if (!originalParent) {
      window.alert("요약 영역의 부모를 찾지 못했어요.");
      return;
    }

    const originalTitle = document.title;
    document.title = filename;
    document.body.appendChild(target);
    document.body.classList.add("arch-printing");

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      document.body.classList.remove("arch-printing");
      document.title = originalTitle;
      // 원래 자리로 복귀 — nextSibling이 살아있으면 그 앞에, 아니면 부모 끝에
      if (originalNextSibling && originalNextSibling.parentNode === originalParent) {
        originalParent.insertBefore(target, originalNextSibling);
      } else {
        originalParent.appendChild(target);
      }
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
    // afterprint를 못 받는 브라우저 안전망
    setTimeout(cleanup, 1500);
  }, [filename]);

  return (
    <button
      type="button"
      onClick={handle}
      className={
        className ??
        "inline-flex h-[30px] items-center gap-1.5 rounded-full border border-[var(--color-apple-hairline)] bg-white px-3 text-[12px] wght-560 text-[var(--color-apple-ink)] hover:border-[var(--color-apple-action)] hover:text-[var(--color-apple-action)]"
      }
      style={{ letterSpacing: "-0.012em" }}
      aria-label="요약을 PDF로 저장"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <title>아이콘</title>
        <path
          d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      PDF로 저장
    </button>
  );
}
