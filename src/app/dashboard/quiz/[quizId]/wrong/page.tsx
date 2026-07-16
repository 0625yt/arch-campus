import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppleShell } from "@/components/apple-shell";
import { tryGetOwnerId } from "@/lib/auth";
import { listWrongItems } from "@/lib/data/attempts";
import { getQuizForSolving } from "@/lib/data/quizzes";
import { QuizSolver } from "../quiz-solver";

export const dynamic = "force-dynamic";

/**
 * 한 퀴즈의 오답만 다시 풀기.
 *
 * 정책:
 *  - sinceDays=60 — 학기 단위. 너무 짧으면 시험 전 복습이 빈약, 너무 길면 무관.
 *  - 같은 문제를 여러 번 틀렸으면 한 번만 노출 (Set 기준)
 *  - quiz가 통째로 사라졌으면 404 (cascade로 attempt도 사라졌을 것)
 *  - 오답이 0건이면 친절한 빈 상태 (자료로 돌아가기 CTA)
 */
export default async function QuizWrongOnlyPage({
  params,
}: {
  params: Promise<{ quizId: string }>;
}) {
  const { quizId } = await params;
  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  const wrongItems = await listWrongItems({ ownerId, sinceDays: 60, limit: 200 });
  const wrongIds = Array.from(
    new Set(wrongItems.filter((w) => w.quizId === quizId).map((w) => w.questionId)),
  );

  if (wrongIds.length === 0) {
    // quiz가 본인 것인지만 확인
    const exists = await getQuizForSolving({ ownerId, quizId });
    if (!exists) notFound();
    return (
      <div>
        <AppleShell pb="tall">
          <EmptyWrong
            quizId={quizId}
            quizTitle={exists.title}
            materialId={exists.materialId}
            courseName={exists.courseName}
          />
        </AppleShell>
      </div>
    );
  }

  const quiz = await getQuizForSolving({ ownerId, quizId, onlyQuestionIds: wrongIds });
  if (!quiz || quiz.questions.length === 0) notFound();

  return (
    <div>
      <AppleShell pb="tall">
        <header className="mb-6 flex items-baseline justify-between gap-3 fade-up">
          <Link
            href="/dashboard/review"
            className="text-[12px] wght-450 text-[var(--color-apple-muted)] hover:text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            ← 오답 복습
          </Link>
          <span className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-urgent)]">
            오답만 {quiz.questions.length}문제
          </span>
        </header>
        <QuizSolver quiz={quiz} />
      </AppleShell>
    </div>
  );
}

function EmptyWrong({
  quizId,
  quizTitle,
  materialId,
  courseName,
}: {
  quizId: string;
  quizTitle: string;
  materialId: string | null;
  courseName: string | null;
}) {
  return (
    <section className="rounded-[18px] bg-white p-10 text-center fade-up">
      <p className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-success)]">
        오답 없음
      </p>
      <h1
        className="mt-4 text-[24px] wght-620 text-[var(--color-apple-ink)] sm:text-[28px]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {quizTitle} — 최근 60일 안에 틀린 문제 없음
      </h1>
      <p className="mt-3 text-[14px] wght-450 text-[var(--color-apple-muted)]">
        이 퀴즈를 한 번 더 풀거나 자료로 돌아가기.
      </p>
      <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        {/* 카피에 "한 번 더 풀거나"라 써있는데 버튼이 없던 누락 — 다시 풀기 CTA를 1급으로. */}
        <Link
          href={`/dashboard/quiz/${quizId}`}
          className="inline-flex h-[44px] items-center justify-center rounded-full bg-[var(--color-apple-ink)] px-6 text-[14px] wght-560 text-white hover:opacity-90"
        >
          이 퀴즈 다시 풀기
        </Link>
        {materialId && (
          <Link
            href={
              courseName
                ? `/dashboard/study/${encodeURIComponent(courseName)}/${materialId}`
                : "/dashboard/study"
            }
            className="inline-flex h-[44px] items-center justify-center rounded-full bg-[var(--color-apple-pearl)] px-6 text-[14px] wght-560 text-[var(--color-apple-ink)] hover:bg-[var(--color-apple-hairline)]"
          >
            자료로 돌아가기
          </Link>
        )}
      </div>
    </section>
  );
}
