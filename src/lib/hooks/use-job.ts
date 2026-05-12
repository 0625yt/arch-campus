"use client";

import { useEffect, useRef, useState } from "react";

export type ClientJobStatus = "pending" | "running" | "done" | "error" | "cancelled";

export interface ClientJobView {
  id: string;
  tool: string;
  status: ClientJobStatus;
  materialId: string | null;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  cost?: number;
}

/**
 * 작업 상태 폴링 — 끝날 때까지 1.5초 간격으로 GET /api/jobs/{id}.
 *
 * - jobId가 null이면 폴링 X
 * - status가 done/error/cancelled가 되면 폴링 멈춤
 * - 컴포넌트 언마운트 시 자동 정리
 */
export function useJob(jobId: string | null) {
  const [job, setJob] = useState<ClientJobView | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(jobId));
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    async function tick() {
      try {
        const r = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}`);
        }
        const j = (await r.json()) as { ok: boolean; job?: ClientJobView; error?: string };
        if (!j.ok || !j.job) {
          throw new Error(j.error ?? "응답 형식 오류");
        }
        if (cancelled) return;
        setJob(j.job);
        if (j.job.status === "done" || j.job.status === "error" || j.job.status === "cancelled") {
          setLoading(false);
          return; // 폴링 종료
        }
        timerRef.current = setTimeout(tick, 1500);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    }

    tick();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [jobId]);

  return { job, loading, error };
}
