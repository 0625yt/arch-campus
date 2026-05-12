"use client";

import { useEffect, useRef, useState } from "react";

export interface ActiveJobRow {
  id: string;
  tool: string;
  toolLabel: string;
  status: "pending" | "running";
  materialId: string | null;
  materialTitle: string | null;
  courseId: string | null;
  createdAt: string;
  startedAt: string | null;
}

/**
 * 사용자의 active 작업 목록을 폴링.
 *
 * 정책:
 * - 작업 있을 때 2초 간격
 * - 작업 0개일 때 6초 간격 (idle 부하 줄임)
 * - 페이지 hidden일 때 폴링 정지
 * - 401이면 조용히 멈춤 (로그인 화면일 가능성)
 */
export function useActiveJobs() {
  const [jobs, setJobs] = useState<ActiveJobRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    stoppedRef.current = false;

    async function tick() {
      if (cancelled || stoppedRef.current) return;
      if (typeof document !== "undefined" && document.hidden) {
        timerRef.current = setTimeout(tick, 4000);
        return;
      }
      try {
        const r = await fetch("/api/jobs/active", { cache: "no-store" });
        if (r.status === 401) {
          stoppedRef.current = true;
          return; // 로그인 안 됐으면 폴링 멈춤
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as { ok: boolean; jobs: ActiveJobRow[] };
        if (cancelled) return;
        if (j.ok) {
          setJobs(j.jobs);
          setError(null);
        }
        const next = j.jobs.length > 0 ? 2000 : 6000;
        timerRef.current = setTimeout(tick, next);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        timerRef.current = setTimeout(tick, 8000);
      }
    }

    tick();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { jobs, error };
}
