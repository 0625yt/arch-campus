import Link from "next/link";
import { redirect } from "next/navigation";
import { AppleEmptyState } from "@/components/apple-empty";
import { AppleShell } from "@/components/apple-shell";
import {
  academicTermKey,
  academicTermLabel,
  compareAcademicTerms,
  inferAcademicTerm,
  isCourseInTerm,
  parseAcademicTermKey,
  type SemesterTerm,
} from "@/lib/academic";
import { tryGetOwnerId } from "@/lib/auth";
import { listQuizSourceMaterials } from "@/lib/data/materials";
import { listGeneratedQuizzes } from "@/lib/data/quizzes";
import { NewQuizLauncher } from "./new-quiz-launcher";
import { QuizTermSwitcher } from "./quiz-term-switcher";
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
  searchParams: Promise<{ material?: string | string[]; term?: string | string[] }>;
}) {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  const params = await searchParams;
  const initialMaterialId = Array.isArray(params.material) ? params.material[0] : params.material;
  const requestedTerm = Array.isArray(params.term) ? params.term[0] : params.term;
  const [quizzes, sources] = await Promise.all([
    listGeneratedQuizzes({ ownerId, limit: 50 }),
    listQuizSourceMaterials({ ownerId, limit: 100 }),
  ]);
  const selectedTerm = parseAcademicTermKey(requestedTerm);
  const terms = collectTerms(quizzes, sources, selectedTerm);
  const selectedKey = selectedTerm ? academicTermKey(selectedTerm.year, selectedTerm.term) : "all";
  const visibleQuizzes = selectedTerm
    ? quizzes.filter((quiz) => isCourseInTerm(quiz, selectedTerm.year, selectedTerm.term))
    : quizzes;
  const visibleSources = selectedTerm
    ? sources.filter((source) => isCourseInTerm(source, selectedTerm.year, selectedTerm.term))
    : sources;
  const termLabel = selectedTerm ? academicTermLabel(selectedTerm.year, selectedTerm.term) : "전부";

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
              내 문제 <span className="heading-dim">{termLabel}</span>
            </h1>
            <p
              className="mt-3 text-[13.5px] leading-[1.55] wght-450 text-[var(--color-apple-muted)] sm:text-[14.5px]"
              style={{ letterSpacing: "-0.012em" }}
            >
              {visibleQuizzes.length > 0
                ? `만든 문제 ${visibleQuizzes.length}세트 · 자료를 골라 바로 새 문제 만들기`
                : selectedTerm
                  ? `${termLabel} 문제를 만들 자료를 골라보세요`
                  : "자료를 골라 바로 첫 문제 만들기"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <QuizTermSwitcher terms={terms} selectedKey={selectedKey} />
            <NewQuizLauncher sources={visibleSources} initialMaterialId={initialMaterialId} />
          </div>
        </header>

        {visibleQuizzes.length === 0 ? (
          <EmptyState termLabel={selectedTerm ? termLabel : null} />
        ) : (
          <section className="mt-6 fade-up fade-up-2 sm:mt-8">
            <QuizzesGrid quizzes={visibleQuizzes} />
          </section>
        )}
      </AppleShell>
    </div>
  );
}

function EmptyState({ termLabel }: { termLabel: string | null }) {
  return (
    <div className="mt-14 fade-up fade-up-2 sm:mt-20">
      <AppleEmptyState
        size="sm"
        title={termLabel ? `${termLabel}에 만든 문제가 없어요` : "아직 만든 문제가 없어요"}
        sub={
          termLabel
            ? "위의 새 문제 버튼에서 이 학기 자료를 골라 첫 문제를 만들어 보세요"
            : "자료를 한 번 올리고 요약을 만들면, 그 자리에서 바로 만들 수 있어요"
        }
        ctaPrimary={{ href: "/dashboard/study", label: "자료 올리러 가기", tone: "primary" }}
      />
    </div>
  );
}

function collectTerms(
  quizzes: Array<{ semesterYear: number | null; semesterTerm: SemesterTerm | null }>,
  sources: Array<{ semesterYear: number | null; semesterTerm: SemesterTerm | null }>,
  selected: { year: number; term: SemesterTerm } | null,
): Array<{ year: number; term: SemesterTerm }> {
  const current = inferAcademicTerm();
  const terms = new Map<string, { year: number; term: SemesterTerm }>();

  for (const item of [...quizzes, ...sources]) {
    if (item.semesterYear && item.semesterTerm) {
      terms.set(academicTermKey(item.semesterYear, item.semesterTerm), {
        year: item.semesterYear,
        term: item.semesterTerm,
      });
    }
  }

  terms.set(academicTermKey(current.year, current.term), current);
  if (selected) terms.set(academicTermKey(selected.year, selected.term), selected);
  return [...terms.values()].sort(compareAcademicTerms);
}
