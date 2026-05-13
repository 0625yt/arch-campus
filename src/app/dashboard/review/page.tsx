import Link from "next/link";
import { redirect } from "next/navigation";
import { tryGetOwnerId } from "@/lib/auth";
import { listWrongItems, type WrongItem } from "@/lib/data/attempts";

export const dynamic = "force-dynamic";

/**
 * 오답 복습 큐 — 누적된 오답을 퀴즈 단위로 묶어 복습 동선을 단일 화면에 모은다.
 *
 * 학습 루프(PRODUCT.md 기능 1)의 "오답 누적" 단계.
 * Today 카드·사이드바·시험 직전 모두 이 페이지로 들어와 다시 풀게 만든다.
 *
 * 정책:
 *   - 14일 vs 60일 두 탭은 다음 회차. 우선 60일(학기 기준)로 시작.
 *   - 같은 퀴즈에서 같은 문제를 여러 번 틀렸어도 그룹 카드에선 오답 수만 표시.
 *   - 각 카드 CTA는 "이 퀴즈 오답 N개 다시 풀기" → /dashboard/quiz/{id}/wrong
 */
export default async function ReviewPage() {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  const items = await listWrongItems({ ownerId, sinceDays: 60, limit: 200 });
  const groups = groupByQuiz(items);
  const totalWrong = items.length;
  const uniqueQuestions = new Set(items.map((i) => `${i.quizId}:${i.questionId}`)).size;

  return (
    <div>
      <div className="mx-auto w-full max-w-[1080px] px-6 pb-24 pt-8 sm:px-10 sm:pb-28 sm:pt-12 md:px-12">
        <header className="fade-up flex items-baseline justify-between gap-3">
          <p
            className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            복습
          </p>
          <Link
            href="/dashboard/today"
            className="text-[12px] wght-450 text-[var(--color-apple-action)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            오늘 ›
          </Link>
        </header>

        <header className="mt-10 fade-up fade-up-1 sm:mt-14">
          <h1
            className="text-[34px] leading-[1.07] wght-620 text-[var(--color-apple-ink)] sm:text-[48px] md:text-[56px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            오답 <span className="text-[var(--color-apple-muted)]">복습.</span>
          </h1>
          <p
            className="mt-4 text-[15px] leading-[1.55] wght-450 text-[var(--color-apple-muted)] sm:text-[17px]"
            style={{ letterSpacing: "-0.022em" }}
          >
            최근 60일 동안 틀린 {uniqueQuestions}문제. 자주 틀린 자료부터 다시 풀어보세요.
          </p>
        </header>

        {groups.length === 0 ? (
          <EmptyState />
        ) : (
          <section className="mt-12 grid grid-cols-1 gap-4 fade-up fade-up-2 sm:mt-16 sm:grid-cols-2">
            {groups.map((g) => (
              <ReviewCard key={g.quizId} group={g} />
            ))}
          </section>
        )}

        {totalWrong > 0 && (
          <footer
            className="mt-14 text-[11.5px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            오답 풀이도 학습 보조이며, 본인이 다시 풀고 검토해야 학습이 완성돼요.
          </footer>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <section className="elev-1 mt-16 rounded-[18px] bg-white p-12 text-center fade-up fade-up-2">
      <p
        className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-success)]"
      >
        지금 복습할 오답이 없어요
      </p>
      <p className="mt-4 text-[16px] leading-[1.55] wght-450 text-[var(--color-apple-ink)]">
        퀴즈를 풀고 틀린 문제가 생기면 이 화면에서 모아 다시 풀 수 있어요.
      </p>
      <Link
        href="/dashboard/study"
        className="mt-7 inline-flex h-[44px] items-center rounded-full bg-[var(--color-apple-ink)] px-6 text-[14px] wght-560 text-white hover:opacity-90"
      >
        자료에서 문제 만들기 →
      </Link>
    </section>
  );
}

interface QuizGroup {
  quizId: string;
  quizTitle: string;
  materialId: string | null;
  wrongCount: number;
  uniqueQuestionCount: number;
  lastAttemptedAt: string;
  topicSamples: string[];
}

function groupByQuiz(items: WrongItem[]): QuizGroup[] {
  const map = new Map<string, QuizGroup & { questionIds: Set<number>; topics: Set<string> }>();
  for (const it of items) {
    const cur = map.get(it.quizId);
    if (cur) {
      cur.wrongCount++;
      cur.questionIds.add(it.questionId);
      if (it.attemptedAt > cur.lastAttemptedAt) cur.lastAttemptedAt = it.attemptedAt;
    } else {
      map.set(it.quizId, {
        quizId: it.quizId,
        quizTitle: it.quizTitle,
        materialId: it.materialId,
        wrongCount: 1,
        uniqueQuestionCount: 0,
        lastAttemptedAt: it.attemptedAt,
        topicSamples: [],
        questionIds: new Set([it.questionId]),
        topics: new Set(),
      });
    }
  }
  return Array.from(map.values())
    .map((g) => ({
      ...g,
      uniqueQuestionCount: g.questionIds.size,
    }))
    .sort((a, b) => b.uniqueQuestionCount - a.uniqueQuestionCount);
}

function ReviewCard({ group }: { group: QuizGroup }) {
  const days = daysSince(group.lastAttemptedAt);
  return (
    <article className="elev-hover-2 rounded-[18px] bg-white p-6">
      <div className="flex items-baseline justify-between gap-3">
        <p
          className="text-[11.5px] wght-560 uppercase tracking-[0.06em] text-[var(--color-urgent)]"
        >
          오답 {group.uniqueQuestionCount}문제
        </p>
        <p className="text-[11px] wght-450 tabular-nums text-[var(--color-apple-muted)]">
          {days === 0 ? "오늘" : `${days}일 전`}
        </p>
      </div>
      <h2
        className="mt-3 text-[17px] leading-[1.35] wght-620 text-[var(--color-apple-ink)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {group.quizTitle}
      </h2>
      <div className="mt-6 flex gap-2">
        <Link
          href={`/dashboard/quiz/${group.quizId}/wrong`}
          className="inline-flex h-[40px] flex-1 items-center justify-center rounded-full bg-[var(--color-urgent)] px-4 text-[13px] wght-560 text-white transition-all hover:opacity-90"
        >
          오답 다시 풀기
        </Link>
        {group.materialId && (
          <Link
            href={`/dashboard/study/${encodeURIComponent("자료")}/${group.materialId}`}
            className="inline-flex h-[40px] items-center justify-center rounded-full border border-[var(--color-apple-hairline)] px-4 text-[12px] wght-450 text-[var(--color-apple-muted)] transition-all hover:border-[var(--color-apple-ink)] hover:text-[var(--color-apple-ink)]"
          >
            자료
          </Link>
        )}
      </div>
    </article>
  );
}

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}
