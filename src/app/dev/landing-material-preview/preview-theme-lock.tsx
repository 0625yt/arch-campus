"use client";

import { useEffect } from "react";

/**
 * 랜딩 캡처용 화면은 공개 이미지의 색이 항상 같아야 한다.
 * 사용자의 저장된 테마 값은 건드리지 않고, 이 개발 전용 route가 열린 동안만
 * 문서에 적용된 dark attribute를 잠시 제거한다.
 */
export function PreviewThemeLock() {
  useEffect(() => {
    const root = document.documentElement;
    const previousTheme = root.getAttribute("data-theme");
    const previousColorScheme = root.style.colorScheme;

    root.removeAttribute("data-theme");
    root.style.colorScheme = "light";

    return () => {
      if (previousTheme) root.setAttribute("data-theme", previousTheme);
      else root.removeAttribute("data-theme");
      root.style.colorScheme = previousColorScheme;
    };
  }, []);

  return null;
}
