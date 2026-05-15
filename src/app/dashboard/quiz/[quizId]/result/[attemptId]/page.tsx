import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { tryGetOwnerId } from "@/lib/auth";
import { getAttemptSummary } from "@/lib/data/attempts";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { QuizResultView, type ResultQuestion } from "../../quiz-result-view";

export const dynamic = "force-dynamic";

/**
 * 풀이 다시보기 — attempt 기록을 그대로 복원.
 *
 * 학습 루프의 "오답을 잊지 않게" 닫는 화면이다.
 * Today 카드·history·이메일·푸시 모두 이 URL로 들어와 한 번 더 보게 만든다.
 */
export default async function AttemptReviewPage({
  params,
}: {
  params: Promise<{ quizId: string; attemptId: string }>;
}) {
  const { quizId, attemptId } = await params;
  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  const summary = await getAttemptSummary({ ownerId, attemptId });
  if (!summary || summary.quizId !== quizId) notFound();

  // "자료로 돌아가기" 라우트 만들 때 강의명 슬러그 필요 — courseId만으론 부족.
  let courseName: string | null = null;
  if (summary.courseId) {
    const admin = getAdminSupabase();
    const { data: c } = await admin
      .from("courses")
      .select("name")
      .eq("id", summary.courseId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    courseName = c?.name ?? null;
  }

  const questions: ResultQuestion[] = summary.questions.map((q) => ({
    id: q.id,
    topic: q.topic,
    stem: q.stem,
    choices: q.choices,
    answer: q.answer,
    submitted: q.submitted,
    correct: q.correct,
    explanation: q.explanation,
    evidence: q.evidence,
    evidencePage: q.evidencePage,
  }));

  const ratio = summary.total > 0 ? Math.round((summary.score / summary.total) * 100) : 0;
  const wrongCount = summary.total - summary.score;
  const attemptedAt = new Date(summary.attemptedAt);

  return (
    <div>
      <div className="mx-auto w-full max-w-[760px] px-6 pb-32 pt-8 sm:px-10 sm:pb-40 sm:pt-12">
        <header className="mb-6 flex items-baseline justify-between gap-3 fade-up">
          <Link
            href="/dashboard/today"
            className="text-[12px] wght-450 text-[var(--color-apple-muted)] hover:text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            ← 오늘
          </Link>
          <p
            className="text-[11px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {formatDateTime(attemptedAt)} 풀었어요
          </p>
        </header>

        <div className="mb-6 fade-up">
          <h1
            className="text-[26px] wght-620 text-[var(--color-apple-ink)] sm:text-[32px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {summary.quizTitle}
          </h1>
          <p className="mt-2 text-[13px] wght-450 text-[var(--color-apple-muted)]">
            {summary.difficulty} · {summary.total}문제 · 정답률 {ratio}% · 오답 {wrongCount}문제
            {summary.durationMs ? ` · ${formatDuration(summary.durationMs)}` : ""}
          </p>
        </div>

        {summary.questions.length === 0 || questions.every((q) => q.submitted === null && !q.correct) ? (
          <LegacyAttemptNotice />
        ) : (
          <QuizResultView
            title={`다시보기 · ${summary.quizTitle}`}
            score={summary.score}
            total={summary.total}
            questions={questions}
            watermark={summary.watermark}
            materialId={summary.materialId}
            courseName={courseName}
            quizId={summary.quizId}
            showHero={false}
          />
        )}
      </div>
    </div>
  );
}

function LegacyAttemptNotice() {
  return (
    <section className="rounded-[14px] bg-white p-8 text-center fade-up">
      <p
        className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]"
      >
        다시보기를 보여줄 수 없어요
      </p>
      <p className="mt-3 text-[15px] leading-[1.55] wght-450 text-[var(--color-apple-ink)]">
        2026-05-13 이전 풀이는 채점 결과가 따로 저장되지 않아 복원할 수 없어요. 이 퀴즈를 다시
        풀면 다음부터는 다시보기와 오답 복습이 동작합니다.
      </p>
    </section>
  );
}

function formatDateTime(d: Date): string {
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}초`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return s === 0 ? `${m}분` : `${m}분 ${s}초`;
}
