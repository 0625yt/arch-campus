"use client";

import { useMemo, useState } from "react";
import { WizardWatermark } from "@/components/wizard-shell";
import { useJob } from "@/lib/hooks/use-job";
import type { ExamCramOutputT } from "@/lib/schemas";

export interface CourseOption {
  id: string;
  name: string;
  color: string | null;
}

export interface MaterialOption {
  id: string;
  title: string;
  type: string;
  courseId: string | null;
  pageCount: number | null;
}

type Step = 1 | 2 | 3;

const TIME_PRESETS: { label: string; minutes: number }[] = [
  { label: "30분", minutes: 30 },
  { label: "1시간", minutes: 60 },
  { label: "3시간", minutes: 180 },
  { label: "6시간", minutes: 360 },
  { label: "12시간", minutes: 720 },
];

export function ExamCramWizard({
  courses,
  materials,
}: {
  courses: CourseOption[];
  materials: MaterialOption[];
}) {
  const [step, setStep] = useState<Step>(1);
  const [subject, setSubject] = useState("");
  const [remainingMin, setRemainingMin] = useState<number>(180);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [weakSpots, setWeakSpots] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { job, error: pollError } = useJob(jobId);

  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const groupedMaterials = useMemo(() => {
    const groups = new Map<string | null, MaterialOption[]>();
    for (const m of materials) {
      const list = groups.get(m.courseId) ?? [];
      list.push(m);
      groups.set(m.courseId, list);
    }
    return Array.from(groups.entries());
  }, [materials]);

  const canGoStep2 = subject.trim().length > 0 && remainingMin >= 30;
  const canGoStep3 = selectedIds.size > 0;
  const isRunning =
    jobId !== null && (job?.status === "pending" || job?.status === "running" || !job);
  const isDone = job?.status === "done";

  const output = isDone
    ? ((job.result as { output?: ExamCramOutputT } | null)?.output ?? null)
    : null;

  async function handleSubmit() {
    setSubmitError(null);
    try {
      const res = await fetch("/api/wizards/exam-cram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          remainingMin,
          weakSpots: weakSpots.trim() || undefined,
          materialIds: Array.from(selectedIds),
        }),
      });
      const j = (await res.json()) as { ok: boolean; jobId?: string; error?: string };
      if (!res.ok || !j.ok || !j.jobId) {
        setSubmitError(j.error ?? "시작에 실패했어요");
        return;
      }
      setJobId(j.jobId);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "네트워크 오류");
    }
  }

  function resetToForm() {
    setJobId(null);
    setSubmitError(null);
  }

  function toggleMaterial(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 8) next.add(id);
      return next;
    });
  }

  const errorMsg =
    submitError ?? pollError ?? (job?.status === "error" ? job.errorMessage : null);

  // 결과 도착하면 결과 화면. resetToForm()으로 다시 폼.
  if (output) {
    return <ResultCard output={output} onRestart={resetToForm} />;
  }

  return (
    <div className="rounded-[18px] bg-white p-6 sm:p-8">
      <StepHeader step={step} />

      {step === 1 && (
        <StepOne
          subject={subject}
          setSubject={setSubject}
          remainingMin={remainingMin}
          setRemainingMin={setRemainingMin}
          onNext={() => setStep(2)}
          canGoNext={canGoStep2}
        />
      )}

      {step === 2 && (
        <StepTwo
          groupedMaterials={groupedMaterials}
          courseMap={courseMap}
          selectedIds={selectedIds}
          toggleMaterial={toggleMaterial}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
          canGoNext={canGoStep3}
        />
      )}

      {step === 3 && (
        <StepThree
          weakSpots={weakSpots}
          setWeakSpots={setWeakSpots}
          subject={subject}
          remainingMin={remainingMin}
          materialCount={selectedIds.size}
          onBack={() => setStep(2)}
          onSubmit={handleSubmit}
          isRunning={Boolean(isRunning)}
          errorMsg={errorMsg}
        />
      )}
    </div>
  );
}

/* ─────────── Step Header ─────────── */

function StepHeader({ step }: { step: Step }) {
  const labels = ["과목·시간", "자료 선택", "약점·실행"];
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

/* ─────────── Step 1: 과목 + 시간 ─────────── */

function StepOne({
  subject,
  setSubject,
  remainingMin,
  setRemainingMin,
  onNext,
  canGoNext,
}: {
  subject: string;
  setSubject: (v: string) => void;
  remainingMin: number;
  setRemainingMin: (v: number) => void;
  onNext: () => void;
  canGoNext: boolean;
}) {
  return (
    <div className="flex flex-col gap-7">
      <Field label="과목·시험 이름" required>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="예: 운영체제 중간고사"
          className={inputClass}
          maxLength={120}
          autoFocus
        />
      </Field>

      <Field label="남은 시간" required>
        <div className="flex flex-wrap gap-2">
          {TIME_PRESETS.map((p) => {
            const active = remainingMin === p.minutes;
            return (
              <button
                key={p.minutes}
                type="button"
                onClick={() => setRemainingMin(p.minutes)}
                className={`rounded-full px-3.5 py-1.5 text-[13px] wght-560 transition-all ${
                  active
                    ? "bg-[var(--color-apple-ink)] text-white"
                    : "border border-[var(--color-apple-hairline)] text-[var(--color-apple-muted)] hover:border-[var(--color-apple-ink)] hover:text-[var(--color-apple-ink)]"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-[11.5px] wght-450 text-[var(--color-apple-muted)]">
            직접 입력
          </span>
          <input
            type="number"
            min={30}
            max={4320}
            step={10}
            value={remainingMin}
            onChange={(e) => setRemainingMin(Math.max(30, Math.min(4320, Number(e.target.value))))}
            className="h-9 w-24 rounded-[8px] border border-[var(--color-apple-hairline)] px-3 text-[13px] tabular-nums focus:border-[var(--color-apple-action)] focus:outline-none"
          />
          <span className="text-[11.5px] wght-450 text-[var(--color-apple-muted)]">분</span>
        </div>
      </Field>

      <div className="mt-2 flex justify-end">
        <PrimaryButton onClick={onNext} disabled={!canGoNext}>
          다음 →
        </PrimaryButton>
      </div>
    </div>
  );
}

/* ─────────── Step 2: 자료 선택 ─────────── */

function StepTwo({
  groupedMaterials,
  courseMap,
  selectedIds,
  toggleMaterial,
  onBack,
  onNext,
  canGoNext,
}: {
  groupedMaterials: [string | null, MaterialOption[]][];
  courseMap: Map<string, CourseOption>;
  selectedIds: Set<string>;
  toggleMaterial: (id: string) => void;
  onBack: () => void;
  onNext: () => void;
  canGoNext: boolean;
}) {
  if (groupedMaterials.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <p
          className="text-[14px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          업로드된 자료가 없어요. 시험 범위 자료를 먼저 올려주세요.
        </p>
        <a
          href="/dashboard/study"
          className="inline-flex h-10 w-fit items-center rounded-full bg-[var(--color-apple-action)] px-5 text-[13px] wght-560 text-white hover:bg-[var(--color-apple-action-hover)]"
        >
          자료 올리러 가기 →
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p
          className="text-[12.5px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]"
        >
          시험 범위 자료 (최대 8개)
        </p>
        <p
          className="mt-1.5 text-[13px] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          선택한 자료를 기반으로 단원 우선순위를 매겨줘요. 너무 많이 고르면 한 단원당 깊이가 떨어져요.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        {groupedMaterials.map(([courseId, list]) => {
          const course = courseId ? courseMap.get(courseId) : null;
          const courseLabel = course?.name ?? "강의 미배정";
          return (
            <section key={courseId ?? "none"}>
              <header className="mb-2 flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: course?.color ?? "#a5a5a8" }}
                />
                <h3
                  className="text-[12px] wght-620 text-[var(--color-apple-ink)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  {courseLabel}
                </h3>
                <span className="text-[11px] wght-450 text-[var(--color-apple-muted)]">
                  {list.length}개
                </span>
              </header>
              <ul className="flex flex-col gap-1.5">
                {list.map((m) => {
                  const checked = selectedIds.has(m.id);
                  return (
                    <li key={m.id}>
                      <label
                        className={`flex cursor-pointer items-center gap-3 rounded-[10px] border px-3 py-2.5 transition-colors ${
                          checked
                            ? "border-[var(--color-apple-action)] bg-[var(--color-apple-action)]/[0.04]"
                            : "border-[var(--color-apple-hairline)] hover:bg-[var(--color-apple-pearl)]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMaterial(m.id)}
                          className="sr-only"
                        />
                        <CheckBox checked={checked} />
                        <span
                          className="min-w-0 flex-1 truncate text-[13px] wght-450 text-[var(--color-apple-ink)]"
                          style={{ letterSpacing: "-0.012em" }}
                        >
                          {m.title}
                        </span>
                        {m.pageCount && (
                          <span className="shrink-0 text-[11px] wght-450 tabular-nums text-[var(--color-apple-muted)]">
                            {m.pageCount}쪽
                          </span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <SecondaryButton onClick={onBack}>← 이전</SecondaryButton>
        <div className="flex items-center gap-3">
          <span className="text-[11.5px] wght-450 text-[var(--color-apple-muted)]">
            {selectedIds.size}/8 선택
          </span>
          <PrimaryButton onClick={onNext} disabled={!canGoNext}>
            다음 →
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

/* ─────────── Step 3: 약점 + 실행 ─────────── */

function StepThree({
  weakSpots,
  setWeakSpots,
  subject,
  remainingMin,
  materialCount,
  onBack,
  onSubmit,
  isRunning,
  errorMsg,
}: {
  weakSpots: string;
  setWeakSpots: (v: string) => void;
  subject: string;
  remainingMin: number;
  materialCount: number;
  onBack: () => void;
  onSubmit: () => void;
  isRunning: boolean;
  errorMsg: string | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Field label="약점·중점 (선택)">
        <textarea
          value={weakSpots}
          onChange={(e) => setWeakSpots(e.target.value)}
          placeholder="예: 동기화 단원 약해요. 수식 풀이가 헷갈려요."
          rows={3}
          maxLength={800}
          className={`${inputClass} resize-none py-3`}
        />
        <p className="mt-1.5 text-[11.5px] wght-450 text-[var(--color-apple-muted)]">
          비워도 돼요. 적으면 그 단원의 priority가 올라가요.
        </p>
      </Field>

      <div className="rounded-[12px] bg-[var(--color-apple-pearl)] px-4 py-3.5">
        <p
          className="text-[11.5px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]"
        >
          준비된 요청
        </p>
        <ul className="mt-2 flex flex-col gap-1 text-[13px] wght-450 text-[var(--color-apple-ink)]">
          <li>
            <span className="text-[var(--color-apple-muted)]">과목 </span>
            {subject || "—"}
          </li>
          <li>
            <span className="text-[var(--color-apple-muted)]">남은 시간 </span>
            {formatDuration(remainingMin)}
          </li>
          <li>
            <span className="text-[var(--color-apple-muted)]">자료 </span>
            {materialCount}건
          </li>
        </ul>
      </div>

      {errorMsg && (
        <p className="text-[12.5px] wght-450 text-[var(--color-urgent)]">{errorMsg}</p>
      )}

      <div className="mt-2 flex items-center justify-between gap-3">
        <SecondaryButton onClick={onBack} disabled={isRunning}>
          ← 이전
        </SecondaryButton>
        <PrimaryButton onClick={onSubmit} disabled={isRunning}>
          {isRunning && <Spinner />}
          {isRunning ? "단원·시간 짜고 있어요…" : "벼락치기 짜기 →"}
        </PrimaryButton>
      </div>

      {isRunning && (
        <p
          className="text-center text-[11.5px] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          AI가 30초~1분쯤 걸려요. 다른 메뉴 가도 이어집니다.
        </p>
      )}
    </div>
  );
}

/* ─────────── 결과 카드 ─────────── */

function ResultCard({
  output,
  onRestart,
}: {
  output: ExamCramOutputT;
  onRestart: () => void;
}) {
  if (output.rejected) {
    return (
      <div className="rounded-[18px] bg-white p-7 sm:p-9">
        <p
          className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-urgent)]"
        >
          벼락치기 추천 불가
        </p>
        <h2
          className="mt-3 text-[22px] leading-[1.2] wght-620 text-[var(--color-apple-ink)] sm:text-[26px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {output.reason}
        </h2>
        <div className="mt-7">
          <PrimaryButton onClick={onRestart}>다시 시도 →</PrimaryButton>
        </div>
      </div>
    );
  }

  const totalMin = output.schedule.reduce((a, b) => a + b.durationMin, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Hero */}
      <div className="rounded-[18px] bg-white p-7 sm:p-9">
        <p
          className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-action)]"
        >
          벼락치기 계획 · 총 {formatDuration(totalMin)}
        </p>
        <h2
          className="mt-3 text-[24px] leading-[1.2] wght-620 text-[var(--color-apple-ink)] sm:text-[28px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {output.headline}
        </h2>
      </div>

      {/* Topics */}
      <section className="rounded-[18px] bg-white p-7 sm:p-9">
        <h3
          className="text-[18px] wght-620 text-[var(--color-apple-ink)] sm:text-[20px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          단원 우선순위
        </h3>
        <ul className="mt-5 flex flex-col gap-4">
          {output.topics.map((t, i) => (
            <li key={i} className="border-b border-[var(--color-apple-hairline-soft)] pb-4 last:border-0 last:pb-0">
              <div className="flex items-baseline gap-2">
                <PriorityBadge priority={t.priority} />
                <h4
                  className="flex-1 text-[15px] wght-620 text-[var(--color-apple-ink)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  {t.name}
                </h4>
                <span className="text-[11px] wght-560 tabular-nums text-[var(--color-apple-muted)]">
                  {Math.round(t.weight * 100)}%
                </span>
              </div>
              <ul className="mt-2.5 flex flex-col gap-1">
                {t.mustReview.map((m, j) => (
                  <li
                    key={j}
                    className="flex gap-2 text-[13px] wght-450 leading-[1.55] text-[var(--color-apple-ink)]"
                    style={{ letterSpacing: "-0.012em" }}
                  >
                    <span aria-hidden className="text-[var(--color-apple-muted)]">·</span>
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
              {t.commonMistakes && t.commonMistakes.length > 0 && (
                <div className="mt-3 rounded-[10px] bg-[var(--color-urgent-soft)] px-3 py-2">
                  <p className="text-[10.5px] wght-700 uppercase tracking-[0.06em] text-[var(--color-urgent-strong)]">
                    자주 헷갈리는 부분
                  </p>
                  <ul className="mt-1 flex flex-col gap-1">
                    {t.commonMistakes.map((m, k) => (
                      <li
                        key={k}
                        className="text-[12.5px] wght-450 leading-[1.55] text-[var(--color-urgent-strong)]"
                        style={{ letterSpacing: "-0.012em" }}
                      >
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Schedule */}
      <section className="rounded-[18px] bg-white p-7 sm:p-9">
        <h3
          className="text-[18px] wght-620 text-[var(--color-apple-ink)] sm:text-[20px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          시간 블록
        </h3>
        <ol className="mt-5 flex flex-col gap-3">
          {output.schedule.map((b) => (
            <li
              key={b.order}
              className="flex gap-3 rounded-[10px] border border-[var(--color-apple-hairline)] px-4 py-3"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-apple-pearl)] text-[11px] wght-620 tabular-nums text-[var(--color-apple-ink)]">
                {b.order}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <ModeChip mode={b.mode} />
                  <span
                    className="text-[13px] wght-560 text-[var(--color-apple-ink)]"
                    style={{ letterSpacing: "-0.012em" }}
                  >
                    {b.topicName}
                  </span>
                  <span className="ml-auto text-[11.5px] wght-560 tabular-nums text-[var(--color-apple-muted)]">
                    {b.durationMin}분
                  </span>
                </div>
                <p
                  className="mt-1.5 text-[12.5px] wght-450 leading-[1.55] text-[var(--color-apple-muted)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  {b.checkpoint}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Final tips */}
      <section className="rounded-[18px] bg-white p-7 sm:p-9">
        <h3
          className="text-[18px] wght-620 text-[var(--color-apple-ink)] sm:text-[20px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          시험 직전 팁
        </h3>
        <ul className="mt-4 flex flex-col gap-2">
          {output.finalTips.map((t, i) => (
            <li
              key={i}
              className="flex gap-2 text-[13.5px] wght-450 leading-[1.6] text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              <span aria-hidden className="text-[var(--color-apple-action)]">→</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Watermark + 다시 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1">
          <WizardWatermark modelText={output.watermark} />
        </div>
        <SecondaryButton onClick={onRestart}>다시 짜기</SecondaryButton>
      </div>
    </div>
  );
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

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${
        checked
          ? "border-[var(--color-apple-action)] bg-[var(--color-apple-action)] text-white"
          : "border-[var(--color-apple-hairline)] bg-white"
      }`}
    >
      {checked && (
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path
            d="M1.5 5 L4 7.5 L8.5 2.5"
            stroke="currentColor"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
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

function PriorityBadge({ priority }: { priority: "high" | "mid" | "low" }) {
  const map = {
    high: { label: "필수", color: "var(--color-urgent)" },
    mid: { label: "중요", color: "var(--color-apple-action)" },
    low: { label: "여유", color: "var(--color-apple-muted)" },
  } as const;
  const { label, color } = map[priority];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] wght-700 uppercase tracking-[0.06em] text-white"
      style={{ backgroundColor: color }}
    >
      {label}
    </span>
  );
}

function ModeChip({
  mode,
}: {
  mode: "read" | "summarize" | "quiz" | "review-mistakes" | "rest";
}) {
  const map = {
    read: { label: "읽기", bg: "#e8f0fb" },
    summarize: { label: "정리", bg: "#eef4ec" },
    quiz: { label: "문제", bg: "#fde9ec" },
    "review-mistakes": { label: "오답", bg: "#fcf0e0" },
    rest: { label: "휴식", bg: "#f3f0f7" },
  } as const;
  const { label, bg } = map[mode];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] wght-620 text-[var(--color-apple-ink)]"
      style={{ backgroundColor: bg, letterSpacing: "-0.012em" }}
    >
      {label}
    </span>
  );
}

function formatDuration(min: number): string {
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

const inputClass =
  "h-11 rounded-[10px] border border-[var(--color-apple-hairline)] bg-white px-3.5 text-[14px] wght-450 text-[var(--color-apple-ink)] transition-all placeholder:text-[var(--color-apple-muted)] focus:border-[var(--color-apple-action)] focus:outline-none";
