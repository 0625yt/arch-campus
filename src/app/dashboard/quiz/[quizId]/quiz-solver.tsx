"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { QuizSolveView } from "@/lib/data/quizzes";
import { QuizResultView, type ResultQuestion } from "./quiz-result-view";

type Choice = "A" | "B" | "C" | "D";

interface SubmitResult {
  questionId: number;
  correct: boolean;
  answer: Choice;
  submitted: Choice | null;
  explanation: string;
  evidence?: string;
  evidencePage?: number | null;
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

/**
 * 퀴즈 풀이 + 결과 — dev/quiz 페이지에서 분리한 본 풀이 로직.
 * 서버에서 정답·해설은 내려오지 않음. 제출 후에만 채점 결과로 받음.
 */
export function QuizSolver({ quiz }: { quiz: QuizSolveView }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"solve" | "result">("solve");
  const [answers, setAnswers] = useState<Record<number, Choice>>({});
  const [shownHints, setShownHints] = useState<Record<number, boolean>>({});
  const [result, setResult] = useState<SubmitOk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [startedAt] = useState<number>(() => Date.now());

  // ESC로 detail 페이지 복귀
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && quiz.materialId) {
        router.push(getMaterialPath(quiz));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quiz, router]);

  async function onSubmit() {
    setLoading(true);
    setError(null);
    try {
      const body = {
        answers: quiz.questions.map((q) => ({
          questionId: q.id,
          choice: answers[q.id] ?? "A",
        })),
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
      <Header quiz={quiz} />

      {error && (
        <div className="mb-4 rounded-[12px] bg-[var(--color-urgent-soft)] px-4 py-3 text-[13px] wght-560 text-[var(--color-urgent)]">
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
          loading={loading}
          onSubmit={onSubmit}
        />
      )}

      {phase === "result" && result && <ResultSection quiz={quiz} result={result} />}
    </>
  );
}

function Header({ quiz }: { quiz: QuizSolveView }) {
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
    </header>
  );
}

function SolveSection({
  quiz,
  answers,
  setAnswers,
  shownHints,
  setShownHints,
  loading,
  onSubmit,
}: {
  quiz: QuizSolveView;
  answers: Record<number, Choice>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<number, Choice>>>;
  shownHints: Record<number, boolean>;
  setShownHints: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  loading: boolean;
  onSubmit: () => void;
}) {
  const remaining = quiz.total - Object.keys(answers).length;

  return (
    <section className="flex flex-col gap-6">
      {quiz.questions.map((q, idx) => (
        <article key={q.id} className="rounded-[14px] bg-white p-6 fade-up">
          <p className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
            {idx + 1} / {quiz.total} · {q.topic} · {q.difficulty}
          </p>
          <p className="mt-3 text-[16px] leading-[1.55] wght-560 text-[var(--color-apple-ink)]">
            {q.stem}
          </p>
          <div className="mt-5 flex flex-col gap-2">
            {q.choices.map((c) => {
              const selected = answers[q.id] === c.key;
              return (
                <label
                  key={c.key}
                  className={`flex cursor-pointer items-start gap-3 rounded-[10px] border px-4 py-3 text-[14px] leading-[1.5] transition-colors ${
                    selected
                      ? "border-[var(--color-apple-action)] bg-[var(--color-apple-action-soft)]"
                      : "border-transparent bg-[var(--color-apple-pearl)] hover:border-[var(--color-apple-hairline)]"
                  }`}
                >
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    value={c.key}
                    checked={selected}
                    onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: c.key }))}
                    className="mt-1"
                  />
                  <span className="wght-560">{c.key}.</span>
                  <span className="flex-1">{c.text}</span>
                </label>
              );
            })}
          </div>
          {q.hint && (
            <div className="mt-4">
              {shownHints[q.id] ? (
                <div className="rounded-[10px] bg-[var(--color-apple-action-soft)] p-3 text-[13px] leading-[1.5] text-[var(--color-apple-ink)]">
                  <span className="mr-1.5 text-[11px] wght-620 uppercase tracking-[0.06em] text-[var(--color-apple-action)]">
                    힌트
                  </span>
                  {q.hint}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShownHints((prev) => ({ ...prev, [q.id]: true }))}
                  className="text-[13px] wght-560 text-[var(--color-apple-action)] hover:underline"
                >
                  힌트 보기
                </button>
              )}
            </div>
          )}
        </article>
      ))}

      <div className="sticky bottom-4 flex gap-3">
        {quiz.materialId && (
          <Link
            href={getMaterialPath(quiz)}
            className="inline-flex h-[44px] flex-1 items-center justify-center rounded-full bg-white px-6 text-[14px] wght-560 text-[var(--color-apple-ink)]"
          >
            자료로
          </Link>
        )}
        <button
          onClick={onSubmit}
          type="button"
          disabled={loading || remaining > 0}
          className="inline-flex h-[44px] flex-[2] items-center justify-center rounded-full bg-[var(--color-apple-action)] px-6 text-[15px] wght-560 text-white transition-all duration-150 hover:bg-[var(--color-apple-action-hover)] disabled:opacity-50"
        >
          {loading ? "채점 중…" : remaining > 0 ? `${remaining}문제 남음` : "제출하기"}
        </button>
      </div>
    </section>
  );
}

function getMaterialPath(quiz: QuizSolveView): string {
  if (!quiz.materialId) return "/dashboard/study";
  return `/dashboard/study/${encodeURIComponent("자료")}/${quiz.materialId}`;
}

function ResultSection({ quiz, result }: { quiz: QuizSolveView; result: SubmitOk }) {
  const merged: ResultQuestion[] = quiz.questions.flatMap((q) => {
    const r = result.results.find((x) => x.questionId === q.id);
    if (!r) return [];
    return [{
      id: q.id,
      topic: q.topic,
      stem: q.stem,
      choices: q.choices,
      answer: r.answer,
      submitted: r.submitted,
      correct: r.correct,
      explanation: r.explanation,
      evidence: r.evidence ?? "",
      evidencePage: r.evidencePage ?? null,
    }];
  });
  return (
    <QuizResultView
      title={`점수 · ${quiz.title}`}
      score={result.score}
      total={result.total}
      questions={merged}
      watermark={result.watermark}
      materialId={quiz.materialId}
      quizId={quiz.id}
    />
  );
}
