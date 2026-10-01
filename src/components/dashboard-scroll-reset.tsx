"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";

/** App Router가 복원하지 않는 dashboard 내부 스크롤을 화면 전환마다 맨 위로 돌린다. */
export function DashboardScrollReset() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    void pathname;
    const container = document.querySelector<HTMLElement>("[data-dashboard-scroll]");
    container?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return null;
}
