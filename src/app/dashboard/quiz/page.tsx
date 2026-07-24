import Link from "next/link";
import { redirect } from "next/navigation";
import { AppleEmptyState } from "@/components/apple-empty";
import { AppleShell } from "@/components/apple-shell";
import { tryGetOwnerId } from "@/lib/auth";
import { listQuizSourceMaterials } from "@/lib/data/materials";
import { listGeneratedQuizzes } from "@/lib/data/quizzes";
import { NewQuizLauncher } from "./new-quiz-launcher";
import { QuizzesGrid } from "./quizzes-grid";

export const dynamic = "force-dynamic";

/**
 * "내 문제" — 사용자가 만든 모든 퀴즈 인덱스.
 *
 * 결함이 있었던 동선: 자료 detail에서 퀴즈를 만든 직후 페이지를 떠나면
 * 그 퀴즈를 다시 찾아갈 길이 없었다 (오답 페이지·today 카드는 attempt가 있어야 떴음).
 * 이 인덱스는 만든 적 있는 모든 퀴즈를 시간역순으로 노출해 "어디 있지?" 질문을 끊는다.
 *
 * 톤 — review/today 페이지와 동일. 빈 상태에선 자료 업로드로 유도.
 * 카드 우클릭(또는 long-press) → 삭제 메뉴 (QuizzesGrid가 처리).
 */
export default async function QuizIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ material?: string | string[] }>;
}) {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  const params = await searchParams;
  const initialMaterialId = Array.isArray(params.material) ? params.material[0] : params.material;
  const [quizzes, sources] = await Promise.all([
    listGeneratedQuizzes({ ownerId, limit: 50 }),
    listQuizSourceMaterials({ ownerId, limit: 100 }),
  ]);

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
            className="inline-flex min-h-11 items-center pl-3 text-[12px] wght-450 text-[var(--color-apple-action)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            오답 복습 ›
          </Link>
        </header>

        <header className="mt-6 flex flex-col gap-5 fade-up fade-up-1 sm:mt-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1
              className="text-[28px] leading-[1.08] wght-700 text-[var(--color-apple-ink)] sm:text-[36px] md:text-[42px]"
              style={{ letterSpacing: "-0.022em" }}
            >
              내 문제 <span className="heading-dim">전부</span>
            </h1>
            <p
              className="mt-3 text-[13.5px] leading-[1.55] wght-450 text-[var(--color-apple-muted)] sm:text-[14.5px]"
              style={{ letterSpacing: "-0.012em" }}
            >
              {quizzes.length > 0
                ? `만든 문제 ${quizzes.length}세트 · 자료를 골라 바로 새 문제 만들기`
                : "자료를 골라 바로 첫 문제 만들기"}
            </p>
          </div>
          <NewQuizLauncher sources={sources} initialMaterialId={initialMaterialId} />
        </header>

        {quizzes.length === 0 ? (
          <EmptyState />
        ) : (
          <section className="mt-6 fade-up fade-up-2 sm:mt-8">
            <QuizzesGrid quizzes={quizzes} />
          </section>
        )}
      </AppleShell>
    </div>
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
