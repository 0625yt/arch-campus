"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Kbd } from "@/components/primitives";
import { WizardWatermark } from "@/components/wizard-shell";
import { useJob } from "@/lib/hooks/use-job";
import type { PresentationOutputT } from "@/lib/schemas";
import { cn } from "@/lib/utils";

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

type Audience = "교수님" | "동기" | "신입생" | "외부";
type Goal = "이해" | "설득" | "공유" | "토론 유도";
type Duration = 5 | 10 | 15 | 20;

const AUDIENCE_OPTIONS: Audience[] = ["교수님", "동기", "신입생", "외부"];
const GOAL_OPTIONS: Goal[] = ["이해", "설득", "공유", "토론 유도"];
const DURATION_OPTIONS: Duration[] = [5, 10, 15, 20];

interface Answers {
  topic: string;
  durationMin: Duration;
  audience: Audience | null;
  goal: Goal | null;
  constraints: string;
  /** 마지막 단계 자유 입력 — 사용자가 추가로 강조하고 싶은 점. constraints에 합쳐서 전송. */
  additionalRequest: string;
  materialIds: Set<string>;
}

const STEP_LABELS = ["주제", "시간·청중", "목적·제약", "참고 자료"] as const;

export function Wizard({
  courses,
  materials,
}: {
  courses: CourseOption[];
  materials: MaterialOption[];
}) {
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [answers, setAnswers] = useState<Answers>({
    topic: "",
    durationMin: 10,
    audience: null,
    goal: null,
    constraints: "",
    additionalRequest: "",
    materialIds: new Set(),
  });
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const topicInputRef = useRef<HTMLInputElement>(null);
  const constraintsInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (step === 0) topicInputRef.current?.focus();
    if (step === 2) constraintsInputRef.current?.focus();
  }, [step]);

  const isRunning =
    jobId !== null && (job?.status === "pending" || job?.status === "running" || !job);
  const isDone = job?.status === "done";

  const output = isDone
    ? ((job.result as { output?: PresentationOutputT } | null)?.output ?? null)
    : null;
  const errorMsg = submitError ?? pollError ?? (job?.status === "error" ? job.errorMessage : null);

  const canStep1 = answers.topic.trim().length >= 2;
  const canStep2 = answers.audience !== null;
  const canStep3 = answers.goal !== null;

  async function handleSubmit() {
    setSubmitError(null);
    if (!answers.audience || !answers.goal) {
      setSubmitError("청중·목적을 골라주세요");
      return;
    }
    // 평가 기준(Step 2)과 마지막 추가 요청(Step 3)을 한 줄로 합쳐 모델에 전달.
    // 학생 입장에선 다른 시점에 적은 다른 의도지만, 모델은 한 묶음으로 보는 게 깔끔.
    const mergedConstraints = [answers.constraints.trim(), answers.additionalRequest.trim()]
      .filter(Boolean)
      .join(" / ");
    try {
      const res = await fetch("/api/wizards/presentation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: answers.topic.trim(),
          audience: answers.audience,
          durationMin: answers.durationMin,
          goal: answers.goal,
          constraints: mergedConstraints || undefined,
          materialIds: Array.from(answers.materialIds),
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
    setStep(0);
  }

  function toggleMaterial(id: string) {
    setAnswers((prev) => {
      const next = new Set(prev.materialIds);
      if (next.has(id)) next.delete(id);
      else if (next.size < 3) next.add(id);
      return { ...prev, materialIds: next };
    });
  }

  if (output) {
    if (answers.audience && answers.goal) {
      return (
        <PresentationResultCard
          output={output}
          topic={answers.topic}
          durationMin={answers.durationMin}
          audience={answers.audience}
          goal={answers.goal}
          onRestart={resetToForm}
        />
      );
    }
  }

  if (isRunning) {
    return <RunningCard topic={answers.topic} />;
  }

  return (
    <div className="rounded-[18px] bg-white p-7 sm:p-10">
      <ProgressHeader step={step} />

      {step === 0 && (
        <StepTopic
          topic={answers.topic}
          setTopic={(v) => setAnswers((p) => ({ ...p, topic: v }))}
          inputRef={topicInputRef}
          onNext={() => canStep1 && setStep(1)}
          canNext={canStep1}
        />
      )}

      {step === 1 && (
        <StepTimeAudience
          durationMin={answers.durationMin}
          setDuration={(v) => setAnswers((p) => ({ ...p, durationMin: v }))}
          audience={answers.audience}
          setAudience={(v) => setAnswers((p) => ({ ...p, audience: v }))}
          onBack={() => setStep(0)}
          onNext={() => canStep2 && setStep(2)}
          canNext={canStep2}
        />
      )}

      {step === 2 && (
        <StepGoalConstraints
          goal={answers.goal}
          setGoal={(v) => setAnswers((p) => ({ ...p, goal: v }))}
          constraints={answers.constraints}
          setConstraints={(v) => setAnswers((p) => ({ ...p, constraints: v }))}
          constraintsInputRef={constraintsInputRef}
          onBack={() => setStep(1)}
          onNext={() => canStep3 && setStep(3)}
          canNext={canStep3}
        />
      )}

      {step === 3 && (
        <StepMaterials
          groupedMaterials={groupedMaterials}
          courseMap={courseMap}
          selectedIds={answers.materialIds}
          toggleMaterial={toggleMaterial}
          additionalRequest={answers.additionalRequest}
          setAdditionalRequest={(v) => setAnswers((p) => ({ ...p, additionalRequest: v }))}
          summary={answers}
          onBack={() => setStep(2)}
          onSubmit={handleSubmit}
          errorMsg={errorMsg}
        />
      )}
    </div>
  );
}

/* ─────────── Step 0: 주제 ─────────── */

function StepTopic({
  topic,
  setTopic,
  inputRef,
  onNext,
  canNext,
}: {
  topic: string;
  setTopic: (v: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onNext: () => void;
  canNext: boolean;
}) {
  return (
    <>
      <StepQuestion
        question="어떤 주제로 발표하나요?"
        hint="한 줄로. 예: 'BST의 균형 유지 알고리즘'"
      />
      <input
        ref={inputRef}
        type="text"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canNext) onNext();
        }}
        placeholder="발표 주제를 한 줄로"
        maxLength={200}
        className="mt-8 w-full border-b border-[var(--color-apple-hairline)] bg-transparent pb-3 text-[18px] wght-560 text-[var(--color-apple-ink)] placeholder:wght-450 placeholder:text-[var(--color-apple-muted)] focus:border-[var(--color-apple-action)] focus-visible:outline-none sm:text-[20px]"
        style={{ letterSpacing: "-0.012em" }}
      />
      <ActionRow>
        <PrimaryButton onClick={onNext} disabled={!canNext}>
          다음 단계
        </PrimaryButton>
        <span className="ml-auto hidden items-center gap-1.5 text-[11px] wght-450 text-[var(--color-apple-muted)] sm:inline-flex">
          <Kbd>Enter</Kbd>
          다음
        </span>
      </ActionRow>
    </>
  );
}

/* ─────────── Step 1: 시간 + 청중 ─────────── */

function StepTimeAudience({
  durationMin,
  setDuration,
  audience,
  setAudience,
  onBack,
  onNext,
  canNext,
}: {
  durationMin: Duration;
  setDuration: (v: Duration) => void;
  audience: Audience | null;
  setAudience: (v: Audience) => void;
  onBack: () => void;
  onNext: () => void;
  canNext: boolean;
}) {
  return (
    <>
      <StepQuestion
        question="발표 시간과 청중을 알려주세요"
        hint="시간으로 슬라이드 수가, 청중으로 어휘·예시 톤이 정해져요"
      />
      <div className="mt-8 flex flex-col gap-7">
        <FieldGroup label="발표 시간">
          <div className="flex flex-wrap gap-2">
            {DURATION_OPTIONS.map((d) => {
              const active = durationMin === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={cn(
                    "rounded-full px-4 py-2 text-[13px] wght-560 transition-all",
                    active
                      ? "bg-[var(--color-apple-ink)] text-white"
                      : "border border-[var(--color-apple-hairline)] text-[var(--color-apple-muted)] hover:border-[var(--color-apple-ink)] hover:text-[var(--color-apple-ink)]",
                  )}
                >
                  {d}분
                </button>
              );
            })}
          </div>
        </FieldGroup>

        <FieldGroup label="청중">
          <div className="grid gap-2 sm:grid-cols-2">
            {AUDIENCE_OPTIONS.map((opt) => {
              const active = audience === opt;
              return (
                <ChoiceButton key={opt} active={active} onClick={() => setAudience(opt)}>
                  <span className="wght-560">{opt}</span>
                  <span className="text-[11.5px] wght-450 text-[var(--color-apple-muted)]">
                    {AUDIENCE_HINT[opt]}
                  </span>
                </ChoiceButton>
              );
            })}
          </div>
        </FieldGroup>
      </div>
      <ActionRow>
        <SecondaryButton onClick={onBack}>← 이전</SecondaryButton>
        <PrimaryButton onClick={onNext} disabled={!canNext}>
          다음 단계
        </PrimaryButton>
      </ActionRow>
    </>
  );
}

const AUDIENCE_HINT: Record<Audience, string> = {
  교수님: "격식 + 깊이",
  동기: "친근 + 공감",
  신입생: "비유 풍부",
  외부: "배경부터 설명",
};

/* ─────────── Step 2: 목적 + 제약 ─────────── */

function StepGoalConstraints({
  goal,
  setGoal,
  constraints,
  setConstraints,
  constraintsInputRef,
  onBack,
  onNext,
  canNext,
}: {
  goal: Goal | null;
  setGoal: (v: Goal) => void;
  constraints: string;
  setConstraints: (v: string) => void;
  constraintsInputRef: React.RefObject<HTMLInputElement | null>;
  onBack: () => void;
  onNext: () => void;
  canNext: boolean;
}) {
  return (
    <>
      <StepQuestion
        question="발표의 목적·제약은요?"
        hint="목적은 슬라이드 구조 방향을, 제약은 평가 기준에 들어가요"
      />
      <div className="mt-8 flex flex-col gap-7">
        <FieldGroup label="목적">
          <div className="grid gap-2 sm:grid-cols-2">
            {GOAL_OPTIONS.map((opt) => {
              const active = goal === opt;
              return (
                <ChoiceButton key={opt} active={active} onClick={() => setGoal(opt)}>
                  <span className="wght-560">{opt}</span>
                  <span className="text-[11.5px] wght-450 text-[var(--color-apple-muted)]">
                    {GOAL_HINT[opt]}
                  </span>
                </ChoiceButton>
              );
            })}
          </div>
        </FieldGroup>

        <FieldGroup label="평가 기준·제약 (선택)">
          <input
            ref={constraintsInputRef}
            type="text"
            value={constraints}
            onChange={(e) => setConstraints(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canNext) onNext();
            }}
            placeholder="예: 실제 사례 30%, 비판적 시각 강조, 슬라이드 8장 이내"
            maxLength={400}
            className="h-11 w-full rounded-[10px] border border-[var(--color-apple-hairline)] px-3.5 text-[14px] wght-450 text-[var(--color-apple-ink)] placeholder:text-[var(--color-apple-muted)] focus:border-[var(--color-apple-action)] focus:outline-none"
            style={{ letterSpacing: "-0.012em" }}
          />
          <p className="mt-1.5 text-[11.5px] wght-450 text-[var(--color-apple-muted)]">
            교수님이 강조하신 평가 기준을 그대로 넣으면 가점 슬라이드가 만들어져요.
          </p>
        </FieldGroup>
      </div>
      <ActionRow>
        <SecondaryButton onClick={onBack}>← 이전</SecondaryButton>
        <PrimaryButton onClick={onNext} disabled={!canNext}>
          다음 단계
        </PrimaryButton>
      </ActionRow>
    </>
  );
}

const GOAL_HINT: Record<Goal, string> = {
  이해: "개념 전달 위주",
  설득: "주장 + 근거 흐름",
  공유: "리포트·결과 보고",
  "토론 유도": "쟁점 + 열린 질문",
};

/* ─────────── Step 3: 자료 + 제출 ─────────── */

function StepMaterials({
  groupedMaterials,
  courseMap,
  selectedIds,
  toggleMaterial,
  additionalRequest,
  setAdditionalRequest,
  summary,
  onBack,
  onSubmit,
  errorMsg,
}: {
  groupedMaterials: [string | null, MaterialOption[]][];
  courseMap: Map<string, CourseOption>;
  selectedIds: Set<string>;
  toggleMaterial: (id: string) => void;
  additionalRequest: string;
  setAdditionalRequest: (v: string) => void;
  summary: Answers;
  onBack: () => void;
  onSubmit: () => void;
  errorMsg: string | null;
}) {
  const hasMaterials = groupedMaterials.length > 0;

  return (
    <>
      <StepQuestion
        question="참고 자료를 선택해 주세요"
        hint="고른 자료의 본문을 인용해 슬라이드 근거가 박혀요. 없어도 진행 가능."
      />

      {hasMaterials ? (
        <div className="mt-8 flex flex-col gap-5">
          <p className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
            최대 3개 · 발표는 자료 1~2개가 가장 좋아요
          </p>
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
                      const limitHit = !checked && selectedIds.size >= 3;
                      return (
                        <li key={m.id}>
                          <label
                            className={cn(
                              "flex items-center gap-3 rounded-[10px] border px-3 py-2.5 transition-colors",
                              limitHit
                                ? "cursor-not-allowed border-[var(--color-apple-hairline-soft)] opacity-50"
                                : "cursor-pointer",
                              checked
                                ? "border-[var(--color-apple-action)] bg-[var(--color-apple-action)]/[0.04]"
                                : "border-[var(--color-apple-hairline)] hover:bg-[var(--color-apple-pearl)]",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={limitHit}
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
        </div>
      ) : (
        <div className="mt-8 rounded-[12px] bg-[var(--color-apple-pearl)] px-4 py-3.5">
          <p
            className="text-[13px] wght-450 leading-[1.6] text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            업로드된 자료가 아직 없어요. 자료 없이도 발표 구조는 짤 수 있지만, 인용 슬라이드가
            빠집니다. 자료 올리고 싶으면{" "}
            <a
              href="/dashboard/study"
              className="wght-560 text-[var(--color-apple-action)] hover:underline"
            >
              공부 페이지
            </a>
            로 가서 추가해 주세요.
          </p>
        </div>
      )}

      <AdditionalRequestField
        value={additionalRequest}
        onChange={setAdditionalRequest}
        placeholder="예: 도입에 본인 경험 한 줄, 청중과 시선 자주 맞추기 강조"
      />

      <SummaryBox summary={summary} />

      {errorMsg && (
        <p className="mt-5 text-[12.5px] wght-450 text-[var(--color-urgent)]">{errorMsg}</p>
      )}

      <ActionRow>
        <SecondaryButton onClick={onBack}>← 이전</SecondaryButton>
        <PrimaryButton onClick={onSubmit}>
          {selectedIds.size > 0 ? `${selectedIds.size}개 자료로 만들기 →` : "자료 없이 만들기 →"}
        </PrimaryButton>
      </ActionRow>
    </>
  );
}

/**
 * 마지막 단계의 자유 입력 — "추가 요청 사항".
 * 모델은 위에서 받은 메타(주제·청중·평가 기준 등) 외에 학생이 마지막에 한 번 더 강조하고 싶은
 * 내용을 자유롭게 받는다. 비어도 됨.
 */
function AdditionalRequestField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="mt-6 flex flex-col gap-2">
      <label className="flex items-center gap-1.5 text-[11.5px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
        추가 요청 사항 (선택)
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        maxLength={500}
        className="w-full resize-none rounded-[10px] border border-[var(--color-apple-hairline)] bg-white px-3.5 py-2.5 text-[13.5px] wght-450 text-[var(--color-apple-ink)] placeholder:text-[var(--color-apple-muted)] focus:border-[var(--color-apple-action)] focus:outline-none"
        style={{ letterSpacing: "-0.012em" }}
      />
      <p className="text-[11.5px] wght-450 text-[var(--color-apple-muted)]">
        비워두면 위 입력만으로 만들어요. 적으면 그 강조가 결과에 반영돼요.
      </p>
    </div>
  );
}

function SummaryBox({ summary }: { summary: Answers }) {
  return (
    <div className="mt-6 rounded-[12px] bg-[var(--color-apple-pearl)] px-4 py-3.5">
      <p className="text-[11.5px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
        준비된 요청
      </p>
      <ul className="mt-2 flex flex-col gap-1 text-[13px] wght-450 text-[var(--color-apple-ink)]">
        <li>
          <span className="text-[var(--color-apple-muted)]">주제 </span>
          {summary.topic || "—"}
        </li>
        <li>
          <span className="text-[var(--color-apple-muted)]">시간·청중 </span>
          {summary.durationMin}분 · {summary.audience ?? "—"}
        </li>
        <li>
          <span className="text-[var(--color-apple-muted)]">목적 </span>
          {summary.goal ?? "—"}
          {summary.constraints && ` · ${summary.constraints}`}
        </li>
      </ul>
    </div>
  );
}

/* ─────────── Running ─────────── */

function RunningCard({ topic }: { topic: string }) {
  return (
    <div className="rounded-[18px] bg-white p-7 sm:p-10">
      <p className="text-[11.5px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
        만드는 중
      </p>
      <h2
        className="mt-2 text-[20px] leading-[1.3] wght-620 text-[var(--color-apple-ink)] sm:text-[22px]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {topic} 발표 구조를 짜고 있어요
      </h2>
      <div className="mt-6 flex items-center gap-3">
        <Spinner />
        <span
          className="text-[13px] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          청중에 맞춰 슬라이드 흐름·스피커 노트·예상 질문까지. 40초~1분쯤 걸려요.
        </span>
      </div>
    </div>
  );
}

/* ─────────── Result ─────────── */

export function PresentationResultCard({
  output,
  topic,
  durationMin,
  audience,
  goal,
  onRestart,
}: {
  output: PresentationOutputT;
  topic: string;
  durationMin: Duration;
  audience: Audience;
  goal: Goal;
  onRestart?: () => void;
}) {
  const totalSec = output.outline.reduce((a, s) => a + s.estimatedSec, 0);

  return (
    <div className="fade-up flex flex-col gap-6">
      {/* Hero */}
      <section className="rounded-[18px] bg-white p-7 sm:p-9">
        <p className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-action)]">
          발표 구조 · {output.outline.length}장 · 약 {formatSec(totalSec)}
        </p>
        <h2
          className="mt-3 text-[24px] leading-[1.2] wght-620 text-[var(--color-apple-ink)] sm:text-[28px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {topic}
        </h2>
        <p
          className="mt-2 text-[13px] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {durationMin}분 · 청중 {audience} · 목적 {goal}
        </p>
      </section>

      {/* Outline */}
      <section className="rounded-[18px] bg-white p-7 sm:p-9">
        <h3
          className="text-[18px] wght-620 text-[var(--color-apple-ink)] sm:text-[20px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          슬라이드 흐름
        </h3>
        <ol className="mt-6 flex flex-col gap-7">
          {output.outline.map((s) => (
            <li key={s.slideNo} className="flex gap-4">
              <span
                className="w-9 shrink-0 text-[22px] wght-620 tabular-nums text-[var(--color-apple-hairline)]"
                style={{ letterSpacing: "-0.024em" }}
              >
                {String(s.slideNo).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h4
                    className="text-[15px] wght-620 text-[var(--color-apple-ink)] sm:text-[16px]"
                    style={{ letterSpacing: "-0.012em" }}
                  >
                    {s.title}
                  </h4>
                  <span className="text-[11px] wght-560 tabular-nums text-[var(--color-apple-muted)]">
                    {formatSec(s.estimatedSec)}
                  </span>
                </div>
                <p className="mt-1 text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-action)]">
                  {s.purpose}
                </p>
                <ul
                  className="mt-3 flex flex-col gap-1.5 text-[13.5px] leading-[1.55] wght-450 text-[var(--color-apple-ink)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  {s.structure.map((line, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-[10px] h-1 w-1 shrink-0 rounded-full bg-[var(--color-apple-muted)]" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 rounded-[8px] border-l-2 border-[var(--color-apple-action)] bg-[var(--color-apple-pearl)] px-3 py-2">
                  <p className="text-[10.5px] wght-700 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
                    스피커 노트
                  </p>
                  <p
                    className="mt-0.5 text-[12.5px] wght-450 leading-[1.55] text-[var(--color-apple-ink)]"
                    style={{ letterSpacing: "-0.012em" }}
                  >
                    {s.speakerNote}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Q&A bank */}
      <section className="rounded-[18px] bg-white p-7 sm:p-9">
        <h3
          className="text-[18px] wght-620 text-[var(--color-apple-ink)] sm:text-[20px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          예상 질문
        </h3>
        <ul className="mt-5 flex flex-col gap-5">
          {output.qaBank.map((q, i) => (
            <li
              key={i}
              className="border-b border-[var(--color-apple-hairline-soft)] pb-5 last:border-0 last:pb-0"
            >
              <div className="flex items-baseline gap-2">
                <span className="shrink-0 wght-620 tabular-nums text-[var(--color-apple-action)]">
                  Q{i + 1}
                </span>
                <h4
                  className="flex-1 text-[14px] wght-620 leading-[1.5] text-[var(--color-apple-ink)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  {q.question}
                </h4>
              </div>
              <p className="mt-2 text-[11.5px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
                의도 · {q.intent}
              </p>
              <p
                className="mt-2 text-[13px] wght-450 leading-[1.6] text-[var(--color-apple-ink)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                {q.answerHint}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* Delivery tips */}
      {output.deliveryTips && output.deliveryTips.length > 0 && (
        <section className="rounded-[18px] bg-white p-7 sm:p-9">
          <h3
            className="text-[18px] wght-620 text-[var(--color-apple-ink)] sm:text-[20px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            발표 직전 팁
          </h3>
          <ul className="mt-4 flex flex-col gap-2.5">
            {output.deliveryTips.map((t, i) => (
              <li
                key={i}
                className="flex gap-2 text-[13.5px] wght-450 leading-[1.6] text-[var(--color-apple-ink)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                <span aria-hidden className="text-[var(--color-apple-action)]">
                  →
                </span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Watermark + 다시 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1">
          <WizardWatermark modelText={output.watermark} />
        </div>
        {onRestart && <SecondaryButton onClick={onRestart}>다시 만들기</SecondaryButton>}
      </div>
    </div>
  );
}

/* ─────────── shared primitives ─────────── */

function ProgressHeader({ step }: { step: 0 | 1 | 2 | 3 }) {
  const progress = (step + 1) / STEP_LABELS.length;
  return (
    <>
      <div
        className="flex items-center gap-3 text-[12px] wght-560"
        style={{ letterSpacing: "-0.012em" }}
      >
        <span className="tabular-nums text-[var(--color-apple-ink)]">
          {String(step + 1).padStart(2, "0")}
        </span>
        <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-[var(--color-apple-hairline)]">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-apple-action)] transition-all duration-300"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <span className="tabular-nums text-[var(--color-apple-muted)]">
          {String(STEP_LABELS.length).padStart(2, "0")}
        </span>
      </div>
      <ul
        className="mt-5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] wght-450"
        style={{ letterSpacing: "-0.012em" }}
      >
        {STEP_LABELS.map((label, i) => (
          <li
            key={label}
            className={cn(
              "inline-flex items-center gap-1",
              i === step
                ? "wght-560 text-[var(--color-apple-ink)]"
                : i < step
                  ? "text-[var(--color-apple-action)]"
                  : "text-[var(--color-apple-muted)]",
            )}
          >
            {i < step && <CheckIcon />}
            {label}
            {i < STEP_LABELS.length - 1 && (
              <span className="ml-3 text-[var(--color-apple-hairline)]">·</span>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function StepQuestion({ question, hint }: { question: string; hint: string }) {
  return (
    <div className="mt-10">
      <h2
        className="text-[24px] leading-[1.2] wght-620 text-[var(--color-apple-ink)] sm:text-[28px]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {question}
      </h2>
      <p
        className="mt-3 text-[14px] leading-[1.55] wght-450 text-[var(--color-apple-muted)] sm:text-[15px]"
        style={{ letterSpacing: "-0.022em" }}
      >
        {hint}
      </p>
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-[11.5px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
        {label}
      </span>
      {children}
    </div>
  );
}

function ChoiceButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-1 rounded-[12px] border px-4 py-3.5 text-left text-[14px] transition-colors",
        active
          ? "border-[var(--color-apple-action)] bg-[#f0f7ff]"
          : "border-[var(--color-apple-hairline-soft)] bg-white hover:border-[var(--color-apple-hairline)] hover:bg-[var(--color-apple-pearl)]",
      )}
      style={{ letterSpacing: "-0.012em" }}
    >
      {children}
    </button>
  );
}

function ActionRow({ children }: { children: React.ReactNode }) {
  return <div className="mt-9 flex flex-wrap items-center gap-x-3 gap-y-2">{children}</div>;
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
      className={cn(
        "group inline-flex h-[44px] items-center justify-center rounded-full px-6 text-[14px] wght-560 transition-all duration-150 active:scale-[0.97]",
        disabled
          ? "cursor-not-allowed bg-[var(--color-apple-hairline)] text-white"
          : "bg-[var(--color-apple-action)] text-white hover:bg-[var(--color-apple-action-hover)]",
      )}
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
      className="inline-flex h-[44px] items-center justify-center rounded-full border border-[var(--color-apple-hairline)] px-5 text-[13px] wght-450 text-[var(--color-apple-muted)] transition-all hover:border-[var(--color-apple-ink)] hover:text-[var(--color-apple-ink)] disabled:opacity-40"
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
      className={cn(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border",
        checked
          ? "border-[var(--color-apple-action)] bg-[var(--color-apple-action)] text-white"
          : "border-[var(--color-apple-hairline)] bg-white",
      )}
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
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-[var(--color-apple-action)]/30 border-t-[var(--color-apple-action)]"
    />
  );
}

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
      <path
        d="M2 5.2l2 2L8 3"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatSec(sec: number): string {
  if (sec < 60) return `${sec}초`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}분` : `${m}분 ${s}초`;
}
