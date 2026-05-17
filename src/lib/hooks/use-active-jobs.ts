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
 * 서버 응답 기다리지 않고 dock에 임시 row를 박는다. id가 같은 서버 row가 도착하면
 * 자연스럽게 덮어쓰임. 업로드 진행 표시 등에 사용.
 */
export interface OptimisticJob extends ActiveJobRow {}
const optimisticListeners = new Set<(rows: OptimisticJob[]) => void>();
let optimisticPool: OptimisticJob[] = [];
export function addOptimisticJob(row: OptimisticJob): void {
  optimisticPool = [row, ...optimisticPool.filter((r) => r.id !== row.id)];
  for (const fn of optimisticListeners) fn(optimisticPool);
}
export function removeOptimisticJob(id: string): void {
  optimisticPool = optimisticPool.filter((r) => r.id !== id);
  for (const fn of optimisticListeners) fn(optimisticPool);
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
        // 서버에 잡이 도착했으면 같은 materialId의 optimistic은 자동 제거
        if (j.ok) {
          for (const o of optimisticPool) {
            if (
              o.materialId &&
              j.jobs.some((sv) => sv.materialId === o.materialId)
            ) {
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

    function syncOptimistic(rows: OptimisticJob[]) {
      if (cancelled) return;
      setOptimistic(rows);
    }
    optimisticListeners.add(syncOptimistic);

    tick();

    return () => {
      cancelled = true;
      refetchListeners.delete(pingNow);
      optimisticListeners.delete(syncOptimistic);
      if (timerRef.current) clearTimeout(timerRef.current);
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
