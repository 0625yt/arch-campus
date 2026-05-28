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

  const answeredCount = useMemo(
    () => quiz.questions.filter((question) => isAnswered(question, answers[question.id])).length,
    [answers, quiz.questions],
  );
  const remaining = quiz.total - answeredCount;
  const nextIncomplete = quiz.questions.find(
    (question) => !isAnswered(question, answers[question.id]),
  );
  const flaggedCount = Object.values(flagged).filter(Boolean).length;

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

  function jumpToQuestion(questionId: number) {
    const node = questionRefs.current[questionId];
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <Header
        quiz={quiz}
        answeredCount={answeredCount}
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
          loading={loading}
          remaining={remaining}
          nextIncompleteId={nextIncomplete?.id ?? null}
          onSubmit={onSubmit}
          jumpToQuestion={jumpToQuestion}
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

function SolveSection({
  quiz,
  answers,
  setAnswers,
  shownHints,
  setShownHints,
  flagged,
  setFlagged,
  loading,
  remaining,
  nextIncompleteId,
  onSubmit,
  jumpToQuestion,
  questionRefs,
}: {
  quiz: QuizSolveView;
  answers: Record<number, string>;
  setAnswers: Dispatch<SetStateAction<Record<number, string>>>;
  shownHints: Record<number, boolean>;
  setShownHints: Dispatch<SetStateAction<Record<number, boolean>>>;
  flagged: Record<number, boolean>;
  setFlagged: Dispatch<SetStateAction<Record<number, boolean>>>;
  loading: boolean;
  remaining: number;
  nextIncompleteId: number | null;
  onSubmit: () => void;
  jumpToQuestion: (questionId: number) => void;
  questionRefs: MutableRefObject<Record<number, HTMLElement | null>>;
}) {
  const progress = quiz.total > 0 ? Math.round(((quiz.total - remaining) / quiz.total) * 100) : 0;

  return (
    <section className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="fade-up lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-[24px] border border-[var(--color-apple-hairline)] bg-white/92 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.06)] backdrop-blur-xl">
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
              ? "모든 문제를 다 풀었어요. 지금 제출하면 바로 취약 포인트를 볼 수 있어요."
              : `${remaining}문제만 더 풀면 바로 취약 포인트를 볼 수 있어요.`}
          </p>

          <div className="mt-5 h-2 overflow-hidden rounded-full bg-[var(--color-apple-pearl)]">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,rgba(59,130,246,0.88),rgba(34,197,94,0.78))]"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {quiz.questions.map((question, index) => {
              const answered = isAnswered(question, answers[question.id]);
              const isFlagged = Boolean(flagged[question.id]);
              return (
                <button
                  key={question.id}
                  type="button"
                  onClick={() => jumpToQuestion(question.id)}
                  className={[
                    "inline-flex h-9 w-9 items-center justify-center rounded-full border text-[12px] wght-560 transition-colors",
                    answered
                      ? "border-[color:rgba(59,130,246,0.14)] bg-[color:rgba(59,130,246,0.08)] text-[var(--color-apple-action)]"
                      : "border-[var(--color-apple-hairline)] bg-white text-[var(--color-apple-muted)] hover:border-[var(--color-apple-action)]/25 hover:text-[var(--color-apple-ink)]",
                    isFlagged ? "ring-2 ring-[color:rgba(255,159,10,0.20)]" : "",
                  ].join(" ")}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>

          <div className="mt-6 rounded-[18px] bg-[var(--color-apple-pearl)] p-4">
            <p className="text-[12px] wght-560 text-[var(--color-apple-ink)]">
              대학생 기준 추천 흐름
            </p>
            <ol className="mt-2 space-y-2 text-[12.5px] leading-[1.55] text-[var(--color-apple-muted)]">
              <li>1. 확실한 문제부터 먼저 체크</li>
              <li>2. 애매하면 헷갈림 표시로 남기기</li>
              <li>3. 제출 후 오답만 다시 바로 복습</li>
            </ol>
          </div>
        </div>
      </aside>

      <div className="flex flex-col gap-5">
        {quiz.questions.map((question, index) => (
          <article
            key={question.id}
            ref={(node) => {
              questionRefs.current[question.id] = node;
            }}
            className="fade-up rounded-[24px] border border-[var(--color-apple-hairline)] bg-white/96 p-5 shadow-[0_20px_70px_rgba(15,23,42,0.05)] backdrop-blur-xl sm:p-6"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
                  {index + 1} / {quiz.total} · {question.topic} · {question.difficulty}
                </p>
                <p className="mt-3 text-[16px] leading-[1.6] wght-560 text-[var(--color-apple-ink)] sm:text-[17px]">
                  {question.stem}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setFlagged((prev) => ({ ...prev, [question.id]: !prev[question.id] }))
                }
                className={[
                  "inline-flex h-[34px] items-center rounded-full px-3 text-[12.5px] wght-560 transition-colors",
                  flagged[question.id]
                    ? "bg-[color:rgba(255,159,10,0.14)] text-[color:rgb(180,83,9)]"
                    : "bg-[var(--color-apple-pearl)] text-[var(--color-apple-muted)] hover:text-[var(--color-apple-ink)]",
                ].join(" ")}
              >
                {flagged[question.id] ? "헷갈림 표시됨" : "헷갈리면 표시"}
              </button>
            </div>

            {question.kind === "multiple-choice" ? (
              <div className="mt-5 flex flex-col gap-2.5">
                {question.choices.map((choice) => {
                  const selected = answers[question.id] === choice.key;
                  return (
                    <label
                      key={choice.key}
                      className={[
                        "flex cursor-pointer items-start gap-3 rounded-[18px] border px-4 py-3.5 text-[14px] leading-[1.55] transition-all",
                        selected
                          ? "border-[color:rgba(59,130,246,0.14)] bg-[color:rgba(59,130,246,0.07)] shadow-[0_10px_30px_rgba(59,130,246,0.10)]"
                          : "border-[var(--color-apple-hairline)] bg-[color:rgba(255,255,255,0.72)] hover:border-[color:rgba(15,23,42,0.10)] hover:bg-[var(--color-apple-pearl)]",
                      ].join(" ")}
                    >
                      <input
                        type="radio"
                        name={`q-${question.id}`}
                        value={choice.key}
                        checked={selected}
                        onChange={() =>
                          setAnswers((prev) => ({ ...prev, [question.id]: choice.key }))
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
                {question.kind === "essay" ? (
                  <textarea
                    value={answers[question.id] ?? ""}
                    onChange={(e) =>
                      setAnswers((prev) => ({
                        ...prev,
                        [question.id]: e.target.value.slice(0, 4000),
                      }))
                    }
                    placeholder={question.placeholder}
                    className="min-h-[180px] w-full rounded-[20px] border border-[var(--color-apple-hairline)] bg-[color:rgba(255,255,255,0.78)] px-4 py-4 text-[14px] leading-[1.65] text-[var(--color-apple-ink)] outline-none transition-colors placeholder:text-[var(--color-apple-muted)]/55 focus:border-[var(--color-apple-action)]"
                    style={{ letterSpacing: "-0.012em" }}
                  />
                ) : (
                  <input
                    type="text"
                    value={answers[question.id] ?? ""}
                    onChange={(e) =>
                      setAnswers((prev) => ({
                        ...prev,
                        [question.id]: e.target.value.slice(0, 300),
                      }))
                    }
                    placeholder={question.placeholder}
                    className="h-[52px] w-full rounded-full border border-[var(--color-apple-hairline)] bg-[color:rgba(255,255,255,0.78)] px-5 text-[14px] text-[var(--color-apple-ink)] outline-none transition-colors placeholder:text-[var(--color-apple-muted)]/55 focus:border-[var(--color-apple-action)]"
                    style={{ letterSpacing: "-0.012em" }}
                  />
                )}

                <div className="mt-3 rounded-[16px] bg-[var(--color-apple-pearl)] px-4 py-3 text-[12.5px] leading-[1.55] text-[var(--color-apple-muted)]">
                  {question.kind === "essay"
                    ? "완벽한 문장보다 핵심 포인트를 직접 정리하는 게 중요해요. 제출 후 빠진 포인트를 바로 보여줍니다."
                    : "자료에 나온 핵심 용어 그대로 적는지 확인해 보세요. 띄어쓰기나 영문 표기도 같이 점검합니다."}
                </div>
              </div>
            )}

            {question.hint && (
              <div className="mt-4">
                {shownHints[question.id] ? (
                  <div className="rounded-[18px] bg-[color:rgba(59,130,246,0.08)] p-4 text-[13px] leading-[1.6] text-[var(--color-apple-ink)]">
                    <span className="mr-1.5 text-[11px] wght-620 uppercase tracking-[0.06em] text-[var(--color-apple-action)]">
                      힌트
                    </span>
                    {question.hint}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShownHints((prev) => ({ ...prev, [question.id]: true }))}
                    className="text-[13px] wght-560 text-[var(--color-apple-action)] hover:underline"
                  >
                    힌트 보기
                  </button>
                )}
              </div>
            )}
          </article>
        ))}

        <div className="sticky bottom-4 z-10 rounded-[24px] border border-[var(--color-apple-hairline)] bg-white/92 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="text-[14px] wght-560 text-[var(--color-apple-ink)]">
                {remaining === 0
                  ? "다 풀었어요. 지금 제출하면 오답만 바로 다시 풀 수 있어요."
                  : `${remaining}문제 남았어요. 남은 문제만 채우면 지금 바로 취약 포인트를 볼 수 있어요.`}
              </p>
              <p className="mt-1 text-[12.5px] text-[var(--color-apple-muted)]">
                자료 근거가 달린 풀이로 바로 이어집니다.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              {nextIncompleteId ? (
                <button
                  type="button"
                  onClick={() => jumpToQuestion(nextIncompleteId)}
                  className="inline-flex h-[46px] items-center justify-center rounded-full bg-[var(--color-apple-pearl)] px-5 text-[13.5px] wght-560 text-[var(--color-apple-ink)] transition-colors hover:bg-white"
                >
                  다음 미완료로 이동
                </button>
              ) : null}
              {quiz.materialId && (
                <Link
                  href={getMaterialPath(quiz)}
                  className="inline-flex h-[46px] items-center justify-center rounded-full bg-white px-5 text-[13.5px] wght-560 text-[var(--color-apple-ink)] transition-colors hover:bg-[var(--color-apple-pearl)]"
                >
                  자료로
                </Link>
              )}
              <button
                onClick={onSubmit}
                type="button"
                disabled={loading || remaining > 0}
                className="inline-flex h-[46px] items-center justify-center rounded-full bg-[var(--color-apple-action)] px-6 text-[14px] wght-560 text-white transition-all duration-150 hover:bg-[var(--color-apple-action-hover)] disabled:opacity-50"
              >
                {loading
                  ? "채점 중…"
                  : remaining > 0
                    ? `${remaining}문제 남음`
                    : "제출하고 취약 포인트 보기"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
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
