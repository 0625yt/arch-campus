import Link from "next/link";
import { redirect } from "next/navigation";
import { AppleEmptyState } from "@/components/apple-empty";
import { AppleShell } from "@/components/apple-shell";
import { tryGetOwnerId } from "@/lib/auth";
import { listGeneratedQuizzes, type QuizListItem } from "@/lib/data/quizzes";

export const dynamic = "force-dynamic";

/**
 * "내 문제" — 사용자가 만든 모든 퀴즈 인덱스.
 *
 * 결함이 있었던 동선: 자료 detail에서 퀴즈를 만든 직후 페이지를 떠나면
 * 그 퀴즈를 다시 찾아갈 길이 없었다 (오답 페이지·today 카드는 attempt가 있어야 떴음).
 * 이 인덱스는 만든 적 있는 모든 퀴즈를 시간역순으로 노출해 "어디 있지?" 질문을 끊는다.
 *
 * 톤 — review/today 페이지와 동일. 빈 상태에선 자료 업로드로 유도.
 */
export default async function QuizIndexPage() {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  const quizzes = await listGeneratedQuizzes({ ownerId, limit: 50 });

  return (
    <div>
      <AppleShell>
        <header className="fade-up flex items-baseline justify-between gap-3">
          <p
            className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            내 문제
          </p>
          <Link
            href="/dashboard/review"
            className="text-[12px] wght-450 text-[var(--color-apple-action)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            오답 복습 ›
          </Link>
        </header>

        <header className="mt-6 fade-up fade-up-1 sm:mt-8">
          <h1
            className="text-[28px] leading-[1.08] wght-700 text-[var(--color-apple-ink)] sm:text-[36px] md:text-[42px]"
            style={{ letterSpacing: "-0.022em" }}
          >
            내 문제 <span className="text-[var(--color-apple-muted)]">전부</span>
          </h1>
          <p
            className="mt-3 text-[13.5px] leading-[1.55] wght-450 text-[var(--color-apple-muted)] sm:text-[14.5px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {quizzes.length > 0
              ? `만든 문제 ${quizzes.length}세트 · 안 풀어본 세트부터`
              : "자료 올리면 바로 첫 문제 생성"}
          </p>
        </header>

        {quizzes.length === 0 ? (
          <EmptyState />
        ) : (
          <section className="mt-6 fade-up fade-up-2 sm:mt-8">
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {quizzes.map((q) => (
                <QuizCard key={q.id} quiz={q} />
              ))}
            </ul>
          </section>
        )}
      </AppleShell>
    </div>
  );
}

function QuizCard({ quiz }: { quiz: QuizListItem }) {
  const dotColor = quiz.courseColor ?? "var(--color-apple-action)";
  // 풀이 화면 직진. 이미 풀었다면 결과를 보고 싶을 수도 있지만 인덱스의 1차 의도는 "다시 풀기".
  // result 페이지는 today 카드에서 진입.
  const href = `/dashboard/quiz/${quiz.id}`;

  return (
    <li>
      <Link
        href={href}
        className="card-glow-ribbon elev-1 spring-press group relative block overflow-hidden rounded-[14px] bg-white px-4 py-3.5 transition-shadow hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
        style={{ ["--ribbon-color" as string]: dotColor }}
      >
        <div className="flex items-baseline justify-between gap-3">
          <p
            className="text-[10.5px] wght-700 uppercase tracking-[0.06em]"
            style={{ color: dotColor }}
          >
            {quiz.courseName ?? "자료"}
          </p>
          <span
            className="shrink-0 text-[10.5px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {formatRelative(quiz.createdAt)}
          </span>
        </div>
        <p
          className="mt-2 line-clamp-2 text-[14px] leading-[1.3] wght-620 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {quiz.title}
        </p>
        <div
          className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          <span className="tabular-nums">{quiz.questionCount}문제</span>
          <span className="text-[var(--color-apple-hairline)]">·</span>
          <span>{quiz.difficulty}</span>
          <span className="text-[var(--color-apple-hairline)]">·</span>
          {quiz.attemptCount === 0 ? (
            <span className="wght-620 text-[var(--color-apple-action)]">새 세트</span>
          ) : quiz.lastScore !== null ? (
            <span className="tabular-nums">
              {quiz.lastScore}/{quiz.questionCount} · {quiz.attemptCount}회
            </span>
          ) : (
            <span className="tabular-nums">{quiz.attemptCount}회 풀이</span>
          )}
        </div>
      </Link>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="mt-14 fade-up fade-up-2 sm:mt-20">
      <AppleEmptyState
        size="sm"
        title="아직 만든 문제가 없어요"
        sub="자료를 한 번 올리고 요약을 만들면, 그 자리에서 바로 만들 수 있어요"
        ctaPrimary={{ href: "/dashboard/study", label: "자료 올리러 가기", tone: "primary" }}
      />
    </div>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "최근";
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}일 전`;
  const mon = Math.round(day / 30);
  return `${mon}개월 전`;
}
