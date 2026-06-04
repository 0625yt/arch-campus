"use client";

import { useEffect, useState } from "react";

/**
 * 모바일(<640px) 여부. NowBanner·TimetableHero가 공유 — 같은 breakpoint로
 * "오늘만" 뷰 + 단일 날짜 strip을 동기화한다(5일 strip vs 1일 그리드 불일치 제거).
 *
 * SSR-safe: 초기값 false(데스크톱)로 시작, 마운트 후 실제 매칭으로 보정.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return isMobile;
}

/**
 * 현재 다크 테마 여부 (html[data-theme="dark"]). 시간표 셀 색을 다크용 불투명 색으로
 * 갈아끼우는 데 쓴다. theme-toggle이 data-theme를 바꾸므로 MutationObserver로 추적.
 */
export function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const html = document.documentElement;
    const read = () => setIsDark(html.getAttribute("data-theme") === "dark");
    read();
    const mo = new MutationObserver(read);
    mo.observe(html, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return isDark;
}
