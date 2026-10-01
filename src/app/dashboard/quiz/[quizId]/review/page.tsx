import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppleEmptyState } from "@/components/apple-empty";
import { AppleShell } from "@/components/apple-shell";
import { tryGetOwnerId } from "@/lib/auth";
import { getQuizForSolving } from "@/lib/data/quizzes";
import { listDueQuestionIds } from "@/lib/data/reviews";
import { QuizSolver } from "../quiz-solver";

export const dynamic = "force-dynamic";

export default async function QuizReviewPage({ params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  const dueIds = await listDueQuestionIds({ ownerId, quizId });
  if (dueIds.length === 0) {
    const quiz = await getQuizForSolving({ ownerId, quizId });
    if (!quiz) notFound();
    return (
      <AppleShell pb="tall">
        <div className="mt-12">
          <AppleEmptyState
            eyebrow="복습 완료"
            eyebrowColor="var(--color-apple-success)"
            title="이 묶음은 오늘 다 봤어요"
            sub="답을 떠올린 난이도에 맞춰 다음 복습일에 다시 보여드릴게요."
            ctaPrimary={{ href: "/dashboard/review", label: "복습 목록으로 →", tone: "primary" }}
          />
        </div>
      </AppleShell>
    );
  }
  const quiz = await getQuizForSolving({ ownerId, quizId, onlyQuestionIds: dueIds });
  if (!quiz || quiz.questions.length === 0) notFound();

  return (
    <AppleShell pb="tall">
      <header className="mb-6 flex items-baseline justify-between gap-3 fade-up">
        <Link
          href="/dashboard/review"
          className="text-[12px] text-[var(--color-apple-muted)] hover:text-[var(--color-apple-ink)]"
        >
          ← 오늘의 복습
        </Link>
        <span className="text-[11px] wght-620 uppercase tracking-[0.06em] text-[var(--color-apple-action)]">
          지금 {quiz.questions.length}문제
        </span>
      </header>
      <QuizSolver quiz={quiz} />
    </AppleShell>
  );
}
