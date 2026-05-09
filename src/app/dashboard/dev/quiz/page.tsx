"use client";

import { useState } from "react";

type Choice = "A" | "B" | "C" | "D";

interface QuizQuestion {
  id: number;
  difficulty: string;
  topic: string;
  stem: string;
  choices: { key: Choice; text: string }[];
  hint?: string;
}

interface QuizGenOk {
  ok: true;
  quizId: string;
  materialId: string;
  parser: string;
  pageCount?: number;
  questions: QuizQuestion[];
  total: number;
  watermark: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    costUsd: number;
    tokenBudget: { rule: number; dynamic: number; user: number; total: number; cacheableShare: number };
  };
}

interface SubmitResult {
  questionId: number;
  correct: boolean;
  answer: Choice;
  submitted: Choice;
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

type ApiErr = { ok: false; error: string; reason?: string };

export default function DevQuizPage() {
  const [phase, setPhase] = useState<"upload" | "solve" | "result">("upload");
  const [quiz, setQuiz] = useState<QuizGenOk | null>(null);
  const [answers, setAnswers] = useState<Record<number, Choice>>({});
  const [shownHints, setShownHints] = useState<Record<number, boolean>>({});
  const [result, setResult] = useState<SubmitOk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [startedAt, setStartedAt] = useState<number>(0);

  // upload 단계
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"lecture" | "assignment" | "exam" | "syllabus" | "notice" | "team">("lecture");
  const [difficulty, setDifficulty] = useState<"쉬움" | "보통" | "어려움">("보통");
  const [count, setCount] = useState(5);

  async function onGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (title) form.append("title", title);
      form.append("type", type);
      form.append("difficulty", difficulty);
      form.append("count", String(count));
      const res = await fetch("/api/quiz", { method: "POST", body: form });
      const json = (await res.json()) as QuizGenOk | ApiErr;
      if (!json.ok) {
        setError(json.error + (json.reason ? ` (${json.reason})` : ""));
      } else {
        setQuiz(json);
        setAnswers({});
        setStartedAt(Date.now());
        setPhase("solve");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit() {
    if (!quiz) return;
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
      const res = await fetch(`/api/quiz/${quiz.quizId}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as SubmitOk | ApiErr;
      if (!json.ok) {
        setError(json.error);
      } else {
        setResult(json);
        setPhase("result");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setPhase("upload");
    setQuiz(null);
    setAnswers({});
    setShownHints({});
    setResult(null);
    setError(null);
    setFile(null);
    setTitle("");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8">
        <p className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">DEV</p>
        <h1
          className="mt-2 text-[28px] wght-620 text-[var(--color-apple-ink)] sm:text-[36px]"
          style={{ letterSpacing: "-0.024em" }}
        >
          /api/quiz 검증
        </h1>
        <p className="mt-3 text-[14px] leading-[1.6] text-[var(--color-apple-muted)]">
          파일 → 문제 생성 → 풀이 → 채점·해설. 한 페이지에서 끝까지.
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-[12px] bg-[var(--color-urgent-soft)] px-4 py-3 text-[13px] wght-560 text-[var(--color-urgent)]">
          {error}
        </div>
      )}

      {phase === "upload" && (
        <form onSubmit={onGenerate} className="flex flex-col gap-4 rounded-[14px] bg-white p-6">
          <label className="flex flex-col gap-2 text-[13px] wght-560 text-[var(--color-apple-ink)]">
            파일
            <input
              type="file"
              accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp,.hwp,.hwpx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-[13px] wght-450 file:mr-3 file:rounded-full file:border-0 file:bg-[var(--color-apple-pearl)] file:px-4 file:py-2 file:text-[12px] file:wght-560 file:text-[var(--color-apple-ink)]"
              required
            />
            {file && (
              <span className="text-[11px] wght-450 tabular-nums text-[var(--color-apple-muted)]">
                {file.name} · {(file.size / 1024).toFixed(1)} KB
              </span>
            )}
          </label>

          <label className="flex flex-col gap-2 text-[13px] wght-560 text-[var(--color-apple-ink)]">
            제목 (선택)
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-[8px] bg-[var(--color-apple-pearl)] px-3 py-2 text-[14px] wght-450"
            />
          </label>

          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col gap-2 text-[13px] wght-560 text-[var(--color-apple-ink)]">
              종류
              <select
                value={type}
                onChange={(e) => setType(e.target.value as typeof type)}
                className="rounded-[8px] bg-[var(--color-apple-pearl)] px-3 py-2 text-[14px] wght-450"
              >
                <option value="lecture">강의</option>
                <option value="assignment">과제</option>
                <option value="exam">시험</option>
                <option value="syllabus">강의계획서</option>
                <option value="notice">공지</option>
                <option value="team">팀플</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 text-[13px] wght-560 text-[var(--color-apple-ink)]">
              난이도
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
                className="rounded-[8px] bg-[var(--color-apple-pearl)] px-3 py-2 text-[14px] wght-450"
              >
                <option>쉬움</option>
                <option>보통</option>
                <option>어려움</option>
              </select>
            </label>
            <label className="flex flex-col gap-2 text-[13px] wght-560 text-[var(--color-apple-ink)]">
              문제 개수
              <input
                type="number"
                min={1}
                max={10}
                value={count}
                onChange={(e) => setCount(Number.parseInt(e.target.value, 10) || 5)}
                className="rounded-[8px] bg-[var(--color-apple-pearl)] px-3 py-2 text-[14px] wght-450 tabular-nums"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={loading || !file}
            className="mt-2 inline-flex h-[44px] items-center justify-center rounded-full bg-[var(--color-apple-action)] px-6 text-[15px] wght-560 text-white transition-all duration-150 hover:bg-[var(--color-apple-action-hover)] disabled:opacity-50"
          >
            {loading ? "문제 만드는 중…" : "문제 만들기"}
          </button>
        </form>
      )}

      {phase === "solve" && quiz && (
        <section className="flex flex-col gap-6">
          <div className="rounded-[14px] bg-white p-6">
            <p className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
              {quiz.total}문제 · {quiz.parser}
              {quiz.pageCount ? ` · ${quiz.pageCount}쪽` : ""} · ${quiz.usage.costUsd.toFixed(4)}
            </p>
          </div>

          {quiz.questions.map((q, idx) => (
            <article key={q.id} className="rounded-[14px] bg-white p-6">
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
            <button
              onClick={reset}
              type="button"
              className="inline-flex h-[44px] flex-1 items-center justify-center rounded-full bg-white px-6 text-[14px] wght-560 text-[var(--color-apple-ink)]"
            >
              처음부터
            </button>
            <button
              onClick={onSubmit}
              type="button"
              disabled={loading || Object.keys(answers).length < quiz.total}
              className="inline-flex h-[44px] flex-[2] items-center justify-center rounded-full bg-[var(--color-apple-action)] px-6 text-[15px] wght-560 text-white transition-all duration-150 hover:bg-[var(--color-apple-action-hover)] disabled:opacity-50"
            >
              {loading
                ? "채점 중…"
                : Object.keys(answers).length < quiz.total
                  ? `${quiz.total - Object.keys(answers).length}문제 남음`
                  : "제출하기"}
            </button>
          </div>
        </section>
      )}

      {phase === "result" && quiz && result && (
        <section className="flex flex-col gap-6">
          <div className="rounded-[14px] bg-white p-8 text-center">
            <p className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
              점수
            </p>
            <p
              className="mt-3 text-[64px] wght-620 tabular-nums leading-none text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "-0.024em" }}
            >
              {result.score}
              <span className="text-[var(--color-apple-muted)]">/{result.total}</span>
            </p>
            <p className="mt-2 text-[14px] wght-450 text-[var(--color-apple-muted)]">
              정답률 {Math.round((result.score / result.total) * 100)}%
            </p>
          </div>

          {quiz.questions.map((q, idx) => {
            const r = result.results.find((x) => x.questionId === q.id);
            if (!r) return null;
            return (
              <article
                key={q.id}
                className={`rounded-[14px] bg-white p-6 ${
                  r.correct ? "" : "ring-1 ring-[var(--color-urgent-soft)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
                    {idx + 1} · {q.topic}
                  </p>
                  <span
                    className={`text-[12px] wght-620 ${
                      r.correct ? "text-[var(--color-apple-success)]" : "text-[var(--color-urgent)]"
                    }`}
                  >
                    {r.correct ? "정답" : "오답"}
                  </span>
                </div>
                <p className="mt-3 text-[15px] leading-[1.55] wght-560 text-[var(--color-apple-ink)]">
                  {q.stem}
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  {q.choices.map((c) => {
                    const isAnswer = c.key === r.answer;
                    const isSubmitted = c.key === r.submitted;
                    const wrongPick = isSubmitted && !r.correct;
                    return (
                      <div
                        key={c.key}
                        className={`flex items-start gap-3 rounded-[10px] px-4 py-3 text-[14px] leading-[1.5] ${
                          isAnswer
                            ? "bg-[color:rgba(52,199,89,0.12)] text-[var(--color-apple-ink)]"
                            : wrongPick
                              ? "bg-[var(--color-urgent-soft)] text-[var(--color-urgent)]"
                              : "bg-[var(--color-apple-pearl)] text-[var(--color-apple-muted)]"
                        }`}
                      >
                        <span className="wght-620">{c.key}.</span>
                        <span className="flex-1">{c.text}</span>
                        {isAnswer && (
                          <span className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-success)]">
                            정답
                          </span>
                        )}
                        {wrongPick && (
                          <span className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-urgent)]">
                            내 답
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 rounded-[10px] bg-[var(--color-apple-pearl)] p-4">
                  <p className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
                    풀이
                  </p>
                  <p className="mt-2 text-[13px] leading-[1.6] text-[var(--color-apple-ink)]">
                    {r.explanation}
                  </p>
                  {r.evidence && (
                    <p className="mt-3 border-t border-[var(--color-apple-hairline)] pt-3 text-[12px] wght-450 italic leading-[1.5] text-[var(--color-apple-muted)]">
                      자료 인용: "{r.evidence}"
                      {r.evidencePage ? ` · ${r.evidencePage}쪽` : ""}
                    </p>
                  )}
                </div>
              </article>
            );
          })}

          <p className="text-[11px] wght-450 italic text-[var(--color-apple-muted)]">{result.watermark}</p>

          <div className="flex gap-3">
            <button
              onClick={reset}
              type="button"
              className="inline-flex h-[44px] flex-1 items-center justify-center rounded-full bg-[var(--color-apple-action)] px-6 text-[15px] wght-560 text-white transition-all duration-150 hover:bg-[var(--color-apple-action-hover)]"
            >
              새 문제 만들기
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
