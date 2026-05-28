"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Kbd } from "@/components/primitives";
import { WizardWatermark } from "@/components/wizard-shell";
import { useJob } from "@/lib/hooks/use-job";
import type { ReportStructureOutputT } from "@/lib/schemas";
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

type ReportType = "분석" | "비평" | "주장" | "비교" | "사례 연구" | "조사 보고";
type Audience = "교수님" | "조교" | "학우 발표용";

const TYPE_OPTIONS: ReportType[] = ["분석", "비평", "주장", "비교", "사례 연구", "조사 보고"];
const TYPE_HINT: Record<ReportType, string> = {
  분석: "현상 → 원인 → 영향",
  비평: "대상 요약 → 강점·약점 → 평가",
  주장: "주장 → 근거 → 반론 → 재반박",
  비교: "기준 → A → B → 종합",
  "사례 연구": "사례 → 맥락 → 분석 → 일반화",
  "조사 보고": "목적 → 방법 → 결과 → 시사점",
};

const PAGE_PRESETS = [1, 2, 3, 4, 6, 8] as const;
const AUDIENCE_OPTIONS: Audience[] = ["교수님", "조교", "학우 발표용"];
const AUDIENCE_HINT: Record<Audience, string> = {
  교수님: "비판 수용·반론 자세",
  조교: "채점 기준 충족 우선",
  "학우 발표용": "짧고 명확하게",
};

interface Answers {
  topic: string;
  reportType: ReportType | null;
  targetPages: number;
  audience: Audience | null;
  constraints: string;
  /** 마지막 단계 자유 입력. constraints에 합쳐서 전송. */
  additionalRequest: string;
  materialIds: Set<string>;
}

const STEP_LABELS = ["주제", "타입·분량", "청중·제약", "참고 자료"] as const;

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
    reportType: null,
    targetPages: 4,
    audience: null,
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
    ? ((job.result as { output?: ReportStructureOutputT } | null)?.output ?? null)
    : null;
  const errorMsg = submitError ?? pollError ?? (job?.status === "error" ? job.errorMessage : null);

  const canStep1 = answers.topic.trim().length >= 2;
  const canStep2 = answers.reportType !== null;
  const canStep3 = answers.audience !== null;

  async function handleSubmit() {
    setSubmitError(null);
    if (!answers.reportType || !answers.audience) {
      setSubmitError("타입·청중을 골라주세요");
      return;
    }
    const mergedConstraints = [answers.constraints.trim(), answers.additionalRequest.trim()]
      .filter(Boolean)
      .join(" / ");
    try {
      const res = await fetch("/api/wizards/report-structure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: answers.topic.trim(),
          reportType: answers.reportType,
          targetPages: answers.targetPages,
          audience: answers.audience,
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
    if (answers.reportType && answers.audience) {
      return (
        <ReportStructureResultCard
          output={output}
          topic={answers.topic}
          reportType={answers.reportType}
          targetPages={answers.targetPages}
          audience={answers.audience}
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
        <StepTypePages
          reportType={answers.reportType}
          setReportType={(v) => setAnswers((p) => ({ ...p, reportType: v }))}
          targetPages={answers.targetPages}
          setTargetPages={(v) => setAnswers((p) => ({ ...p, targetPages: v }))}
          onBack={() => setStep(0)}
          onNext={() => canStep2 && setStep(2)}
          canNext={canStep2}
        />
      )}

      {step === 2 && (
        <StepAudienceConstraints
          audience={answers.audience}
          setAudience={(v) => setAnswers((p) => ({ ...p, audience: v }))}
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

/* ─── steps ─────────────────────────── */

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
        question="리포트 주제는 무엇인가요?"
        hint="한 줄로. 예: '조선 후기 실학의 사회 변화 분석'"
      />
      <input
        ref={inputRef}
        type="text"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canNext) onNext();
        }}
        placeholder="리포트 주제를 한 줄로"
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

function StepTypePages({
  reportType,
  setReportType,
  targetPages,
  setTargetPages,
  onBack,
  onNext,
  canNext,
}: {
  reportType: ReportType | null;
  setReportType: (v: ReportType) => void;
  targetPages: number;
  setTargetPages: (v: number) => void;
  onBack: () => void;
  onNext: () => void;
  canNext: boolean;
}) {
  return (
    <>
      <StepQuestion
        question="어떤 종류의 리포트인가요?"
        hint="타입으로 섹션 흐름이, 분량으로 섹션 수가 정해져요"
      />
      <div className="mt-8 flex flex-col gap-7">
        <FieldGroup label="리포트 타입">
          <div className="grid gap-2 sm:grid-cols-2">
            {TYPE_OPTIONS.map((opt) => {
              const active = reportType === opt;
              return (
                <ChoiceButton key={opt} active={active} onClick={() => setReportType(opt)}>
                  <span className="wght-560">{opt}</span>
                  <span className="text-[11.5px] wght-450 text-[var(--color-apple-muted)]">
                    {TYPE_HINT[opt]}
                  </span>
                </ChoiceButton>
              );
            })}
          </div>
        </FieldGroup>

        <FieldGroup label="목표 분량">
          <div className="flex flex-wrap gap-2">
            {PAGE_PRESETS.map((p) => {
              const active = targetPages === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setTargetPages(p)}
                  className={cn(
                    "rounded-full px-4 py-2 text-[13px] wght-560 transition-all",
                    active
                      ? "bg-[var(--color-apple-ink)] text-white"
                      : "border border-[var(--color-apple-hairline)] text-[var(--color-apple-muted)] hover:border-[var(--color-apple-ink)] hover:text-[var(--color-apple-ink)]",
                  )}
                >
                  {p}쪽
                </button>
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

function StepAudienceConstraints({
  audience,
  setAudience,
  constraints,
  setConstraints,
  constraintsInputRef,
  onBack,
  onNext,
  canNext,
}: {
  audience: Audience | null;
  setAudience: (v: Audience) => void;
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
        question="누가 읽나요? 평가 기준은요?"
        hint="청중으로 톤·깊이가, 제약으로 가점 포인트가 정해져요"
      />
      <div className="mt-8 flex flex-col gap-7">
        <FieldGroup label="청중">
          <div className="grid gap-2 sm:grid-cols-3">
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

        <FieldGroup label="제약·평가 기준 (선택)">
          <input
            ref={constraintsInputRef}
            type="text"
            value={constraints}
            onChange={(e) => setConstraints(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canNext) onNext();
            }}
            placeholder="예: 1차 사료 3건 이상, Chicago 양식, 비판적 시각 강조"
            maxLength={400}
            className="h-11 w-full rounded-[10px] border border-[var(--color-apple-hairline)] px-3.5 text-[14px] wght-450 text-[var(--color-apple-ink)] placeholder:text-[var(--color-apple-muted)] focus:border-[var(--color-apple-action)] focus:outline-none"
            style={{ letterSpacing: "-0.012em" }}
          />
          <p className="mt-1.5 text-[11.5px] wght-450 text-[var(--color-apple-muted)]">
            교수님이 강조한 기준을 그대로 적으면 가점 섹션이 나와요.
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
        hint="고른 자료에서 인용할 위치까지 박아드려요. 없어도 진행 가능."
      />

      {hasMaterials ? (
        <div className="mt-8 flex flex-col gap-5">
          <p className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
            최대 3개
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
            업로드된 자료가 없어요. 자료 없이도 구조는 짜드리지만 인용 단서가 빠집니다.
          </p>
        </div>
      )}

      <AdditionalRequestField
        value={additionalRequest}
        onChange={setAdditionalRequest}
        placeholder="예: 본인 관점 명확히, 통계 인용 2건 이상, 결론에 한계 한 줄"
      />

      <SummaryBox summary={summary} />

      {errorMsg && (
        <p className="mt-5 text-[12.5px] wght-450 text-[var(--color-urgent)]">{errorMsg}</p>
      )}

      <ActionRow>
        <SecondaryButton onClick={onBack}>← 이전</SecondaryButton>
        <PrimaryButton onClick={onSubmit}>
          {selectedIds.size > 0
            ? `${selectedIds.size}개 자료로 구조 짜기 →`
            : "자료 없이 구조 짜기 →"}
        </PrimaryButton>
      </ActionRow>
    </>
  );
}

/**
 * 마지막 단계의 자유 입력 — "추가 요청 사항". constraints에 합쳐서 모델에 전달.
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
          <span className="text-[var(--color-apple-muted)]">타입·분량 </span>
          {summary.reportType ?? "—"} · {summary.targetPages}쪽
        </li>
        <li>
          <span className="text-[var(--color-apple-muted)]">청중 </span>
          {summary.audience ?? "—"}
          {summary.constraints && ` · ${summary.constraints}`}
        </li>
      </ul>
    </div>
  );
}

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
        {topic} 리포트 구조를 짜고 있어요
      </h2>
      <div className="mt-6 flex items-center gap-3">
        <Spinner />
        <span
          className="text-[13px] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          섹션별 흐름·각 섹션 핵심 질문·체크리스트까지. 40초~1분쯤 걸려요.
        </span>
      </div>
    </div>
  );
}

/* ─── Result Card (export — history detail이 재사용) ─── */

export function ReportStructureResultCard({
  output,
  topic,
  reportType,
  targetPages,
  audience,
  onRestart,
}: {
  output: ReportStructureOutputT;
  topic: string;
  reportType: ReportType;
  targetPages: number;
  audience: Audience;
  onRestart?: () => void;
}) {
  if (output.rejected) {
    return (
      <div className="rounded-[18px] bg-white p-7 sm:p-9">
        <p className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-urgent)]">
          구조 추천 불가
        </p>
        <h2
          className="mt-3 text-[22px] leading-[1.2] wght-620 text-[var(--color-apple-ink)] sm:text-[26px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {output.reason}
        </h2>
        {onRestart && (
          <div className="mt-7">
            <SecondaryButton onClick={onRestart}>다시 시도 →</SecondaryButton>
          </div>
        )}
      </div>
    );
  }

  const totalPages = output.sections.reduce((a, s) => a + s.estimatedPages, 0);

  return (
    <div className="fade-up flex flex-col gap-6">
      {/* Hero */}
      <section className="rounded-[18px] bg-white p-7 sm:p-9">
        <p className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-action)]">
          리포트 구조 · {output.sections.length}섹션 · 약 {totalPages.toFixed(1)}쪽
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
          {reportType} · {targetPages}쪽 · 청중 {audience}
        </p>
      </section>

      {/* Thesis */}
      <section className="rounded-[18px] bg-white p-7 sm:p-9">
        <h3 className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
          전체 흐름
        </h3>
        <p
          className="mt-3 text-[15px] leading-[1.6] wght-450 text-[var(--color-apple-ink)] sm:text-[16px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {output.thesis}
        </p>
      </section>

      {/* Sections */}
      <section className="rounded-[18px] bg-white p-7 sm:p-9">
        <h3
          className="text-[18px] wght-620 text-[var(--color-apple-ink)] sm:text-[20px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          섹션별 가이드
        </h3>
        <ol className="mt-6 flex flex-col gap-7">
          {output.sections.map((s) => (
            <li key={s.order} className="flex gap-4">
              <span
                className="w-9 shrink-0 text-[22px] wght-620 tabular-nums text-[var(--color-apple-hairline)]"
                style={{ letterSpacing: "-0.024em" }}
              >
                {String(s.order).padStart(2, "0")}
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
                    약 {s.estimatedPages.toFixed(1)}쪽
                  </span>
                </div>
                <p className="mt-1 text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-action)]">
                  {s.purpose}
                </p>
                <div className="mt-3">
                  <p className="text-[10.5px] wght-700 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
                    본인이 답할 질문
                  </p>
                  <ul
                    className="mt-2 flex flex-col gap-1.5 text-[13.5px] leading-[1.55] wght-450 text-[var(--color-apple-ink)]"
                    style={{ letterSpacing: "-0.012em" }}
                  >
                    {s.keyQuestions.map((q, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="shrink-0 wght-560 text-[var(--color-apple-action)]">
                          {i + 1}.
                        </span>
                        <span>{q}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {s.citationHint && (
                  <div className="mt-3 rounded-[8px] border-l-2 border-[var(--color-apple-hairline)] bg-[var(--color-apple-pearl)] px-3 py-2">
                    <p className="text-[10.5px] wght-700 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
                      인용 단서
                    </p>
                    <p
                      className="mt-0.5 text-[12.5px] wght-450 leading-[1.55] text-[var(--color-apple-ink)]"
                      style={{ letterSpacing: "-0.012em" }}
                    >
                      {s.citationHint}
                    </p>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Pre-write checks */}
      <section className="rounded-[18px] bg-white p-7 sm:p-9">
        <h3
          className="text-[18px] wght-620 text-[var(--color-apple-ink)] sm:text-[20px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          본문 쓰기 전 체크
        </h3>
        <ul className="mt-4 flex flex-col gap-2.5">
          {output.preWriteChecks.map((c, i) => (
            <li
              key={i}
              className="flex gap-2 text-[13.5px] wght-450 leading-[1.6] text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              <span aria-hidden className="text-[var(--color-apple-action)]">
                →
              </span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Pitfalls */}
      <section className="rounded-[18px] bg-white p-7 sm:p-9">
        <h3
          className="text-[18px] wght-620 text-[var(--color-apple-ink)] sm:text-[20px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          자주 빠지는 함정
        </h3>
        <ul className="mt-4 flex flex-col gap-2.5">
          {output.commonPitfalls.map((p, i) => (
            <li
              key={i}
              className="flex gap-2 text-[13.5px] wght-450 leading-[1.6] text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              <span aria-hidden className="text-[var(--color-urgent)]">
                ⚠
              </span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Watermark + restart */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1">
          <WizardWatermark modelText={output.watermark} />
        </div>
        {onRestart && <SecondaryButton onClick={onRestart}>다른 리포트 →</SecondaryButton>}
      </div>
    </div>
  );
}

/* ─── shared primitives ─── */

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
