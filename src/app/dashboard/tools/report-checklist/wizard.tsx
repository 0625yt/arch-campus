"use client";

import { useState } from "react";
import { WizardWatermark } from "@/components/wizard-shell";
import { useJob } from "@/lib/hooks/use-job";
import type { ChecklistOutputT, ChecklistRequirementT } from "@/lib/schemas";

type Step = 1 | 2;

const CATEGORY_LABEL: Record<ChecklistRequirementT["category"], string> = {
  분량: "분량",
  형식: "형식",
  내용: "내용",
  참고문헌: "참고문헌",
  마감: "마감",
  제출방식: "제출방식",
  평가기준: "평가기준",
  기타: "기타",
};

export function ReportChecklistWizard() {
  const [step, setStep] = useState<Step>(1);
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [noticeText, setNoticeText] = useState("");
  const [extraNotes, setExtraNotes] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { job, error: pollError } = useJob(jobId);

  const canSubmit = assignmentTitle.trim().length > 0 && noticeText.trim().length >= 30;

  const isRunning =
    jobId !== null && (job?.status === "pending" || job?.status === "running" || !job);
  const isDone = job?.status === "done";

  const output = isDone
    ? ((job.result as { output?: ChecklistOutputT } | null)?.output ?? null)
    : null;
  const errorMsg = submitError ?? pollError ?? (job?.status === "error" ? job.errorMessage : null);

  async function handleSubmit() {
    setSubmitError(null);
    try {
      const res = await fetch("/api/wizards/report-checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentTitle: assignmentTitle.trim(),
          dueAt: dueAt.trim() || null,
          noticeText: noticeText.trim(),
          extraNotes: extraNotes.trim() || undefined,
        }),
      });
      const j = (await res.json()) as { ok: boolean; jobId?: string; error?: string };
      if (!res.ok || !j.ok || !j.jobId) {
        setSubmitError(j.error ?? "시작에 실패했어요");
        return;
      }
      setJobId(j.jobId);
      setStep(2);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "네트워크 오류");
    }
  }

  function resetToForm() {
    setJobId(null);
    setSubmitError(null);
    setStep(1);
  }

  if (output) {
    return <ResultCard output={output} onRestart={resetToForm} />;
  }

  return (
    <div className="rounded-[18px] bg-white p-6 sm:p-8">
      <StepHeader step={step} />

      {step === 1 && (
        <FormStep
          assignmentTitle={assignmentTitle}
          setAssignmentTitle={setAssignmentTitle}
          dueAt={dueAt}
          setDueAt={setDueAt}
          noticeText={noticeText}
          setNoticeText={setNoticeText}
          extraNotes={extraNotes}
          setExtraNotes={setExtraNotes}
          onSubmit={handleSubmit}
          canSubmit={canSubmit}
          isRunning={Boolean(isRunning)}
          errorMsg={errorMsg}
        />
      )}

      {step === 2 && (
        <RunningStep
          assignmentTitle={assignmentTitle}
          isRunning={Boolean(isRunning)}
          errorMsg={errorMsg}
          onRetry={resetToForm}
        />
      )}
    </div>
  );
}

/* ─────────── Step Header ─────────── */

function StepHeader({ step }: { step: Step }) {
  const labels = ["과제·공지 입력", "체크리스트 만들기"];
  return (
    <ol className="-mt-1 mb-7 flex items-center gap-2 text-[11.5px] wght-560 uppercase tracking-[0.06em]">
      {labels.map((label, idx) => {
        const n = (idx + 1) as Step;
        const active = step === n;
        const done = step > n;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded-full tabular-nums ${
                done
                  ? "bg-[var(--color-apple-action)] text-white"
                  : active
                    ? "border border-[var(--color-apple-ink)] text-[var(--color-apple-ink)]"
                    : "border border-[var(--color-apple-hairline)] text-[var(--color-apple-muted)]"
              }`}
            >
              {done ? "✓" : n}
            </span>
            <span
              className={
                active
                  ? "text-[var(--color-apple-ink)]"
                  : done
                    ? "text-[var(--color-apple-action)]"
                    : "text-[var(--color-apple-muted)]"
              }
            >
              {label}
            </span>
            {idx < labels.length - 1 && (
              <span aria-hidden className="h-px w-4 bg-[var(--color-apple-hairline)]" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ─────────── Step 1: 폼 ─────────── */

function FormStep(props: {
  assignmentTitle: string;
  setAssignmentTitle: (v: string) => void;
  dueAt: string;
  setDueAt: (v: string) => void;
  noticeText: string;
  setNoticeText: (v: string) => void;
  extraNotes: string;
  setExtraNotes: (v: string) => void;
  onSubmit: () => void;
  canSubmit: boolean;
  isRunning: boolean;
  errorMsg: string | null;
}) {
  const noticeLength = props.noticeText.trim().length;
  const tooShort = noticeLength > 0 && noticeLength < 30;

  return (
    <div className="flex flex-col gap-7">
      <Field label="과제 이름" required>
        <input
          type="text"
          value={props.assignmentTitle}
          onChange={(e) => props.setAssignmentTitle(e.target.value)}
          placeholder="예: 운영체제 1차 리포트"
          className={inputClass}
          maxLength={120}
          autoFocus
        />
      </Field>

      <Field label="마감 (선택)">
        <input
          type="datetime-local"
          value={props.dueAt}
          onChange={(e) => props.setDueAt(e.target.value)}
          className={inputClass}
        />
        <p className="mt-1.5 text-[11.5px] wght-450 text-[var(--color-apple-muted)]">
          공지에 마감이 따로 적혀있어도 학생이 입력한 날짜를 기준으로 D-day가 잡혀요.
        </p>
      </Field>

      <Field label="교수님 공지 본문" required>
        <textarea
          value={props.noticeText}
          onChange={(e) => props.setNoticeText(e.target.value)}
          placeholder="LMS 공지·이메일·Word 본문을 그대로 붙여주세요. 분량·인용·제출방식·평가기준이 다 들어있을수록 좋아요."
          rows={10}
          maxLength={20_000}
          className={`${inputClass} resize-y py-3`}
        />
        <p
          className={`mt-1.5 text-[11.5px] wght-450 ${
            tooShort ? "text-[var(--color-urgent)]" : "text-[var(--color-apple-muted)]"
          }`}
        >
          {noticeLength.toLocaleString()}자 / 30자 이상 필요
          {tooShort && " — 30자보다 짧아요"}
        </p>
      </Field>

      <Field label="강의 중 추가 메모 (선택)">
        <textarea
          value={props.extraNotes}
          onChange={(e) => props.setExtraNotes(e.target.value)}
          placeholder="예: 교수님이 강의 끝에 '인용 양식 꼭 Chicago' 강조"
          rows={3}
          maxLength={2000}
          className={`${inputClass} resize-none py-3`}
        />
      </Field>

      {props.errorMsg && (
        <p className="text-[12.5px] wght-450 text-[var(--color-urgent)]">{props.errorMsg}</p>
      )}

      <div className="mt-2 flex items-center justify-end gap-3">
        <PrimaryButton onClick={props.onSubmit} disabled={!props.canSubmit || props.isRunning}>
          {props.isRunning && <Spinner />}
          {props.isRunning ? "체크리스트 만드는 중…" : "체크리스트 만들기 →"}
        </PrimaryButton>
      </div>
    </div>
  );
}

/* ─────────── Step 2: 진행 화면 ─────────── */

function RunningStep({
  assignmentTitle,
  isRunning,
  errorMsg,
  onRetry,
}: {
  assignmentTitle: string;
  isRunning: boolean;
  errorMsg: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col gap-6 py-4">
      <div className="rounded-[12px] bg-[var(--color-apple-pearl)] px-4 py-3.5">
        <p className="text-[11.5px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
          만드는 중
        </p>
        <p
          className="mt-2 text-[14px] wght-560 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {assignmentTitle || "과제"} 체크리스트
        </p>
      </div>

      {isRunning && (
        <div className="flex items-center gap-3 text-[13px] wght-450 text-[var(--color-apple-muted)]">
          <Spinner />
          <span>공지에서 요구사항을 추출하고 있어요. 30초~1분쯤 걸려요. 다른 메뉴 가도 됩니다.</span>
        </div>
      )}

      {errorMsg && (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] wght-450 text-[var(--color-urgent)]">{errorMsg}</p>
          <SecondaryButton onClick={onRetry}>← 입력 다시 하기</SecondaryButton>
        </div>
      )}
    </div>
  );
}

/* ─────────── Result Card ─────────── */

function ResultCard({
  output,
  onRestart,
}: {
  output: ChecklistOutputT;
  onRestart: () => void;
}) {
  if (output.rejected) {
    return (
      <div className="rounded-[18px] bg-white p-7 sm:p-9">
        <p className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-urgent)]">
          체크리스트 추출 불가
        </p>
        <h2
          className="mt-3 text-[20px] leading-[1.3] wght-620 text-[var(--color-apple-ink)] sm:text-[22px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {output.reason}
        </h2>
        <div className="mt-7">
          <PrimaryButton onClick={onRestart}>다시 입력 →</PrimaryButton>
        </div>
      </div>
    );
  }

  const grouped = groupRequirements(output.requirements);

  return (
    <div className="flex flex-col gap-6 fade-up">
      {/* Hero */}
      <header className="rounded-[18px] bg-white p-7 sm:p-9">
        <p className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-action)]">
          요약
        </p>
        <h2
          className="mt-3 text-[24px] leading-[1.2] wght-620 text-[var(--color-apple-ink)] sm:text-[28px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {output.headline}
        </h2>
      </header>

      {/* Top risks */}
      <section className="rounded-[18px] bg-white p-7 sm:p-9">
        <h3
          className="text-[18px] wght-620 text-[var(--color-apple-ink)] sm:text-[20px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          가장 먼저 챙길 것
        </h3>
        <ol className="mt-4 flex flex-col gap-3">
          {output.topRisks.map((r, i) => (
            <li
              key={i}
              className="flex gap-3 rounded-[12px] bg-[var(--color-urgent-soft)] px-4 py-3"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-urgent)] text-[11px] wght-700 tabular-nums text-white">
                {i + 1}
              </span>
              <span
                className="text-[14px] leading-[1.55] wght-560 text-[var(--color-urgent-strong)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                {r}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* Grouped requirements */}
      <section className="rounded-[18px] bg-white p-7 sm:p-9">
        <h3
          className="text-[18px] wght-620 text-[var(--color-apple-ink)] sm:text-[20px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          요구사항 전체
        </h3>
        <div className="mt-5 flex flex-col gap-6">
          {grouped.map(([cat, list]) => (
            <div key={cat}>
              <p className="text-[11.5px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
                {CATEGORY_LABEL[cat]}
              </p>
              <ul className="mt-2.5 flex flex-col gap-3">
                {list.map((req, i) => (
                  <li
                    key={i}
                    className="border-b border-[var(--color-apple-hairline-soft)] pb-3 last:border-0 last:pb-0"
                  >
                    <div className="flex items-baseline gap-2">
                      <WeightBadge weight={req.weight} />
                      <h4
                        className="flex-1 text-[14px] leading-[1.4] wght-620 text-[var(--color-apple-ink)]"
                        style={{ letterSpacing: "-0.012em" }}
                      >
                        {req.title}
                      </h4>
                    </div>
                    <p
                      className="mt-1.5 text-[12.5px] leading-[1.55] wght-450 text-[var(--color-apple-muted)]"
                      style={{ letterSpacing: "-0.012em" }}
                    >
                      {req.why}
                    </p>
                    <p className="mt-2 rounded-[8px] border-l-2 border-[var(--color-apple-hairline)] bg-[var(--color-apple-pearl)] px-3 py-2 text-[12px] wght-450 italic leading-[1.5] text-[var(--color-apple-muted)]">
                      공지 인용: &quot;{req.quote}&quot;
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Self questions */}
      <section className="rounded-[18px] bg-white p-7 sm:p-9">
        <h3
          className="text-[18px] wght-620 text-[var(--color-apple-ink)] sm:text-[20px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          쓰기 전 스스로 답할 질문
        </h3>
        <ul className="mt-4 flex flex-col gap-2.5">
          {output.selfQuestions.map((q, i) => (
            <li
              key={i}
              className="flex gap-2 text-[13.5px] wght-450 leading-[1.6] text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              <span aria-hidden className="text-[var(--color-apple-action)]">→</span>
              <span>{q}</span>
            </li>
          ))}
        </ul>
      </section>

      {output.openQuestions && output.openQuestions.length > 0 && (
        <section className="rounded-[18px] bg-white p-7 sm:p-9">
          <h3
            className="text-[18px] wght-620 text-[var(--color-apple-ink)] sm:text-[20px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            교수님께 확인할 것
          </h3>
          <ul className="mt-4 flex flex-col gap-2.5">
            {output.openQuestions.map((q, i) => (
              <li
                key={i}
                className="flex gap-2 text-[13.5px] wght-450 leading-[1.6] text-[var(--color-apple-muted)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                <span aria-hidden>·</span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Watermark + restart */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1">
          <WizardWatermark modelText={output.watermark} />
        </div>
        <SecondaryButton onClick={onRestart}>다른 과제 →</SecondaryButton>
      </div>
    </div>
  );
}

function groupRequirements(
  list: ChecklistRequirementT[],
): [ChecklistRequirementT["category"], ChecklistRequirementT[]][] {
  const ORDER: ChecklistRequirementT["category"][] = [
    "마감",
    "제출방식",
    "분량",
    "형식",
    "참고문헌",
    "내용",
    "평가기준",
    "기타",
  ];
  const map = new Map<ChecklistRequirementT["category"], ChecklistRequirementT[]>();
  for (const req of list) {
    const cur = map.get(req.category) ?? [];
    cur.push(req);
    map.set(req.category, cur);
  }
  return ORDER.flatMap((cat) => {
    const items = map.get(cat);
    if (!items || items.length === 0) return [];
    // weight high가 위로
    const sorted = [...items].sort((a, b) => weightRank(a.weight) - weightRank(b.weight));
    return [[cat, sorted] as [ChecklistRequirementT["category"], ChecklistRequirementT[]]];
  });
}

function weightRank(w: ChecklistRequirementT["weight"]): number {
  return w === "high" ? 0 : w === "mid" ? 1 : 2;
}

/* ─────────── Primitives ─────────── */

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2.5">
      <span className="flex items-center gap-1.5 text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
        {label}
        {required && <span className="text-[var(--color-urgent)]">*</span>}
      </span>
      {children}
    </label>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[var(--color-apple-ink)] px-5 text-[13.5px] wght-560 text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
      style={{ letterSpacing: "-0.012em" }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--color-apple-hairline)] px-5 text-[13px] wght-450 text-[var(--color-apple-muted)] transition-all hover:border-[var(--color-apple-ink)] hover:text-[var(--color-apple-ink)] disabled:opacity-40"
      style={{ letterSpacing: "-0.012em" }}
    >
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-white/40 border-t-white"
    />
  );
}

function WeightBadge({ weight }: { weight: ChecklistRequirementT["weight"] }) {
  const map = {
    high: { label: "감점직결", color: "var(--color-urgent)" },
    mid: { label: "주의", color: "var(--color-apple-action)" },
    low: { label: "참고", color: "var(--color-apple-muted)" },
  } as const;
  const { label, color } = map[weight];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] wght-700 uppercase tracking-[0.06em] text-white"
      style={{ backgroundColor: color }}
    >
      {label}
    </span>
  );
}

const inputClass =
  "h-11 rounded-[10px] border border-[var(--color-apple-hairline)] bg-white px-3.5 text-[14px] wght-450 text-[var(--color-apple-ink)] transition-all placeholder:text-[var(--color-apple-muted)] focus:border-[var(--color-apple-action)] focus:outline-none";
