"use client";

import { useEffect, useRef, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";

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
 *
 * 외부에서 즉시 갱신이 필요할 때 (업로드 직후 등) `pingActiveJobs()` 호출 →
 * 다음 tick까지 기다리지 않고 즉시 fetch.
 */

/** 모든 useActiveJobs 인스턴스에 즉시 refetch 요청 */
const refetchListeners = new Set<() => void>();
export function pingActiveJobs(): void {
  for (const fn of refetchListeners) fn();
}

/**
 * 서버 응답 기다리지 않고 dock에 임시 row를 박는다. 업로드 진행 표시 등에 사용.
 *
 * 자동 제거 정책:
 *  - server jobs에 같은 materialId가 잡히면 더 자세한 row가 있으니 제거
 *  - 위에 안 잡혀도 6초 후 자동 만료 (그 사이 잡들이 다 끝났을 수 있음)
 *  - 명시적 removeOptimisticJob도 가능
 */
export interface OptimisticJob extends ActiveJobRow {
  /** dock에 박힌 시각 — 만료 판단용 */
  pinnedAt?: number;
}
const optimisticListeners = new Set<(rows: OptimisticJob[]) => void>();
let optimisticPool: OptimisticJob[] = [];
const OPTIMISTIC_TTL_MS = 6000;

export function addOptimisticJob(row: OptimisticJob): void {
  const pinned: OptimisticJob = { ...row, pinnedAt: row.pinnedAt ?? Date.now() };
  optimisticPool = [pinned, ...optimisticPool.filter((r) => r.id !== pinned.id)];
  for (const fn of optimisticListeners) fn(optimisticPool);
}
export function removeOptimisticJob(id: string): void {
  optimisticPool = optimisticPool.filter((r) => r.id !== id);
  for (const fn of optimisticListeners) fn(optimisticPool);
}

/** TTL 지난 row 청소 — useActiveJobs tick에서 호출 */
function pruneExpiredOptimistic(): boolean {
  const now = Date.now();
  const next = optimisticPool.filter(
    (r) => r.pinnedAt == null || now - r.pinnedAt < OPTIMISTIC_TTL_MS,
  );
  if (next.length === optimisticPool.length) return false;
  optimisticPool = next;
  for (const fn of optimisticListeners) fn(optimisticPool);
  return true;
}

export function useActiveJobs() {
  const [serverJobs, setServerJobs] = useState<ActiveJobRow[]>([]);
  const [optimistic, setOptimistic] = useState<OptimisticJob[]>(optimisticPool);
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
          setServerJobs(j.jobs);
          setError(null);
        }
        // 만료된 optimistic 청소
        pruneExpiredOptimistic();
        // 서버에 잡이 도착했으면 같은 materialId의 optimistic은 자동 제거
        if (j.ok) {
          for (const o of optimisticPool) {
            if (o.materialId && j.jobs.some((sv) => sv.materialId === o.materialId)) {
              removeOptimisticJob(o.id);
            }
          }
        }
        const next = j.jobs.length > 0 || optimisticPool.length > 0 ? 2000 : 6000;
        timerRef.current = setTimeout(tick, next);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        timerRef.current = setTimeout(tick, 8000);
      }
    }

    function pingNow() {
      if (cancelled || stoppedRef.current) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      tick();
    }
    refetchListeners.add(pingNow);

    // Realtime burst (한 자료 처리 중 잡이 pending→running→done 3번 update)에 매번 refetch 가지 않게
    // 300ms 안에 들어온 추가 트리거는 한 번으로 합침.
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    function debouncedPing() {
      if (cancelled || stoppedRef.current) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        pingNow();
      }, 300);
    }

    function syncOptimistic(rows: OptimisticJob[]) {
      if (cancelled) return;
      setOptimistic(rows);
    }
    optimisticListeners.add(syncOptimistic);

    // Realtime — jobs 테이블 INSERT/UPDATE/DELETE 시 debounce 후 refetch.
    // 필터 X (사용자 본인 owner_id row만 RLS에 의해 도달).
    // polling은 그대로 유지 — Realtime 끊긴 짧은 구간의 안전망.
    //
    // 채널 이름 unique: 같은 페이지에서 hook이 두 번 마운트되거나 (StrictMode 또는 dock과 다른
    // 컴포넌트가 동시에 호출) supabase-js가 같은 채널을 재사용해서 subscribe() 후 .on()을
    // 박으려 하면 throw — "cannot add postgres_changes callbacks ... after subscribe()".
    // 매 instance마다 별도 채널 이름을 줘서 충돌 봉인.
    const supabase = getBrowserSupabase();
    const channelName = `active-jobs:${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "jobs" }, () => {
        debouncedPing();
      })
      .subscribe();

    tick();

    return () => {
      cancelled = true;
      refetchListeners.delete(pingNow);
      optimisticListeners.delete(syncOptimistic);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, []);

  // optimistic이 같은 materialId 서버 잡을 갖고 있으면 중복 제거
  const merged: ActiveJobRow[] = [
    ...optimistic.filter(
      (o) => !o.materialId || !serverJobs.some((s) => s.materialId === o.materialId),
    ),
    ...serverJobs,
  ];

  return { jobs: merged, error };
}
