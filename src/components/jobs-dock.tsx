"use client";

import Link from "next/link";
import { useActiveJobs, type ActiveJobRow } from "@/lib/hooks/use-active-jobs";

/**
 * 진행 중인 비동기 AI 작업 (요약·문제·위저드 등)을 어디서든 보여주는 도크.
 *
 * 데스크톱: 우하단 floating 카드 (sidebar와 안 겹치게 right).
 * 모바일: 하단 tab bar 위에 띄움.
 *
 * 항상 1번 fetch로 active 전체 가져옴. 작업 0개면 마운트 자체 안 함.
 */
export function JobsDock() {
  const { jobs } = useActiveJobs();
  if (jobs.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[72px] z-40 flex justify-center px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:justify-end sm:px-0">
      <div className="pointer-events-auto w-full max-w-[360px] overflow-hidden rounded-[14px] border border-[var(--color-apple-hairline)] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08),0_2px_6px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-2 border-b border-[var(--color-apple-hairline-soft)] px-4 py-2.5">
          <Pulse />
          <p
            className="text-[12px] wght-560 text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            진행 중 {jobs.length}건
          </p>
          <span
            className="ml-auto text-[10.5px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            끝나면 자동 갱신
          </span>
        </div>
        <ul>
          {jobs.slice(0, 3).map((j) => (
            <li key={j.id}>
              <JobRow job={j} />
            </li>
          ))}
          {jobs.length > 3 && (
            <li className="px-4 py-2 text-[11px] wght-450 text-[var(--color-apple-muted)]">
              + {jobs.length - 3}건 더
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function JobRow({ job }: { job: ActiveJobRow }) {
  const href = jobHref(job);
  const inner = (
    <div className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--color-apple-pearl)]">
      <Spinner />
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-[12.5px] wght-560 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {job.toolLabel}
        </p>
        {job.materialTitle && (
          <p
            className="truncate text-[11px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {job.materialTitle}
          </p>
        )}
      </div>
      <span className="shrink-0 text-[10.5px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
        {job.status === "pending" ? "대기" : "진행"}
      </span>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function jobHref(job: ActiveJobRow): string | null {
  // 자료 작업이면 해당 자료 페이지로 — 결과 돌아오면 거기서 보임
  if (job.materialId && job.courseId) {
    return `/dashboard/study/${encodeURIComponent(job.courseId)}/${job.materialId}`;
  }
  return null;
}

function Pulse() {
  return (
    <span aria-hidden className="relative inline-flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-apple-action)] opacity-60" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-apple-action)]" />
    </span>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-[var(--color-apple-hairline)] border-t-[var(--color-apple-action)]"
    />
  );
}
