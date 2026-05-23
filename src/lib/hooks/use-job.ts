"use client";

import { useEffect, useRef, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";

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

const TERMINAL_STATUSES: ClientJobStatus[] = ["done", "error", "cancelled"];
const FALLBACK_POLL_MS = 4000; // Realtime 끊겼을 때 fallback

/**
 * 작업 상태 — Realtime 구독 (1순위) + REST polling (fallback).
 *
 * 동작:
 *   1) jobId 들어오면 GET /api/jobs/{id} 1회 — 페이지 진입 시점에 이미 끝났을 수 있음
 *   2) terminal 상태면 거기서 끝
 *   3) 아니면 Supabase Realtime postgres_changes 구독 — jobs row update 즉시 push
 *   4) Realtime이 끊기거나 fallback 모드면 4초 polling으로 떨어짐
 *   5) terminal 상태 받으면 구독·polling 모두 정리
 *
 * 왜 fallback polling이 필요한가:
 *   - Realtime 연결이 끊겼다 살아나는 짧은 구간에 update 누락 가능
 *   - 4초 polling은 1.5초 시절의 1/3 빈도 — 안전망이지 주력 아님
 *
 * RLS 의존:
 *   - jobs 테이블 RLS가 owner_id로 필터하므로 다른 사용자 잡은 구독해도 row 안 받음
 *   - 마이그레이션 0015에서 publication 활성화 필요
 */
export function useJob(jobId: string | null) {
  const [job, setJob] = useState<ClientJobView | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(jobId));
  const [error, setError] = useState<string | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    async function fetchOnce(): Promise<ClientJobView | null> {
      const r = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { ok: boolean; job?: ClientJobView; error?: string };
      if (!j.ok || !j.job) throw new Error(j.error ?? "응답 형식 오류");
      return j.job;
    }

    function applyJob(next: ClientJobView): boolean {
      if (cancelled) return true;
      setJob(next);
      if (TERMINAL_STATUSES.includes(next.status)) {
        setLoading(false);
        return true; // 끝
      }
      return false;
    }

    function scheduleFallbackPoll() {
      if (cancelled) return;
      fallbackTimerRef.current = setTimeout(async () => {
        try {
          const next = await fetchOnce();
          if (next && applyJob(next)) return;
          scheduleFallbackPoll();
        } catch (e) {
          if (cancelled) return;
          // network 일시 오류는 다음 tick에서 재시도 — error UI 띄우지 않음
          scheduleFallbackPoll();
          void e;
        }
      }, FALLBACK_POLL_MS);
    }

    // 1) 초기 fetch
    (async () => {
      try {
        const initial = await fetchOnce();
        if (!initial) return;
        if (applyJob(initial)) return;
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
        return;
      }

      // 2) Realtime 구독
      const supabase = getBrowserSupabase();
      const channel = supabase
        .channel(`job:${jobId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "jobs",
            filter: `id=eq.${jobId}`,
          },
          (payload) => {
            // payload.new는 jobs row의 raw 컬럼명. ClientJobView로 매핑.
            const r = payload.new as Record<string, unknown>;
            const next: ClientJobView = {
              id: String(r.id),
              tool: String(r.tool),
              status: r.status as ClientJobStatus,
              materialId: (r.material_id as string | null) ?? null,
              result: (r.result as Record<string, unknown> | null) ?? null,
              errorMessage: (r.error_message as string | null) ?? null,
              startedAt: (r.started_at as string | null) ?? null,
              finishedAt: (r.finished_at as string | null) ?? null,
              cost: typeof r.cost_usd === "number" ? r.cost_usd : undefined,
            };
            applyJob(next);
          },
        )
        .subscribe();

      // 3) Realtime 안전망 — 4초 polling fallback
      scheduleFallbackPoll();

      // cleanup
      return () => {
        supabase.removeChannel(channel);
      };
    })().catch(() => {});

    return () => {
      cancelled = true;
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
    };
  }, [jobId]);

  return { job, loading, error };
}
