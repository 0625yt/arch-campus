"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Arrow } from "@/components/primitives";
import { useJob } from "@/lib/hooks/use-job";
import { cn } from "@/lib/utils";

type Difficulty = "쉬움" | "보통" | "어려움";

const COUNT_OPTIONS = [1, 3, 5, 10];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function GenerateForm({
  courseSlug,
  materialId,
}: {
  courseSlug: string;
  materialId: string;
}) {
  const router = useRouter();
  const [difficulty, setDifficulty] = useState<Difficulty>("보통");
  const [count, setCount] = useState(5);
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { job, error: pollError } = useJob(jobId);

  const isReal = UUID_RE.test(materialId);
  const busy = jobId !== null && job?.status !== "done" && job?.status !== "error";

  async function handleGenerate() {
    if (!isReal) {
      setSubmitError(
        "이 자료는 디자인 시연용 mock이라 진짜 문제는 못 만들어요. 자료를 새로 업로드해 주세요.",
      );
      return;
    }

    setSubmitError(null);
    setJobId(null);
    try {
      const res = await fetch(`/api/materials/${materialId}/quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ difficulty, count }),
      });
      const json = (await res.json()) as { ok: boolean; jobId?: string; error?: string };
      if (!res.ok || !json.ok || !json.jobId) {
        setSubmitError(json.error ?? "문제 생성에 실패했어요.");
        return;
      }
      setJobId(json.jobId);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "네트워크 오류");
    }
  }

  // 작업 완료되면 새 퀴즈로 자동 이동
  useEffect(() => {
    if (job?.status === "done") {
      const quizId = (job.result as { quizId?: string } | null)?.quizId;
      if (quizId) router.push(`/dashboard/quiz/${quizId}`);
    }
  }, [job?.status, job?.result, router]);

  const errorMsg =
    submitError ?? pollError ?? (job?.status === "error" ? job.errorMessage : null);

  void courseSlug; // future: log course context

  return (
    <div>
      <FieldGroup label="난이도">
        <ul className="-mx-1 flex flex-wrap gap-x-1 gap-y-2">
          {(["쉬움", "보통", "어려움"] as Difficulty[]).map((d) => {
            const active = difficulty === d;
            return (
              <li key={d}>
                <button
                  type="button"
                  onClick={() => setDifficulty(d)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[12.5px] transition-colors",
                    active
                      ? "wght-560 bg-[var(--color-apple-ink)] text-white"
                      : "wght-450 text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]",
                  )}
                >
                  {d}
                </button>
              </li>
            );
          })}
        </ul>
      </FieldGroup>

      <FieldGroup label="문제 수" className="mt-7">
        <ul className="-mx-1 flex flex-wrap gap-x-1 gap-y-2">
          {COUNT_OPTIONS.map((n) => {
            const active = count === n;
            return (
              <li key={n}>
                <button
                  type="button"
                  onClick={() => setCount(n)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[12.5px] tabular-nums transition-colors",
                    active
                      ? "wght-560 bg-[var(--color-apple-ink)] text-white"
                      : "wght-450 text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]",
                  )}
                >
                  {n}문제
                </button>
              </li>
            );
          })}
        </ul>
      </FieldGroup>

      {errorMsg && (
        <p
          className="mt-6 text-[12.5px] wght-450 text-[var(--color-urgent)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {errorMsg}
        </p>
      )}

      <div className="sticky bottom-0 -mx-5 -mb-5 mt-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--color-apple-hairline)] bg-white px-5 py-4 sm:-mx-6 sm:-mb-6 sm:px-6 sm:py-5">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={busy}
          className={cn(
            "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] wght-560 transition-all duration-[var(--duration-fast)]",
            busy
              ? "cursor-wait bg-[var(--color-apple-pearl)] text-[var(--color-apple-muted)]"
              : "bg-[var(--color-apple-ink)] text-white hover:opacity-90",
          )}
        >
          {busy && <Spinner />}
          {busy ? "AI가 만들고 있어요…" : `${count}문제 만들기`}
          {!busy && <Arrow className="text-[12px] transition-transform group-hover:translate-x-0.5" />}
        </button>

        {busy ? (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] wght-450 text-[var(--color-apple-muted)]">
            <span className="tabular-nums text-[var(--color-apple-ink)]">다른 메뉴 가도</span> 이어집니다
          </span>
        ) : (
          <span className="ml-auto hidden items-center gap-1.5 text-[11px] wght-450 text-[var(--color-apple-muted)] sm:inline-flex">
            평균 <span className="tabular-nums text-[var(--color-apple-ink)]">15초</span> 소요
          </span>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-label="진행 중"
      className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-[var(--color-apple-muted)]/40 border-t-[var(--color-apple-ink)]"
    />
  );
}

function FieldGroup({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex items-baseline gap-2">
        <h3 className="text-[11px] wght-700 tabular-nums uppercase text-[var(--color-apple-muted)]">
          {label}
        </h3>
        {hint && (
          <span className="text-[11px] wght-450 text-[var(--color-apple-muted)]">{hint}</span>
        )}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}
