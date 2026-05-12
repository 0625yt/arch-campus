"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useJob } from "@/lib/hooks/use-job";

/**
 * "요약 만들기" — 비동기.
 *
 * 흐름:
 *   1) POST /api/materials/{id}/summarize → 즉시 { jobId }
 *   2) useJob(jobId)가 1.5초 간격 폴링
 *   3) status=done이면 router.refresh()로 서버 컴포넌트 다시 로드
 *
 * 작업 중 사용자가 다른 페이지로 나가도 백그라운드에서 계속 진행됨.
 * 페이지로 돌아오면 server-side에서 자료의 summary_payload를 직접 읽어 보임 (jobId 안 잡혀도 OK).
 */
export function SummarizeNowButton({ materialId }: { materialId: string }) {
  const router = useRouter();
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { job, error: pollError } = useJob(jobId);

  async function handle() {
    setSubmitError(null);
    try {
      const res = await fetch(`/api/materials/${materialId}/summarize`, { method: "POST" });
      const json = (await res.json()) as {
        ok: boolean;
        jobId?: string;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.jobId) {
        setSubmitError(json.error ?? "요약 시작에 실패했어요.");
        return;
      }
      setJobId(json.jobId);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "네트워크 오류");
    }
  }

  useEffect(() => {
    if (job?.status === "done") router.refresh();
  }, [job?.status, router]);

  const isRunning = jobId && (job?.status === "pending" || job?.status === "running" || !job);
  const isError = job?.status === "error" || submitError !== null || pollError !== null;

  const label = !jobId
    ? "요약 만들기"
    : job?.status === "done"
      ? "요약 완료 — 새로고침 중…"
      : job?.status === "error"
        ? "요약 실패 — 다시 시도"
        : "요약 만드는 중… 다른 메뉴 가도 돼요";

  const errorMsg = submitError ?? pollError ?? (job?.status === "error" ? job.errorMessage : null);

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handle}
        disabled={Boolean(isRunning)}
        className="inline-flex h-[44px] items-center gap-2 rounded-full bg-[var(--color-apple-action)] px-6 text-[14px] wght-560 text-white transition-all hover:bg-[var(--color-apple-action-hover)] active:scale-[0.97] disabled:opacity-60"
        style={{ letterSpacing: "-0.012em" }}
      >
        {isRunning && <Spinner />}
        {label}
      </button>
      {isError && errorMsg && (
        <p className="text-[12px] wght-450 text-[var(--color-urgent)]">{errorMsg}</p>
      )}
      {isRunning && (
        <p
          className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          백그라운드에서 진행 중이에요. 이 페이지를 떠나도 이어집니다.
        </p>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-label="진행 중"
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-white/40 border-t-white"
    />
  );
}
