"use client";

import Link from "next/link";
import { WizardWatermark } from "@/components/wizard-shell";

export interface ResultQuestion {
  id: number;
  topic: string;
  stem: string;
  choices: { key: "A" | "B" | "C" | "D"; text: string }[];
  answer: "A" | "B" | "C" | "D";
  submitted: "A" | "B" | "C" | "D" | null;
  correct: boolean;
  explanation: string;
  evidence: string;
  evidencePage: number | null;
}

export interface ResultViewProps {
  title: string;
  score: number;
  total: number;
  questions: ResultQuestion[];
  watermark: string;
  /** 자료가 연결된 퀴즈만 표시 — null이면 자료 버튼 숨김 */
  materialId: string | null;
  /** 오답만 다시 풀기 버튼 — quizId 있어야 활성화 */
  quizId: string;
  /** 화면에 들어왔을 때 스크롤 헤더 */
  showHero?: boolean;
}

/**
 * 풀이 결과 단일 진실 — solver의 채점 직후·다시보기 페이지가 공유.
 *
 * 디자인 결정: 결과 카드 자체가 "다음 액션"을 제안한다.
 *  - 오답이 있으면: "오답만 다시 풀기" CTA 강조
 *  - 모두 정답이면: "자료로 돌아가기" 또는 "새 문제 더 만들기"
 * 그래야 학습 루프가 끊기지 않는다.
 */
export function QuizResultView({
  title,
  score,
  total,
  questions,
  watermark,
  materialId,
  quizId,
  showHero = true,
}: ResultViewProps) {
  const wrongCount = questions.filter((q) => !q.correct).length;
  const ratio = total > 0 ? Math.round((score / total) * 100) : 0;

  return (
    <section className="flex flex-col gap-6 fade-up">
      {showHero && (
        <header className="rounded-[14px] bg-white p-8 text-center">
          <p className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
            {title}
          </p>
          <p
            className="mt-3 text-[64px] wght-620 tabular-nums leading-none text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.024em" }}
          >
            {score}
            <span className="text-[var(--color-apple-muted)]">/{total}</span>
          </p>
          <p className="mt-2 text-[14px] wght-450 text-[var(--color-apple-muted)]">
            정답률 {ratio}% · 오답 {wrongCount}문제
          </p>
        </header>
      )}

      <div className="flex flex-col gap-5">
        {questions.map((q, idx) => (
          <ResultCard key={q.id} q={q} idx={idx + 1} />
        ))}
      </div>

      <WizardWatermark modelText={watermark} />

      <div className="sticky bottom-4 flex flex-col gap-2 sm:flex-row">
        {wrongCount > 0 && (
          <Link
            href={`/dashboard/quiz/${quizId}/wrong`}
            className="inline-flex h-[44px] flex-1 items-center justify-center rounded-full bg-[var(--color-urgent)] px-6 text-[14px] wght-560 text-white transition-all hover:opacity-90"
          >
            오답 {wrongCount}문제만 다시 풀기
          </Link>
        )}
        {materialId && (
          <Link
            href={`/dashboard/study/${encodeURIComponent("자료")}/${materialId}`}
            className="inline-flex h-[44px] flex-1 items-center justify-center rounded-full bg-[var(--color-apple-action)] px-6 text-[14px] wght-560 text-white transition-all hover:bg-[var(--color-apple-action-hover)]"
          >
            자료로 돌아가기
          </Link>
        )}
        <Link
          href={`/dashboard/quiz/${quizId}`}
          className="inline-flex h-[44px] flex-1 items-center justify-center rounded-full bg-white px-6 text-[14px] wght-560 text-[var(--color-apple-ink)] transition-all hover:bg-[var(--color-apple-pearl)]"
        >
          처음부터 다시 풀기
        </Link>
      </div>
    </section>
  );
}

function ResultCard({ q, idx }: { q: ResultQuestion; idx: number }) {
  return (
    <article
      className={`rounded-[14px] bg-white p-6 ${
        q.correct ? "" : "ring-1 ring-[var(--color-urgent-soft)]"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
          {idx} · {q.topic}
        </p>
        <span
          className={`text-[12px] wght-620 ${
            q.correct ? "text-[var(--color-apple-success)]" : "text-[var(--color-urgent)]"
          }`}
        >
          {q.correct ? "정답" : q.submitted === null ? "미응답" : "오답"}
        </span>
      </div>
      <p className="mt-3 text-[15px] leading-[1.55] wght-560 text-[var(--color-apple-ink)]">
        {q.stem}
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {q.choices.map((c) => {
          const isAnswer = c.key === q.answer;
          const isSubmitted = c.key === q.submitted;
          const wrongPick = isSubmitted && !q.correct;
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
          {q.explanation}
        </p>
        {q.evidence && (
          <p className="mt-3 border-t border-[var(--color-apple-hairline)] pt-3 text-[12px] wght-450 italic leading-[1.5] text-[var(--color-apple-muted)]">
            자료 인용: &quot;{q.evidence}&quot;
            {q.evidencePage ? ` · ${q.evidencePage}쪽` : ""}
          </p>
        )}
      </div>
    </article>
  );
}
