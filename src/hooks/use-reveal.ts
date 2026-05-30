"use client";

import { useEffect, useRef } from "react";

/**
 * IntersectionObserver로 viewport 진입 시 [data-revealed="true"] 토글.
 *
 * 사용:
 *   const ref = useReveal();
 *   <section ref={ref} data-reveal>...
 *
 * CSS:
 *   [data-reveal] { opacity: 0 }
 *   [data-reveal][data-revealed="true"] { animation: scale-in 480ms forwards }
 *
 * 한 번 fire 후 disconnect. prefers-reduced-motion일 땐 즉시 표시.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(threshold = 0.4) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      el.dataset.revealed = "true";
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.dataset.revealed = "true";
            io.disconnect();
            break;
          }
        }
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return ref;
}
