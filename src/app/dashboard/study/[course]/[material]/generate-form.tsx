"use client";

import Link from "next/link";
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

const PRESETS = [
  {
    label: "빠르게 점검",
    subtitle: "객관식 3문제로 바로 체크",
    difficulty: "보통" as Difficulty,
    count: 3,
    kinds: ["multiple-choice"] as Kind[],
  },
  {
    label: "시험 직전",
    subtitle: "객관식 + 단답형으로 헷갈리는 부분 확인",
    difficulty: "어려움" as Difficulty,
    count: 5,
    kinds: ["multiple-choice", "short-answer"] as Kind[],
  },
  {
    label: "서술 대비",
    subtitle: "단답형 + 서술형으로 설명력 점검",
    difficulty: "어려움" as Difficulty,
    count: 5,
    kinds: ["short-answer", "essay"] as Kind[],
  },
];

// 의도 조정 프리셋 — 누르면 한 줄칸에 채워진다(자유 입력의 안전한 출발점).
// 자료 밖 생성이 아니라 "자료 안에서 어떻게 물을지"만 조정하는 힌트.
const INTENT_CHIPS = [
  "함정 선택지 강화",
  "개념 비교 중심",
  "계산 과정 강조",
  "정의·용어 위주",
  "예문은 원어 그대로",
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
  const [kinds, setKinds] = useState<Set<Kind>>(new Set(["multiple-choice"]));
  const [scope, setScope] = useState("");
  const [intentNote, setIntentNote] = useState("");
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
          intentNote: intentNote.trim(),
        }),
      });
      const json = (await res.json()) as { ok: boolean; jobId?: string; error?: string };
      if (!res.ok || !json.ok || !json.jobId) {
        setSubmitError(json.error ?? "문제로 점검할 수 없었어요.");
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

  const errorMsg = submitError ?? pollError ?? (job?.status === "error" ? job.errorMessage : null);

  // 새 퀴즈 done 상태인데 자동 navigate가 실패했을 때 (브라우저 prefetch 취소·focus 잃음 등)
  // 사용자가 직접 클릭할 수 있는 Link도 박는다.
  const doneQuizId =
    job?.status === "done" ? ((job.result as { quizId?: string } | null)?.quizId ?? null) : null;

  void courseSlug; // future: log course context

  return (
    <div>
      <section className="rounded-[20px] bg-[var(--color-apple-pearl)] p-4">
        <p className="text-[11px] wght-700 uppercase text-[var(--color-apple-muted)]">추천 흐름</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {PRESETS.map((preset) => {
            const active =
              difficulty === preset.difficulty &&
              count === preset.count &&
              preset.kinds.every((kind) => kinds.has(kind)) &&
              kinds.size === preset.kinds.length;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setDifficulty(preset.difficulty);
                  setCount(preset.count);
                  setKinds(new Set(preset.kinds));
                }}
                className={cn(
                  "rounded-[18px] border px-4 py-3 text-left transition-colors",
                  active
                    ? "border-[color:rgba(59,130,246,0.14)] bg-white text-[var(--color-apple-ink)] shadow-[0_10px_30px_rgba(59,130,246,0.08)]"
                    : "border-transparent bg-white/70 text-[var(--color-apple-muted)] hover:border-[var(--color-apple-hairline)] hover:text-[var(--color-apple-ink)]",
                )}
              >
                <p className="text-[13px] wght-620">{preset.label}</p>
                <p className="mt-1 text-[12px] leading-[1.5]">{preset.subtitle}</p>
              </button>
            );
          })}
        </div>
      </section>

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

      <FieldGroup label="문제 종류" hint={`${kinds.size}/3 선택`} className="mt-7">
        <ul className="-mx-1 flex flex-wrap gap-x-1 gap-y-2">
          {KIND_OPTIONS.map(({ value, label, subtitle }) => {
            const active = kinds.has(value);
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

      <FieldGroup label="추가 요청" hint="선택 — 자료 안에서 강조 방향만" className="mt-7">
        <ul className="-mx-1 flex flex-wrap gap-x-1 gap-y-2">
          {INTENT_CHIPS.map((chip) => {
            const active = intentNote.trim() === chip;
            return (
              <li key={chip}>
                <button
                  type="button"
                  onClick={() => setIntentNote(active ? "" : chip)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[12px] transition-colors",
                    active
                      ? "wght-560 bg-[var(--color-apple-action)] text-white"
                      : "wght-450 text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]",
                  )}
                >
                  {chip}
                </button>
              </li>
            );
          })}
        </ul>
        <input
          type="text"
          value={intentNote}
          onChange={(e) => setIntentNote(e.target.value.slice(0, 120))}
          placeholder="예: 헷갈리는 짝 비교 위주 / 풀이 단계 묻기"
          className="mt-2.5 w-full rounded-full border border-[var(--color-apple-hairline)] bg-white px-4 py-2 text-[13px] wght-450 text-[var(--color-apple-ink)] outline-none focus:border-[var(--color-apple-action)] placeholder:text-[var(--color-apple-muted)]/55"
          style={{ letterSpacing: "-0.012em" }}
        />
        <p className="mt-2 text-[11px] wght-450 leading-[1.5] text-[var(--color-apple-muted)]">
          자료 안에서 무엇을 강조할지만 조정해요. 자료에 없는 내용은 만들지 않아요.
        </p>
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
        {doneQuizId ? (
          <Link
            href={`/dashboard/quiz/${doneQuizId}`}
            className="group inline-flex items-center gap-2 rounded-full bg-[var(--color-apple-ink)] px-5 py-2.5 text-[13.5px] wght-560 text-white transition-opacity hover:opacity-90"
            style={{ letterSpacing: "-0.012em" }}
          >
            새 문제 풀러가기
            <Arrow className="text-[12px] transition-transform group-hover:translate-x-0.5" />
          </Link>
        ) : (
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
            {busy ? "문제지를 만들고 있어요…" : `${count}문제 만들기`}
            {!busy && (
              <Arrow className="text-[12px] transition-transform group-hover:translate-x-0.5" />
            )}
          </button>
        )}

        {busy ? (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] wght-450 text-[var(--color-apple-muted)]">
            <span className="tabular-nums text-[var(--color-apple-ink)]">다른 메뉴 가도</span>{" "}
            이어집니다
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
      aria-hidden="true"
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
