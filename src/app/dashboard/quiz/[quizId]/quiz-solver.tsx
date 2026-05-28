"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { QuizSolveView } from "@/lib/data/quizzes";
import { QuizResultView, type ResultQuestion } from "./quiz-result-view";

type Choice = "A" | "B" | "C" | "D";

interface SubmitResult {
  questionId: number;
  kind: "multiple-choice" | "short-answer" | "essay";
  correct: boolean;
  answer: string;
  submitted: string | null;
  explanation: string;
  evidence?: string;
  evidencePage?: number | null;
  gradingNote?: string;
}

/**
 * /api/quiz/[id]/grade-one 응답 — submit과 거의 같지만 attemptId 없음.
 * 모든 문제 step 끝나면 부모가 모아 /submit으로 한 번 보냄.
 */
interface StepGradeResult {
  questionId: number;
  kind: "multiple-choice" | "short-answer" | "essay";
  correct: boolean;
  answer: string;
  submitted: string | null;
  explanation: string;
  evidence: string;
  evidencePage: number | null;
  gradingNote?: string;
}

interface SubmitOk {
  ok: true;
  attemptId: string;
  score: number;
  total: number;
  results: SubmitResult[];
  watermark: string;
}

type ApiErr = { ok: false; error: string };

export function QuizSolver({ quiz }: { quiz: QuizSolveView }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"solve" | "result">("solve");
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [shownHints, setShownHints] = useState<Record<number, boolean>>({});
  const [flagged, setFlagged] = useState<Record<number, boolean>>({});
  const [result, setResult] = useState<SubmitOk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [startedAt] = useState<number>(() => Date.now());
  const [elapsedLabel, setElapsedLabel] = useState("0분");
  // step-by-step에서 한 문제씩 즉시 채점한 결과를 모아둠. 마지막에 /submit으로 보낼 때
  // attempt가 INSERT돼 점수·복습 큐가 한 번만 기록된다.
  const [stepResults, setStepResults] = useState<Record<number, StepGradeResult>>({});
  // 현재 보고 있는 문제 index (0 ~ quiz.total-1). step-by-step의 핵심 state.
  const [stepIndex, setStepIndex] = useState(0);
  const questionRefs = useRef<Record<number, HTMLElement | null>>({});

  useEffect(() => {
    if (phase !== "solve") return;
    const timer = window.setInterval(() => {
      setElapsedLabel(formatDuration(Date.now() - startedAt));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase, startedAt]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && quiz.materialId) {
        router.push(getMaterialPath(quiz));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quiz, router]);

  // step-by-step에서 헤더가 보여줄 카운트 — 채점 완료 문제 수가 정신 모델.
  // answers·flagged는 자식이 직접 다루고, 헤더는 보고용으로만 본다.
  const gradedCount = useMemo(() => Object.keys(stepResults).length, [stepResults]);
  const flaggedCount = useMemo(
    () => Object.values(flagged).filter(Boolean).length,
    [flagged],
  );

  async function onSubmit() {
    setLoading(true);
    setError(null);
    try {
      const body = {
        answers: quiz.questions.map((question) =>
          question.kind === "multiple-choice"
            ? {
                questionId: question.id,
                choice: answers[question.id] as Choice,
              }
            : {
                questionId: question.id,
                response: answers[question.id]?.trim() ?? "",
              },
        ),
        durationMs: Date.now() - startedAt,
      };

      const res = await fetch(`/api/quiz/${quiz.id}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as SubmitOk | ApiErr;
      if (!json.ok) {
        setError(json.error);
        return;
      }
      setResult(json);
      setPhase("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Header
        quiz={quiz}
        answeredCount={gradedCount}
        flaggedCount={flaggedCount}
        elapsedLabel={elapsedLabel}
      />

      {error && (
        <div className="mb-4 rounded-[16px] border border-[color:rgba(255,59,48,0.14)] bg-[var(--color-urgent-soft)] px-4 py-3 text-[13px] wght-560 text-[var(--color-urgent)]">
          {error}
        </div>
      )}

      {phase === "solve" && (
        <SolveSection
          quiz={quiz}
          answers={answers}
          setAnswers={setAnswers}
          shownHints={shownHints}
          setShownHints={setShownHints}
          flagged={flagged}
          setFlagged={setFlagged}
          stepIndex={stepIndex}
          setStepIndex={setStepIndex}
          stepResults={stepResults}
          setStepResults={setStepResults}
          loading={loading}
          onSubmit={onSubmit}
          questionRefs={questionRefs}
        />
      )}

      {phase === "result" && result && (
        <ResultSection quiz={quiz} result={result} durationLabel={elapsedLabel} />
      )}
    </>
  );
}

function Header({
  quiz,
  answeredCount,
  flaggedCount,
  elapsedLabel,
}: {
  quiz: QuizSolveView;
  answeredCount: number;
  flaggedCount: number;
  elapsedLabel: string;
}) {
  return (
    <header className="mb-8 fade-up">
      <p
        className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {quiz.total}문제 · {quiz.difficulty}
      </p>
      <h1
        className="mt-2 text-[28px] wght-620 text-[var(--color-apple-ink)] sm:text-[34px]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {quiz.title}
      </h1>
      <div className="mt-5 flex flex-wrap gap-2">
        <MetaPill label="푼 문제" value={`${answeredCount}/${quiz.total}`} />
        <MetaPill label="헷갈림" value={`${flaggedCount}개`} />
        <MetaPill label="걸린 시간" value={elapsedLabel} />
      </div>
    </header>
  );
}

/**
 * 풀이 본체 — step-by-step 패턴 (2026-05-28 재설계).
 *
 * 종전: 모든 문제 카드를 세로로 깔고 사용자가 스크롤하며 답하다 마지막에 일괄 제출.
 *       30문제일 때 화면 부담 큼·진행감 약함·정답·해설을 끝나야 봄.
 * 변경: 한 번에 한 문제만. 답 → "확인" → grade-one으로 즉시 채점 → 정답·해설 표시 →
 *       "다음 문제" / "결과 보기" 액션.
 *
 * attempt 기록은 단건 채점 시점에 INSERT하지 X — 마지막에 부모 onSubmit이
 * /api/quiz/[id]/submit 한 번 호출해 score·복습 큐가 한 attempt로 깔끔히 기록되게.
 */
function SolveSection({
  quiz,
  answers,
  setAnswers,
  shownHints,
  setShownHints,
  flagged,
  setFlagged,
  stepIndex,
  setStepIndex,
  stepResults,
  setStepResults,
  loading,
  onSubmit,
  questionRefs,
}: {
  quiz: QuizSolveView;
  answers: Record<number, string>;
  setAnswers: Dispatch<SetStateAction<Record<number, string>>>;
  shownHints: Record<number, boolean>;
  setShownHints: Dispatch<SetStateAction<Record<number, boolean>>>;
  flagged: Record<number, boolean>;
  setFlagged: Dispatch<SetStateAction<Record<number, boolean>>>;
  stepIndex: number;
  setStepIndex: Dispatch<SetStateAction<number>>;
  stepResults: Record<number, StepGradeResult>;
  setStepResults: Dispatch<SetStateAction<Record<number, StepGradeResult>>>;
  loading: boolean;
  onSubmit: () => void;
  questionRefs: MutableRefObject<Record<number, HTMLElement | null>>;
}) {
  // step-by-step에선 progress = 채점된 문제 수 / 총 문제 수.
  // 답만 적은 상태는 미반영 — 확인 누른 게 곧 "푼 것"이라는 정신 모델.
  const gradedCount = Object.keys(stepResults).length;
  const progress = quiz.total > 0 ? Math.round((gradedCount / quiz.total) * 100) : 0;
  const remaining = quiz.total - gradedCount;
  const currentQuestion = quiz.questions[stepIndex];
  const currentGraded = currentQuestion ? stepResults[currentQuestion.id] : undefined;
  const isReviewing = Boolean(currentGraded);
  const isLastStep = stepIndex === quiz.total - 1;
  const [stepError, setStepError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // 현재 step이 바뀌면 hint·error는 step별로 리셋. (hint는 question별 state라 자동 보존)
  useEffect(() => {
    setStepError(null);
  }, []);

  async function onConfirm() {
    if (!currentQuestion) return;
    const value = answers[currentQuestion.id];
    if (!isAnswered(currentQuestion, value)) return;
    setConfirming(true);
    setStepError(null);
    try {
      const body =
        currentQuestion.kind === "multiple-choice"
          ? { answer: { questionId: currentQuestion.id, choice: value as Choice } }
          : { answer: { questionId: currentQuestion.id, response: value?.trim() ?? "" } };
      const res = await fetch(`/api/quiz/${quiz.id}/grade-one`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as
        | { ok: true; result: StepGradeResult }
        | { ok: false; error: string };
      if (!json.ok) {
        setStepError(json.error);
        return;
      }
      setStepResults((prev) => ({ ...prev, [currentQuestion.id]: json.result }));
    } catch (e) {
      setStepError(e instanceof Error ? e.message : String(e));
    } finally {
      setConfirming(false);
    }
  }

  function onNext() {
    if (isLastStep) {
      onSubmit();
      return;
    }
    setStepIndex((i) => Math.min(i + 1, quiz.total - 1));
  }

  function onJump(targetIndex: number) {
    setStepIndex(Math.min(Math.max(targetIndex, 0), quiz.total - 1));
  }

  if (!currentQuestion) {
    return (
      <section className="rounded-[16px] border border-[var(--color-apple-hairline)] bg-white p-6 text-[14px] text-[var(--color-apple-muted)]">
        문제를 불러올 수 없어요.
      </section>
    );
  }

  const value = answers[currentQuestion.id];
  const canConfirm = isAnswered(currentQuestion, value) && !isReviewing && !confirming;

  return (
    <section className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8">
      {/* 좌측 미니맵 — step-by-step에 맞춰 "현재/완료/미완료" 3색 + 현재 step highlight */}
      <aside className="fade-up sticky top-2 z-20 lg:relative lg:top-6 lg:z-auto lg:self-start">
        <StepMinimapMobile
          quiz={quiz}
          stepIndex={stepIndex}
          stepResults={stepResults}
          flagged={flagged}
          onJump={onJump}
          progress={progress}
          remaining={remaining}
        />

        <div className="hidden rounded-[24px] border border-[var(--color-apple-hairline)] bg-white/92 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl lg:block">
          <p className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
            점검 현황
          </p>
          <p
            className="mt-3 text-[30px] leading-none wght-620 text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.024em" }}
          >
            {progress}%
          </p>
          <p className="mt-2 text-[13px] leading-[1.55] text-[var(--color-apple-muted)]">
            {remaining === 0
              ? "모두 풀어봤어요. 결과를 보고 오답만 한 번 더 점검해요."
              : `${remaining}문제 더 풀면 결과로 넘어가요.`}
          </p>

          <div className="mt-5 h-2 overflow-hidden rounded-full bg-[var(--color-apple-pearl)]">
            <div
              className="h-full rounded-full bg-[var(--color-apple-action)] transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* 6열 그리드 — 현재 step은 진한 액션색 ring, 정답은 차분한 액션 tint,
              오답은 urgent tint, 미답은 회색. 사용자가 어디까지 왔는지 한눈에. */}
          <div className="mt-6 grid grid-cols-6 gap-1.5">
            {quiz.questions.map((q, index) => {
              const graded = stepResults[q.id];
              const isCurrent = index === stepIndex;
              const isFlagged = Boolean(flagged[q.id]);
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => onJump(index)}
                  className={[
                    "inline-flex aspect-square w-full items-center justify-center rounded-[10px] border text-[12px] wght-560 tabular-nums transition-colors",
                    graded
                      ? graded.correct
                        ? "border-[color:rgba(59,130,246,0.14)] bg-[color:rgba(59,130,246,0.10)] text-[var(--color-apple-action)]"
                        : "border-[color:rgba(255,59,48,0.20)] bg-[var(--color-urgent-soft)] text-[var(--color-urgent)]"
                      : "border-[var(--color-apple-hairline)] bg-white text-[var(--color-apple-muted)] hover:border-[var(--color-apple-action)]/25 hover:text-[var(--color-apple-ink)]",
                    isCurrent ? "ring-2 ring-[var(--color-apple-action)] ring-offset-1" : "",
                    isFlagged ? "ring-2 ring-[color:rgba(255,159,10,0.20)]" : "",
                  ].join(" ")}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>

          <div className="mt-6 rounded-[18px] bg-[var(--color-apple-pearl)] p-4">
            <p className="text-[12px] wght-560 text-[var(--color-apple-ink)]">한 문제씩 점검</p>
            <ol className="mt-2 space-y-2 text-[12.5px] leading-[1.55] text-[var(--color-apple-muted)]">
              <li>1. 답을 고르고 확인 누르기</li>
              <li>2. 정답·근거 바로 확인</li>
              <li>3. 다음 문제로 한 번에</li>
            </ol>
          </div>
        </div>
      </aside>

      {/* 우측 — 현재 step 하나만 노출. ref는 부모가 기대하는 questionRefs 그대로 채워둠
          (다른 화면에서 ID로 찾을 수 있게). */}
      <div className="flex flex-col gap-5">
        <article
          ref={(node) => {
            questionRefs.current[currentQuestion.id] = node;
          }}
          className="fade-up rounded-[24px] border border-[var(--color-apple-hairline)] bg-white/96 p-5 shadow-[0_20px_70px_rgba(15,23,42,0.05)] backdrop-blur-xl sm:p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
                {stepIndex + 1} / {quiz.total} · {currentQuestion.topic} ·{" "}
                {currentQuestion.difficulty}
              </p>
              <p className="mt-3 text-[16px] leading-[1.6] wght-560 text-[var(--color-apple-ink)] sm:text-[17px]">
                {currentQuestion.stem}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setFlagged((prev) => ({
                  ...prev,
                  [currentQuestion.id]: !prev[currentQuestion.id],
                }))
              }
              disabled={isReviewing}
              className={[
                "inline-flex h-[34px] items-center rounded-full px-3 text-[12.5px] wght-560 transition-colors disabled:opacity-50",
                flagged[currentQuestion.id]
                  ? "bg-[color:rgba(255,159,10,0.14)] text-[color:rgb(180,83,9)]"
                  : "bg-[var(--color-apple-pearl)] text-[var(--color-apple-muted)] hover:text-[var(--color-apple-ink)]",
              ].join(" ")}
            >
              {flagged[currentQuestion.id] ? "헷갈림 표시됨" : "헷갈리면 표시"}
            </button>
          </div>

          {currentQuestion.kind === "multiple-choice" ? (
            <div className="mt-5 flex flex-col gap-2.5">
              {currentQuestion.choices.map((choice) => {
                const selected = value === choice.key;
                // 채점 후엔 정답·내가 고른 오답을 색으로 분리. 정답 = 액션색, 오답 선택 = urgent.
                const isCorrectChoice = isReviewing && currentGraded?.answer === choice.key;
                const isWrongSelected =
                  isReviewing && selected && !currentGraded?.correct;
                return (
                  <label
                    key={choice.key}
                    className={[
                      "flex cursor-pointer items-start gap-3 rounded-[18px] border px-4 py-3.5 text-[14px] leading-[1.55] transition-all",
                      isCorrectChoice
                        ? "border-[color:rgba(59,130,246,0.30)] bg-[color:rgba(59,130,246,0.10)] shadow-[0_10px_30px_rgba(59,130,246,0.12)]"
                        : isWrongSelected
                          ? "border-[color:rgba(255,59,48,0.24)] bg-[var(--color-urgent-soft)]"
                          : selected
                            ? "border-[color:rgba(59,130,246,0.14)] bg-[color:rgba(59,130,246,0.07)] shadow-[0_10px_30px_rgba(59,130,246,0.10)]"
                            : "border-[var(--color-apple-hairline)] bg-[color:rgba(255,255,255,0.72)] hover:border-[color:rgba(15,23,42,0.10)] hover:bg-[var(--color-apple-pearl)]",
                      isReviewing ? "cursor-default" : "",
                    ].join(" ")}
                  >
                    <input
                      type="radio"
                      name={`q-${currentQuestion.id}`}
                      value={choice.key}
                      checked={selected}
                      disabled={isReviewing}
                      onChange={() =>
                        setAnswers((prev) => ({ ...prev, [currentQuestion.id]: choice.key }))
                      }
                      className="mt-1"
                    />
                    <span className="wght-620 text-[var(--color-apple-ink)]">{choice.key}.</span>
                    <span className="flex-1 text-[var(--color-apple-ink)]">{choice.text}</span>
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="mt-5">
              {currentQuestion.kind === "essay" ? (
                <textarea
                  value={value ?? ""}
                  disabled={isReviewing}
                  onChange={(e) =>
                    setAnswers((prev) => ({
                      ...prev,
                      [currentQuestion.id]: e.target.value.slice(0, 4000),
                    }))
                  }
                  placeholder={currentQuestion.placeholder}
                  className="min-h-[180px] w-full rounded-[20px] border border-[var(--color-apple-hairline)] bg-[color:rgba(255,255,255,0.78)] px-4 py-4 text-[14px] leading-[1.65] text-[var(--color-apple-ink)] outline-none transition-colors placeholder:text-[var(--color-apple-muted)]/55 focus:border-[var(--color-apple-action)] disabled:bg-[var(--color-apple-pearl)]"
                  style={{ letterSpacing: "-0.012em" }}
                />
              ) : (
                <input
                  type="text"
                  value={value ?? ""}
                  disabled={isReviewing}
                  onChange={(e) =>
                    setAnswers((prev) => ({
                      ...prev,
                      [currentQuestion.id]: e.target.value.slice(0, 300),
                    }))
                  }
                  placeholder={currentQuestion.placeholder}
                  className="h-[52px] w-full rounded-full border border-[var(--color-apple-hairline)] bg-[color:rgba(255,255,255,0.78)] px-5 text-[14px] text-[var(--color-apple-ink)] outline-none transition-colors placeholder:text-[var(--color-apple-muted)]/55 focus:border-[var(--color-apple-action)] disabled:bg-[var(--color-apple-pearl)]"
                  style={{ letterSpacing: "-0.012em" }}
                />
              )}

              {!isReviewing && (
                <div className="mt-3 rounded-[16px] bg-[var(--color-apple-pearl)] px-4 py-3 text-[12.5px] leading-[1.55] text-[var(--color-apple-muted)]">
                  {currentQuestion.kind === "essay"
                    ? "완벽한 문장보다 핵심 포인트를 직접 정리하는 게 중요해요. 확인 누르면 빠진 포인트를 바로 보여줍니다."
                    : "자료에 나온 핵심 용어 그대로 적는지 확인해 보세요. 띄어쓰기·영문 표기도 같이 점검합니다."}
                </div>
              )}
            </div>
          )}

          {currentQuestion.hint && !isReviewing && (
            <div className="mt-4">
              {shownHints[currentQuestion.id] ? (
                <div className="rounded-[18px] bg-[color:rgba(59,130,246,0.08)] p-4 text-[13px] leading-[1.6] text-[var(--color-apple-ink)]">
                  <span className="mr-1.5 text-[11px] wght-620 uppercase tracking-[0.06em] text-[var(--color-apple-action)]">
                    힌트
                  </span>
                  {currentQuestion.hint}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    setShownHints((prev) => ({ ...prev, [currentQuestion.id]: true }))
                  }
                  className="text-[13px] wght-560 text-[var(--color-apple-action)] hover:underline"
                >
                  힌트 보기
                </button>
              )}
            </div>
          )}

          {/* 채점 결과 — 확인 후에만 등장. correct·answer·explanation·evidence를 한 카드에. */}
          {isReviewing && currentGraded && (
            <GradeFeedback graded={currentGraded} />
          )}

          {stepError && (
            <p className="mt-4 text-[12.5px] wght-450 text-[var(--color-urgent)]">{stepError}</p>
          )}
        </article>

        {/* sticky 액션 — 두 모드:
             1) answering: "확인" + (이전/자료로/건너뛰기)
             2) reviewing: "다음 문제" or 마지막이면 "결과 보기" */}
        <div className="sticky bottom-4 z-10 rounded-[24px] border border-[var(--color-apple-hairline)] bg-white/92 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="text-[14px] wght-560 text-[var(--color-apple-ink)]">
                {isReviewing
                  ? currentGraded?.correct
                    ? "맞았어요. 다음 문제로 가요."
                    : "이번엔 아쉽지만 근거는 위에 정리해뒀어요."
                  : `${stepIndex + 1}번째 문제 · ${remaining}문제 남음`}
              </p>
              <p className="mt-1 text-[12.5px] text-[var(--color-apple-muted)]">
                {isReviewing
                  ? isLastStep
                    ? "마지막 문제예요. 결과 보기로 넘어가면 점수와 오답 큐가 정리돼요."
                    : "다음 문제도 같은 자료에서 나와요."
                  : "답을 고르거나 적은 뒤 확인을 누르면 정답·근거가 바로 떠요."}
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              {stepIndex > 0 && (
                <button
                  type="button"
                  onClick={() => onJump(stepIndex - 1)}
                  disabled={confirming || loading}
                  className="inline-flex h-[46px] items-center justify-center rounded-full bg-[var(--color-apple-pearl)] px-5 text-[13.5px] wght-560 text-[var(--color-apple-ink)] transition-colors hover:bg-white disabled:opacity-50"
                >
                  이전
                </button>
              )}
              {quiz.materialId && (
                <Link
                  href={getMaterialPath(quiz)}
                  className="inline-flex h-[46px] items-center justify-center rounded-full bg-white px-5 text-[13.5px] wght-560 text-[var(--color-apple-ink)] transition-colors hover:bg-[var(--color-apple-pearl)]"
                >
                  자료로
                </Link>
              )}
              {isReviewing ? (
                <button
                  type="button"
                  onClick={onNext}
                  disabled={loading}
                  className="inline-flex h-[46px] items-center justify-center rounded-full bg-[var(--color-apple-action)] px-6 text-[14px] wght-560 text-white transition-all duration-150 hover:bg-[var(--color-apple-action-hover)] disabled:opacity-50"
                >
                  {loading
                    ? "채점 중…"
                    : isLastStep
                      ? "결과 보기"
                      : "다음 문제 →"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={!canConfirm}
                  className="inline-flex h-[46px] items-center justify-center rounded-full bg-[var(--color-apple-action)] px-6 text-[14px] wght-560 text-white transition-all duration-150 hover:bg-[var(--color-apple-action-hover)] disabled:opacity-50"
                >
                  {confirming ? "채점 중…" : "확인"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * 채점 후 정답·근거 카드. 객관식·단답형·서술형 모두 같은 컨테이너로 통일.
 */
function GradeFeedback({ graded }: { graded: StepGradeResult }) {
  return (
    <div
      className={[
        "mt-5 rounded-[18px] border px-4 py-4 sm:px-5",
        graded.correct
          ? "border-[color:rgba(59,130,246,0.18)] bg-[color:rgba(59,130,246,0.05)]"
          : "border-[color:rgba(255,59,48,0.18)] bg-[var(--color-urgent-soft)]",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={[
            "inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] wght-700",
            graded.correct
              ? "bg-[color:rgba(59,130,246,0.16)] text-[var(--color-apple-action)]"
              : "bg-[color:rgba(255,59,48,0.14)] text-[var(--color-urgent)]",
          ].join(" ")}
        >
          {graded.correct ? "✓" : "✕"}
        </span>
        <p
          className={[
            "text-[14px] wght-620",
            graded.correct ? "text-[var(--color-apple-ink)]" : "text-[var(--color-urgent-strong)]",
          ].join(" ")}
          style={{ letterSpacing: "-0.012em" }}
        >
          {graded.correct ? "맞았어요" : "이번엔 틀렸어요"}
        </p>
      </div>

      {graded.kind !== "multiple-choice" && (
        <div className="mt-3">
          <p className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
            모범 답안
          </p>
          <p
            className="mt-1.5 text-[13.5px] leading-[1.6] wght-450 text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {graded.answer}
          </p>
        </div>
      )}

      {graded.kind === "multiple-choice" && !graded.correct && (
        <p className="mt-2 text-[12.5px] wght-450 text-[var(--color-apple-muted)]">
          정답은 <span className="wght-620 text-[var(--color-apple-ink)]">{graded.answer}</span>{" "}
          였어요.
        </p>
      )}

      {graded.explanation && (
        <div className="mt-3">
          <p className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
            풀이
          </p>
          <p
            className="mt-1.5 text-[13.5px] leading-[1.6] wght-450 text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {graded.explanation}
          </p>
        </div>
      )}

      {graded.evidence && (
        <div className="mt-3 rounded-[12px] bg-white/70 px-3 py-2.5">
          <p className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
            자료 근거{graded.evidencePage ? ` · p.${graded.evidencePage}` : ""}
          </p>
          <p
            className="mt-1.5 text-[12.5px] leading-[1.55] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            “{graded.evidence}”
          </p>
        </div>
      )}

      {graded.gradingNote && (
        <p
          className="mt-3 text-[11.5px] leading-[1.55] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {graded.gradingNote}
        </p>
      )}
    </div>
  );
}

/**
 * 모바일·iPad용 sticky 미니맵 — step-by-step 버전.
 * MobileMinimap을 step 상태 기반으로 다시 짠 버전.
 */
function StepMinimapMobile({
  quiz,
  stepIndex,
  stepResults,
  flagged,
  onJump,
  progress,
  remaining,
}: {
  quiz: QuizSolveView;
  stepIndex: number;
  stepResults: Record<number, StepGradeResult>;
  flagged: Record<number, boolean>;
  onJump: (index: number) => void;
  progress: number;
  remaining: number;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-[14px] border border-[var(--color-apple-hairline)] bg-white/95 px-3 py-2.5 shadow-[0_4px_16px_rgba(15,23,42,0.04)] backdrop-blur-md lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <p
          className="text-[14px] leading-none wght-620 tabular-nums text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.016em" }}
        >
          {stepIndex + 1} / {quiz.total}
        </p>
        <p className="flex-1 text-[11.5px] wght-450 text-[var(--color-apple-muted)]">
          {remaining === 0 ? "모두 풀어봤어요" : `남은 ${remaining}문제`}
        </p>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? "문제 목록 접기" : "문제 목록 펴기"}
          className="-mr-1 inline-flex h-7 items-center gap-1 rounded-full bg-[var(--color-apple-pearl)] px-2.5 text-[11px] wght-560 text-[var(--color-apple-ink)] transition-colors hover:bg-white"
        >
          {expanded ? "접기" : "전체 보기"}
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            fill="none"
            aria-hidden
            className={expanded ? "rotate-180 transition-transform" : "transition-transform"}
          >
            <path
              d="M1.5 3l2.5 2.5L6.5 3"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--color-apple-pearl)]">
        <div
          className="h-full rounded-full bg-[var(--color-apple-action)] transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      {expanded && (
        <div className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-8">
          {quiz.questions.map((q, index) => {
            const graded = stepResults[q.id];
            const isCurrent = index === stepIndex;
            const isFlagged = Boolean(flagged[q.id]);
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => {
                  setExpanded(false);
                  onJump(index);
                }}
                className={[
                  "inline-flex aspect-square w-full items-center justify-center rounded-[8px] border text-[11.5px] wght-560 tabular-nums transition-colors",
                  graded
                    ? graded.correct
                      ? "border-[color:rgba(59,130,246,0.14)] bg-[color:rgba(59,130,246,0.10)] text-[var(--color-apple-action)]"
                      : "border-[color:rgba(255,59,48,0.20)] bg-[var(--color-urgent-soft)] text-[var(--color-urgent)]"
                    : "border-[var(--color-apple-hairline)] bg-white text-[var(--color-apple-muted)]",
                  isCurrent ? "ring-2 ring-[var(--color-apple-action)] ring-offset-1" : "",
                  isFlagged ? "ring-2 ring-[color:rgba(255,159,10,0.20)]" : "",
                ].join(" ")}
              >
                {index + 1}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MetaPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-apple-hairline)] bg-white/88 px-3 py-1.5 text-[12px] text-[var(--color-apple-muted)]">
      <span className="wght-450">{label}</span>
      <span className="wght-620 text-[var(--color-apple-ink)]">{value}</span>
    </span>
  );
}

function isAnswered(question: QuizSolveView["questions"][number], value?: string): boolean {
  if (!value) return false;
  if (question.kind === "multiple-choice")
    return value === "A" || value === "B" || value === "C" || value === "D";
  return value.trim().length > 0;
}

function getMaterialPath(quiz: QuizSolveView): string {
  if (!quiz.materialId) return "/dashboard/study";
  const slug = quiz.courseName ?? "자료";
  return `/dashboard/study/${encodeURIComponent(slug)}/${quiz.materialId}`;
}

function ResultSection({
  quiz,
  result,
  durationLabel,
}: {
  quiz: QuizSolveView;
  result: SubmitOk;
  durationLabel: string;
}) {
  const merged: ResultQuestion[] = quiz.questions.flatMap((question) => {
    const graded = result.results.find((item) => item.questionId === question.id);
    if (!graded) return [];
    return [
      {
        id: question.id,
        kind: graded.kind,
        topic: question.topic,
        stem: question.stem,
        choices: question.kind === "multiple-choice" ? question.choices : null,
        answer: graded.answer,
        submitted: graded.submitted,
        correct: graded.correct,
        explanation: graded.explanation,
        evidence: graded.evidence ?? "",
        evidencePage: graded.evidencePage ?? null,
        gradingNote: graded.gradingNote,
      },
    ];
  });

  return (
    <QuizResultView
      title={`점수 · ${quiz.title}`}
      score={result.score}
      total={result.total}
      questions={merged}
      watermark={result.watermark}
      materialId={quiz.materialId}
      courseName={quiz.courseName}
      quizId={quiz.id}
      durationLabel={durationLabel}
    />
  );
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분 ${s === 0 ? "" : `${s}초`}`.trim();
  return `${s}초`;
}
