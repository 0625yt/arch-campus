"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * 라우팅 progress bar — App Router 전용.
 *
 * App Router는 nProgress류 라이브러리가 쓰는 router 이벤트를 노출하지 않으므로
 * 클릭 시점에서 직접 시작 신호를 받는다:
 *   1) document에 캡처 단계로 클릭 리스너 — <a href> 또는 <button data-href>를 누르면 start
 *   2) pathname/searchParams가 바뀌면 complete (전환 끝)
 *   3) 같은 URL이거나 modifier+click이면 무시
 *
 * 디자인 — Apple 톤: 코발트 그라데이션, 2px 두께, 위에서 stick.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimers() {
    if (tickerRef.current) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
    if (fadeTimerRef.current) {
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }
  }

  function start() {
    clearTimers();
    setVisible(true);
    setProgress(8);
    // 점진 증가 — 90%까지만 자체 진행, 진짜 도착하면 100% 채움
    tickerRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p;
        // 시작은 빠르게, 후반은 느리게 (Apple Mail 톤)
        const step = p < 30 ? 8 : p < 60 ? 4 : 1.5;
        return Math.min(90, p + step);
      });
    }, 180);
  }

  function complete() {
    clearTimers();
    setProgress(100);
    fadeTimerRef.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 240);
  }

  // 1) 클릭 캡처 — 같은 origin, 새 URL이면 start
  useEffect(() => {
    function onClick(e: MouseEvent) {
      // 보조 키 — 새 탭/창은 우리 라우팅 아님
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const anchor = target.closest("a") as HTMLAnchorElement | null;
      if (!anchor) return;
      // download/외부 새 탭/javascript: 등은 무시
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:"))
        return;
      try {
        const url = new URL(anchor.href, window.location.origin);
        if (url.origin !== window.location.origin) return;
        // 같은 URL — 라우팅 안 일어남
        const sameUrl =
          url.pathname === window.location.pathname &&
          url.search === window.location.search;
        if (sameUrl) return;
      } catch {
        return;
      }
      start();
    }
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  // 2) pathname/searchParams 바뀌면 complete
  useEffect(() => {
    if (!visible) return;
    complete();
    // visible은 의도적으로 deps에서 제외 — start 직후 같은 effect가 또 돌면 곤란
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  // 안전망 — 6초 넘게 안 끝나면 강제 완료
  useEffect(() => {
    if (!visible) return;
    const safety = setTimeout(() => complete(), 6000);
    return () => clearTimeout(safety);
  }, [visible]);

  // unmount cleanup
  useEffect(() => clearTimers, []);

  if (!visible && progress === 0) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[2px]"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 180ms var(--ease-out)" }}
    >
      <div
        className="h-full origin-left"
        style={{
          width: `${progress}%`,
          background:
            "linear-gradient(90deg, #0071e3 0%, #4f7be8 60%, #8e7ee0 100%)",
          boxShadow: "0 0 8px rgba(0, 113, 227, 0.4)",
          transition:
            "width 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms var(--ease-out)",
        }}
      />
    </div>
  );
}
