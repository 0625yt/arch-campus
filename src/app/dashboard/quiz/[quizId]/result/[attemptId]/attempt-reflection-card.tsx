"use client";

import { useState } from "react";
import type { AttemptReflection, AttemptReflectionCause } from "@/lib/data/attempt-reflections";

const CAUSE_OPTIONS: Array<{ value: AttemptReflectionCause; label: string }> = [
  { value: "concept-gap", label: "개념이 비었음" },
  { value: "confused", label: "비슷한 개념 혼동" },
  { value: "careless", label: "실수·조건 누락" },
  { value: "time-pressure", label: "시간 부족" },
  { value: "guessed", label: "찍거나 감으로 품" },
  { value: "memory", label: "기억이 안 남" },
];

export function AttemptReflectionCard({
  attemptId,
  initial,
  ratio,
  weakTopics,
}: {
  attemptId: string;
  initial: AttemptReflection | null;
  ratio: number;
  weakTopics: string[];
}) {
  const [readiness, setReadiness] = useState(initial?.readiness ?? 3);
  const [satisfaction, setSatisfaction] = useState(initial?.satisfaction ?? 3);
  const [causes, setCauses] = useState<AttemptReflectionCause[]>(initial?.causes ?? []);
  const [nextAction, setNextAction] = useState(initial?.nextAction ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    initial ? "saved" : "idle",
  );
  const [error, setError] = useState("");

  function toggleCause(cause: AttemptReflectionCause) {
    setStatus("idle");
    setCauses((current) =>
      current.includes(cause) ? current.filter((item) => item !== cause) : [...current, cause],
    );
  }

  async function save() {
    setStatus("saving");
    setError("");
    try {
      const response = await fetch(`/api/attempts/${attemptId}/reflection`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readiness, satisfaction, causes, nextAction, notes }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "저장하지 못했어요.");
      setStatus("saved");
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "잠시 후 다시 시도해주세요.");
    }
  }

  return (
    <section className="mb-6 overflow-hidden rounded-[24px] border border-[color:rgba(57,92,160,0.18)] bg-[linear-gradient(135deg,rgba(238,244,255,0.96),rgba(255,255,255,0.96)_55%,rgba(238,250,246,0.94))] shadow-[0_24px_70px_rgba(32,67,128,0.08)] fade-up">
      <div className="border-b border-[color:rgba(57,92,160,0.12)] p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-apple-action)]">
              After action review
            </p>
            <h2 className="mt-2 text-[21px] font-semibold tracking-[-0.025em] text-[var(--color-apple-ink)]">
              다음 시험을 바꾸는 60초 회고
            </h2>
            <p className="mt-2 text-[13px] leading-6 text-[var(--color-apple-muted)]">
              점수보다 원인을 남기면 다음 복습에서 같은 실수를 줄일 수 있어요.
            </p>
          </div>
          <div className="flex gap-2">
            <Metric label="정답률" value={`${ratio}%`} />
            <Metric label="취약 주제" value={weakTopics[0] ?? "없음"} />
          </div>
        </div>
      </div>

      <div className="grid gap-6 p-6 sm:p-7 lg:grid-cols-2">
        <RatingField
          legend="풀기 전 준비됐다고 느꼈나요?"
          value={readiness}
          onChange={(value) => {
            setReadiness(value);
            setStatus("idle");
          }}
          low="전혀"
          high="충분히"
        />
        <RatingField
          legend="결과가 얼마나 만족스러운가요?"
          value={satisfaction}
          onChange={(value) => {
            setSatisfaction(value);
            setStatus("idle");
          }}
          low="아쉬움"
          high="만족"
        />

        <fieldset className="lg:col-span-2">
          <legend className="text-[13px] font-semibold text-[var(--color-apple-ink)]">
            막힌 이유를 골라주세요
          </legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {CAUSE_OPTIONS.map((option) => {
              const selected = causes.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleCause(option.value)}
                  className={`rounded-full border px-3.5 py-2 text-[12.5px] font-medium transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-apple-action)] ${
                    selected
                      ? "border-[var(--color-apple-action)] bg-[var(--color-apple-action)] text-white shadow-[0_8px_20px_rgba(37,99,235,0.18)]"
                      : "border-[var(--color-apple-hairline)] bg-white/80 text-[var(--color-apple-muted)] hover:border-[color:rgba(37,99,235,0.35)] hover:text-[var(--color-apple-ink)]"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="lg:col-span-2">
          <span className="text-[13px] font-semibold text-[var(--color-apple-ink)]">
            다음에 바꿀 한 가지
          </span>
          <input
            value={nextAction}
            maxLength={500}
            onChange={(event) => {
              setNextAction(event.target.value);
              setStatus("idle");
            }}
            placeholder="예: 금요일 저녁에 2단원 오답 10개를 다시 푼다"
            className="mt-3 h-12 w-full rounded-[15px] border border-[var(--color-apple-hairline)] bg-white/90 px-4 text-[13px] text-[var(--color-apple-ink)] outline-none transition focus:border-[var(--color-apple-action)] focus:ring-4 focus:ring-[color:rgba(37,99,235,0.08)]"
          />
        </label>

        <label className="lg:col-span-2">
          <span className="text-[13px] font-semibold text-[var(--color-apple-ink)]">짧은 메모</span>
          <textarea
            value={notes}
            maxLength={2000}
            rows={3}
            onChange={(event) => {
              setNotes(event.target.value);
              setStatus("idle");
            }}
            placeholder="헷갈린 개념, 시험 중 느낀 점을 자유롭게 적어두세요."
            className="mt-3 w-full resize-y rounded-[15px] border border-[var(--color-apple-hairline)] bg-white/90 px-4 py-3 text-[13px] leading-6 text-[var(--color-apple-ink)] outline-none transition focus:border-[var(--color-apple-action)] focus:ring-4 focus:ring-[color:rgba(37,99,235,0.08)]"
          />
        </label>

        <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-2">
          <p aria-live="polite" className="text-[12px] text-[var(--color-apple-muted)]">
            {status === "saved" && "저장됐어요. 다음 복습 전에 다시 볼 수 있어요."}
            {status === "error" && <span className="text-[var(--color-urgent)]">{error}</span>}
            {status === "idle" && initial && "수정한 내용은 저장 버튼을 눌러 반영해주세요."}
          </p>
          <button
            type="button"
            disabled={status === "saving"}
            onClick={save}
            className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--color-apple-ink)] px-6 text-[13px] font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.2)] disabled:cursor-wait disabled:opacity-60"
          >
            {status === "saving"
              ? "저장 중…"
              : initial || status === "saved"
                ? "회고 수정"
                : "회고 저장"}
          </button>
        </div>
      </div>
    </section>
  );
}

function RatingField({
  legend,
  value,
  onChange,
  low,
  high,
}: {
  legend: string;
  value: number;
  onChange: (value: number) => void;
  low: string;
  high: string;
}) {
  return (
    <fieldset>
      <legend className="text-[13px] font-semibold text-[var(--color-apple-ink)]">{legend}</legend>
      <div className="mt-3 grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            key={rating}
            type="button"
            aria-pressed={value === rating}
            aria-label={`${rating}점`}
            onClick={() => onChange(rating)}
            className={`h-10 rounded-[13px] border text-[13px] font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-apple-action)] ${
              value === rating
                ? "border-[var(--color-apple-action)] bg-[var(--color-apple-action)] text-white shadow-[0_8px_20px_rgba(37,99,235,0.18)]"
                : "border-[var(--color-apple-hairline)] bg-white/80 text-[var(--color-apple-muted)] hover:border-[color:rgba(37,99,235,0.35)]"
            }`}
          >
            {rating}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10.5px] text-[var(--color-apple-muted)]">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </fieldset>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[86px] rounded-[15px] border border-white/80 bg-white/72 px-3 py-2.5 backdrop-blur">
      <p className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--color-apple-muted)]">
        {label}
      </p>
      <p className="mt-1 max-w-[116px] truncate text-[13px] font-semibold text-[var(--color-apple-ink)]">
        {value}
      </p>
    </div>
  );
}
