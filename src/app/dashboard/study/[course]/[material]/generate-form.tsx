"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Arrow } from "@/components/primitives";
import { useJob } from "@/lib/hooks/use-job";
import { cn } from "@/lib/utils";

type Difficulty = "쉬움" | "보통" | "어려움";
type Kind = "multiple-choice" | "short-answer" | "essay";

const COUNT_OPTIONS = [1, 3, 5, 10];

const KIND_OPTIONS: Array<{ value: Kind; label: string; subtitle: string }> = [
  { value: "multiple-choice", label: "객관식", subtitle: "4지선다" },
  { value: "short-answer", label: "단답형", subtitle: "단어·구·수식" },
  { value: "essay", label: "서술형", subtitle: "모범답안 비교" },
];

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
  // kinds 빈 배열이면 객관식만 (종전 동작). 학생이 chip 토글하면 활성화.
  const [kinds, setKinds] = useState<Set<Kind>>(new Set());
  const [scope, setScope] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { job, error: pollError } = useJob(jobId);

  function toggleKind(k: Kind) {
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

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
        body: JSON.stringify({
          difficulty,
          count,
          kinds: Array.from(kinds),
          scope: scope.trim(),
        }),
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

      <FieldGroup
        label="문제 종류"
        hint={kinds.size === 0 ? "기본: 객관식만" : `${kinds.size}/3 선택`}
        className="mt-7"
      >
        <ul className="-mx-1 flex flex-wrap gap-x-1 gap-y-2">
          {KIND_OPTIONS.map(({ value, label, subtitle }) => {
            const active = kinds.has(value);
            // 단답·서술은 풀이 UI가 아직 객관식만 동작 → 안내
            const isSolveSupported = value === "multiple-choice";
            return (
              <li key={value}>
                <button
                  type="button"
                  onClick={() => toggleKind(value)}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex items-baseline gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] transition-colors",
                    active
                      ? "wght-560 bg-[var(--color-apple-ink)] text-white"
                      : "wght-450 text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]",
                  )}
                  title={
                    !isSolveSupported
                      ? "단답·서술은 생성은 되지만, 자동 풀이는 곧 추가될 예정이에요."
                      : undefined
                  }
                >
                  {label}
                  <span
                    className={cn(
                      "text-[10.5px] wght-450 tabular-nums",
                      active ? "text-white/65" : "text-[var(--color-apple-muted)]/65",
                    )}
                  >
                    {subtitle}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </FieldGroup>

      <FieldGroup label="출제 범위" hint="선택 — 비워두면 자료 전체" className="mt-7">
        <input
          type="text"
          value={scope}
          onChange={(e) => setScope(e.target.value.slice(0, 200))}
          placeholder="예: 1~3장만 / p.10~30 위주"
          className="w-full rounded-full border border-[var(--color-apple-hairline)] bg-white px-4 py-2 text-[13px] wght-450 text-[var(--color-apple-ink)] outline-none focus:border-[var(--color-apple-action)] placeholder:text-[var(--color-apple-muted)]/55"
          style={{ letterSpacing: "-0.012em" }}
        />
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
