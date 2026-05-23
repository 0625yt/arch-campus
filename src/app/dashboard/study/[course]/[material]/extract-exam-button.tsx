"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useJob } from "@/lib/hooks/use-job";

/**
 * "기출 추출하기" 버튼 — type=exam 자료에서 본문 문제·정답·해설을 그대로 가져온다.
 *
 * 차이점 (SummarizeNowButton과 비교):
 *  - POST /api/materials/{id}/exam-extract
 *  - 완료 시 router.refresh()로 서버 컴포넌트 다시 로드 → 추출 결과가 페이지에 표시
 *
 * 치팅 라인 가드 (§4): 버튼 자체는 그냥 추출 트리거. 정답 노출은 풀이 페이지의 게이트 컴포넌트가 책임.
 */
export function ExtractExamButton({ materialId }: { materialId: string }) {
  const router = useRouter();
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { job, error: pollError } = useJob(jobId);

  async function handle() {
    setSubmitError(null);
    try {
      const res = await fetch(`/api/materials/${materialId}/exam-extract`, { method: "POST" });
      const json = (await res.json()) as { ok: boolean; jobId?: string; error?: string };
      if (!res.ok || !json.ok || !json.jobId) {
        setSubmitError(json.error ?? "기출 추출 시작에 실패했어요.");
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
    ? "기출문제 추출하기"
    : job?.status === "done"
      ? "추출 완료 — 새로고침 중…"
      : job?.status === "error"
        ? "추출 실패 — 다시 시도"
        : "추출 중… 다른 메뉴 가도 돼요";

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
          본문에서 문제·정답·해설을 그대로 가져오는 중이에요. 30~60초 정도 걸려요.
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
