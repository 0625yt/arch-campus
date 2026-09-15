import { notFound } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import type { ExtractedExamView, QuizSolveView } from "@/lib/data/quizzes";
import type { SummarizeOutputT } from "@/lib/schemas";
import { QuizSolver } from "../../dashboard/quiz/[quizId]/quiz-solver";
import { DownloadSummaryButton } from "../../dashboard/study/[course]/[material]/download-summary-button";
import { ExtractExamView } from "../../dashboard/study/[course]/[material]/extract-exam-view";
import { MaterialView } from "../../dashboard/study/[course]/[material]/material-view";
import { PreviewThemeLock } from "./preview-theme-lock";

export const dynamic = "force-dynamic";

const MATERIAL_ID = "00000000-0000-4000-8000-000000000001";
const COURSE_COLOR = "#7657d6";

const demoSummary: SummarizeOutputT = {
  leadSentence:
    "기억은 한 번에 저장되는 기록이 아니라, 주의를 기울여 부호화하고 간격을 두고 다시 꺼낼 때 오래 남는 과정입니다.",
  blocks: [
    {
      type: "h2",
      content: "기억이 만들어지는 세 단계",
      sourcePage: 2,
    },
    {
      type: "para",
      content:
        "학습한 정보는 부호화, 저장, 인출의 순서로 처리됩니다. 처음 이해할 때 기존 지식과 연결하고, 나중에 단서 없이 떠올려 보는 과정이 기억을 더 단단하게 만듭니다.",
      sourcePage: 2,
    },
    {
      type: "bullets",
      items: ["작업 기억은 용량이 작아 내용을 의미 있는 덩어리로 묶어야 합니다."],
      sourcePage: 3,
    },
    {
      type: "bullets",
      items: ["한 번에 몰아보기보다 학습 사이에 간격을 두면 장기 기억이 오래 유지됩니다."],
      sourcePage: 5,
    },
    {
      type: "bullets",
      items: ["다시 읽기보다 스스로 답을 꺼내 보는 인출 연습이 이해 상태를 정확히 보여줍니다."],
      sourcePage: 6,
    },
    {
      type: "h2",
      content: "효율적인 복습 설계",
      sourcePage: 5,
    },
    {
      type: "callout",
      tone: "tip",
      content:
        "추천 루틴: 수업 직후 10분 정리 → 다음 날 핵심 질문 3개에 답하기 → 3일 뒤 문제 풀기 → 일주일 뒤 틀린 개념만 다시 확인하기.",
      sourcePage: 7,
    },
    {
      type: "para",
      content:
        "학습 난이도를 조금씩 섞는 교차 연습은 당장은 더 어렵게 느껴지지만, 어떤 개념을 언제 적용해야 하는지 구분하는 힘을 길러 시험 상황의 전이를 높입니다.",
      sourcePage: 8,
    },
  ],
  keywords: ["부호화", "작업 기억", "간격 효과", "인출 연습", "교차 연습"],
  reviewSpots: [
    {
      title: "간격 효과와 인출 연습의 차이",
      why: "복습 시점과 복습 방식의 차이를 구분해 설명할 수 있어야 응용 문제를 풀 수 있어요.",
    },
    {
      title: "작업 기억의 한계",
      why: "인지 부하가 커질 때 내용을 묶고 외부 단서를 활용하는 이유를 다시 확인해 보세요.",
    },
  ],
  watermark: "이 자료는 학습 보조용이며 원문과 함께 검토해야 학습이 완성돼요.",
};

const quizSets = [
  {
    difficulty: "보통",
    questionCount: 10,
    age: "오늘",
    title: "기억 체계 핵심 개념 점검",
    result: "최근 8/10 · 2회 풀이",
    wrongCount: 2,
  },
  {
    difficulty: "어려움",
    questionCount: 8,
    age: "어제",
    title: "학습 전략 적용 사례",
    result: "최근 6/8 · 1회 풀이",
    wrongCount: 1,
  },
  {
    difficulty: "쉬움",
    questionCount: 12,
    age: "3일 전",
    title: "용어와 정의 빠른 복습",
    result: "아직 안 풀었어요",
    wrongCount: 0,
  },
] as const;

const demoQuiz: QuizSolveView = {
  id: "00000000-0000-4000-8000-000000000002",
  materialId: MATERIAL_ID,
  courseId: "00000000-0000-4000-8000-000000000003",
  courseName: "인지심리학",
  title: "기억과 학습 전략 핵심 점검",
  difficulty: "보통",
  watermark: "이 문제는 학습 보조용이며 원문과 함께 검토해야 학습이 완성돼요.",
  total: 10,
  generationQuality: null,
  questions: Array.from({ length: 10 }, (_, index) => ({
    id: index + 1,
    kind: "multiple-choice" as const,
    difficulty: index < 3 ? "쉬움" : index < 8 ? "보통" : "어려움",
    topic: index < 5 ? "기억 과정" : "복습 전략",
    stem:
      index === 0
        ? "다시 읽기보다 스스로 답을 떠올리는 연습이 장기 기억에 도움이 되는 이유는 무엇인가요?"
        : `${index + 1}번째 학습 상황에서 가장 알맞은 기억 전략을 고르세요.`,
    choices:
      index === 0
        ? [
            { key: "A" as const, text: "정보를 알아보는 익숙함만 높이기 때문에" },
            { key: "B" as const, text: "단서 없이 정보를 꺼내는 경로를 강화하기 때문에" },
            { key: "C" as const, text: "한 번에 더 많은 내용을 읽을 수 있기 때문에" },
            { key: "D" as const, text: "복습 간격을 완전히 없앨 수 있기 때문에" },
          ]
        : [
            { key: "A" as const, text: "한 번에 몰아서 다시 읽기" },
            { key: "B" as const, text: "간격을 두고 스스로 설명하기" },
            { key: "C" as const, text: "답을 보면서 그대로 옮겨 적기" },
            { key: "D" as const, text: "틀린 개념도 같은 비중으로 반복하기" },
          ],
    hint: "기억을 꺼내는 행동 자체가 학습에 주는 영향을 떠올려 보세요.",
  })),
};

const demoExam: ExtractedExamView = {
  quizId: "00000000-0000-4000-8000-000000000004",
  title: "2025학년도 인지심리학 중간고사 — 기출 추출",
  watermark: "이 자료는 학습 보조용이며 반드시 본인이 검토·수정해야 합니다.",
  createdAt: "2026-07-23T09:00:00.000Z",
  questions: [
    {
      id: 1,
      kind: "multiple-choice",
      stem: "다음 중 작업 기억의 특성을 가장 정확하게 설명한 것은?",
      choices: [
        { key: "A", text: "정보를 무제한으로 영구 저장하는 체계이다." },
        { key: "B", text: "현재 처리 중인 정보를 잠시 유지하며 용량에 한계가 있다." },
        { key: "C", text: "의식적인 주의 없이 모든 감각 정보를 장기간 보존한다." },
        { key: "D", text: "한 번 저장된 정보는 간섭의 영향을 받지 않는다." },
      ],
      answer: "B",
      explanation:
        "작업 기억은 현재 과제에 필요한 정보를 짧게 유지하고 조작하는 체계이며, 처리할 수 있는 정보의 양이 제한되어 있다.",
      sourcePageNum: 3,
      sourceQuote:
        "1. 다음 중 작업 기억의 특성을 가장 정확하게 설명한 것은? 정답 B. 작업 기억은 현재 처리 중인 정보를 잠시 유지하며 용량에 한계가 있다.",
      needsManualCheck: false,
      answerSource: "material",
    },
    {
      id: 2,
      kind: "short-answer",
      stem: "학습한 내용을 답을 보지 않고 스스로 떠올려 보는 복습 방법을 쓰시오.",
      answer: "인출 연습",
      explanation:
        "인출 연습은 기억에서 정보를 직접 꺼내는 과정을 반복해 인출 경로를 강화하는 방법이다.",
      sourcePageNum: 5,
      sourceQuote:
        "2. 학습한 내용을 답을 보지 않고 스스로 떠올려 보는 복습 방법을 쓰시오. 정답: 인출 연습.",
      needsManualCheck: false,
      answerSource: "material",
    },
    {
      id: 3,
      kind: "essay",
      stem: "간격 효과와 인출 연습을 함께 활용한 일주일 복습 계획을 서술하시오.",
      answer:
        "수업 직후 핵심을 정리하고, 다음 날과 3일 뒤에는 자료를 덮은 채 핵심 질문에 답한다. 일주일 뒤에는 틀린 개념만 다시 인출해 확인한다.",
      explanation: null,
      sourcePageNum: 7,
      sourceQuote: "3. 간격 효과와 인출 연습을 함께 활용한 일주일 복습 계획을 서술하시오.",
      needsManualCheck: true,
      answerSource: "ai",
    },
  ],
};

export default async function LandingMaterialPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ capture?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { capture } = await searchParams;

  if (capture === "practice") {
    return <PracticeCapturePage />;
  }
  if (capture === "quiz") {
    return <QuizCapturePage />;
  }
  if (capture === "exam") {
    return <ExamCapturePage />;
  }

  return (
    <div className="min-h-screen bg-white text-[var(--color-apple-ink)]">
      <PreviewThemeLock />
      <PreviewTopbar />

      <main className="dashboard-canvas min-h-[calc(100vh-48px)]">
        <div
          id="landing-material-preview"
          className="mx-auto w-full max-w-[1400px] px-8 pb-16 pt-8 lg:px-10"
        >
          <section
            data-testid="landing-material-split-capture"
            aria-label="PDF와 요약 분할 보기 예시"
          >
            <nav
              aria-label="현재 위치"
              className="flex items-center gap-1.5 text-[12px] wght-450 text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              <span>공부</span>
              <span aria-hidden className="text-[var(--color-apple-hairline)]">
                ›
              </span>
              <span className="wght-560" style={{ color: COURSE_COLOR }}>
                인지심리학
              </span>
            </nav>

            <div className="mt-5 flex items-end justify-between gap-8">
              <header>
                <p className="text-[11px] wght-700 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
                  강의자료
                </p>
                <h1
                  className="mt-2 text-[36px] leading-[1.05] wght-700 text-[var(--color-apple-ink)]"
                  style={{ letterSpacing: "-0.022em" }}
                >
                  기억과 학습 전략.pdf
                </h1>
                <div
                  className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] wght-450 text-[var(--color-apple-muted)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  <span className="tabular-nums">10쪽</span>
                  <span className="text-[var(--color-apple-hairline)]">·</span>
                  <span>오늘 업로드</span>
                  <span className="text-[var(--color-apple-hairline)]">·</span>
                  <span>방금 요약</span>
                </div>
              </header>

              <span className="mb-1 inline-flex items-center rounded-full border border-[var(--color-apple-hairline-soft)] bg-white/80 px-3 py-1.5 text-[11px] wght-560 text-[var(--color-apple-muted)] shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                실제 제품 UI · 예시 데이터
              </span>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <DownloadSummaryButton filename="기억과 학습 전략 요약" />
            </div>

            <MaterialView
              pdfUrl="/landing/demo-material.pdf"
              summary={demoSummary}
              materialId={MATERIAL_ID}
              materialTitle="기억과 학습 전략.pdf"
              className="mt-6"
            />
          </section>

          <Keywords keywords={demoSummary.keywords} />
          <section
            data-testid="landing-material-practice-capture"
            aria-label="자료에서 만든 문제와 추가 생성 예시"
            className="mt-8"
          >
            <div className="flex justify-end">
              <span
                className="text-[10.5px] wght-560 text-[var(--color-apple-muted)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                실제 제품 UI · 예시 데이터
              </span>
            </div>
            <QuizSetList />
            <GenerateMoreCard />
          </section>
        </div>
      </main>
    </div>
  );
}

function ExamCapturePage() {
  return (
    <div className="min-h-screen bg-white text-[var(--color-apple-ink)]">
      <PreviewThemeLock />
      <PreviewTopbar />

      <main className="dashboard-canvas min-h-[calc(100vh-48px)]">
        <div className="mx-auto w-full max-w-[1080px] px-8 pb-16 pt-8 lg:px-10">
          <section data-testid="landing-material-exam-capture" aria-label="기출문제 정리 예시">
            <nav
              aria-label="현재 위치"
              className="flex items-center gap-1.5 text-[12px] wght-450 text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              <span>공부</span>
              <span aria-hidden className="text-[var(--color-apple-hairline)]">
                ›
              </span>
              <span style={{ color: COURSE_COLOR }}>인지심리학</span>
              <span aria-hidden className="text-[var(--color-apple-hairline)]">
                ›
              </span>
              <span className="wght-560 text-[var(--color-apple-ink)]">기출문제</span>
            </nav>

            <div className="mt-5 flex items-end justify-between gap-8">
              <header>
                <p className="text-[11px] wght-700 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
                  기출문제
                </p>
                <h1
                  className="mt-2 text-[32px] leading-[1.06] wght-700 text-[var(--color-apple-ink)] sm:text-[36px]"
                  style={{ letterSpacing: "-0.022em" }}
                >
                  2025학년도 인지심리학 중간고사.pdf
                </h1>
                <div
                  className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] wght-450 text-[var(--color-apple-muted)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  <span className="tabular-nums">8쪽</span>
                  <span className="text-[var(--color-apple-hairline)]">·</span>
                  <span>오늘 업로드</span>
                  <span className="text-[var(--color-apple-hairline)]">·</span>
                  <span>문제·정답·해설 3개 정리</span>
                </div>
              </header>

              <span className="mb-1 shrink-0 rounded-full border border-[var(--color-apple-hairline-soft)] bg-white/80 px-3 py-1.5 text-[11px] wght-560 text-[var(--color-apple-muted)] shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                실제 제품 UI · 예시 데이터
              </span>
            </div>

            <ExtractExamView extracted={demoExam} className="mt-7" />
          </section>
        </div>
      </main>
    </div>
  );
}

function QuizCapturePage() {
  return (
    <div className="min-h-screen bg-white text-[var(--color-apple-ink)]">
      <PreviewThemeLock />
      <PreviewTopbar activeItem="내 문제" />

      <main className="dashboard-canvas min-h-[calc(100vh-48px)]">
        <div className="mx-auto w-full max-w-[1080px] px-8 pb-14 pt-8 lg:px-10">
          <div className="mb-5 flex justify-end">
            <span className="text-[10.5px] wght-560 text-[var(--color-apple-muted)]">
              실제 제품 UI · 예시 데이터
            </span>
          </div>
          <QuizSolver quiz={demoQuiz} />
        </div>
      </main>
    </div>
  );
}

function PracticeCapturePage() {
  return (
    <div className="min-h-screen bg-white text-[var(--color-apple-ink)]">
      <PreviewThemeLock />
      <PreviewTopbar />

      <main className="dashboard-canvas min-h-[calc(100vh-48px)]">
        <div className="mx-auto w-full max-w-[1400px] px-8 pb-12 pt-8 lg:px-10">
          <nav
            aria-label="현재 위치"
            className="flex items-center gap-1.5 text-[12px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            <span>공부</span>
            <span aria-hidden className="text-[var(--color-apple-hairline)]">
              ›
            </span>
            <span style={{ color: COURSE_COLOR }}>인지심리학</span>
            <span aria-hidden className="text-[var(--color-apple-hairline)]">
              ›
            </span>
            <span className="wght-560 text-[var(--color-apple-ink)]">기억과 학습 전략.pdf</span>
          </nav>

          <section
            data-testid="landing-material-practice-capture"
            aria-label="자료에서 만든 문제와 추가 생성 예시"
            className="mt-7"
          >
            <div className="flex items-end justify-between gap-6">
              <div>
                <p className="text-[11px] wght-700 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
                  강의자료 복습
                </p>
                <h1
                  className="mt-2 text-[30px] leading-[1.08] wght-700 text-[var(--color-apple-ink)]"
                  style={{ letterSpacing: "-0.022em" }}
                >
                  기억과 학습 전략.pdf
                </h1>
              </div>
              <span className="text-[10.5px] wght-560 text-[var(--color-apple-muted)]">
                실제 제품 UI · 예시 데이터
              </span>
            </div>
            <QuizSetList />
            <GenerateMoreCard />
          </section>
        </div>
      </main>
    </div>
  );
}

function PreviewTopbar({ activeItem = "공부" }: { activeItem?: string }) {
  const navItems = ["홈", "공부", "내 문제", "복습", "일정", "도구"];

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-apple-hairline-soft)] bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-12 max-w-[1440px] items-center gap-3 px-8 lg:px-10">
        <div className="flex flex-1 items-center gap-2">
          <BrandMark size={24} />
          <span
            className="text-[14px] wght-620 text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.014em" }}
          >
            arch
          </span>
        </div>

        <nav
          aria-label="주 메뉴"
          className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-[var(--color-apple-hairline-soft)] p-[3px]"
        >
          {navItems.map((item) => (
            <span
              key={item}
              aria-current={item === activeItem ? "page" : undefined}
              className={`inline-flex h-9 items-center rounded-full px-3 text-[12px] ${
                item === activeItem
                  ? "bg-white wght-620 text-[var(--color-apple-ink)] shadow-[0_1px_4px_rgba(0,0,0,0.12)]"
                  : "wght-560 text-[var(--color-apple-muted)]"
              }`}
              style={{ letterSpacing: "-0.012em" }}
            >
              {item}
            </span>
          ))}
        </nav>

        <div className="flex flex-1 items-center justify-end gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-apple-hairline-soft)] bg-[var(--color-apple-pearl)]/60 px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-apple-action)]" />
            <span className="text-[11px] wght-560 text-[var(--color-apple-muted)]">1학기</span>
            <span className="text-[11px] wght-700 text-[var(--color-apple-ink)]">8주차</span>
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,#7aa6d6,#9b8fe8)] text-[11px] wght-700 text-white">
            A
          </span>
        </div>
      </div>
    </header>
  );
}

function Keywords({ keywords }: { keywords: string[] }) {
  return (
    <section className="mt-6">
      <h2 className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
        핵심 키워드
      </h2>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {keywords.map((keyword) => (
          <li key={keyword}>
            <span
              className="inline-block rounded-full bg-white px-3 py-1.5 text-[12px] wght-450 text-[var(--color-apple-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.025)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              {keyword}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function QuizSetList() {
  return (
    <section className="mt-3">
      <header className="flex items-baseline justify-between gap-3">
        <h2
          className="text-[14px] wght-620 uppercase text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "0.06em" }}
        >
          이 자료로 만든 문제 · 3세트
        </h2>
        <span
          className="text-[12px] wght-450 text-[var(--color-apple-action)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          내 문제 전체 ›
        </span>
      </header>

      <ul className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {quizSets.map((quiz) => (
          <li key={quiz.title}>
            <article className="h-full rounded-[14px] border border-[var(--color-apple-hairline)] bg-white px-4 py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className="text-[11px] wght-560 uppercase"
                  style={{ color: COURSE_COLOR, letterSpacing: "0.06em" }}
                >
                  {quiz.difficulty} · {quiz.questionCount}문제
                </span>
                <span className="shrink-0 text-[11px] wght-450 tabular-nums text-[var(--color-apple-muted)]">
                  {quiz.age}
                </span>
              </div>
              <p
                className="mt-2 text-[14px] wght-560 text-[var(--color-apple-ink)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                {quiz.title}
              </p>
              <p
                className={`mt-1 text-[12px] ${
                  quiz.result === "아직 안 풀었어요"
                    ? "wght-560 text-[var(--color-apple-action)]"
                    : "wght-450 text-[var(--color-apple-muted)]"
                }`}
                style={{ letterSpacing: "-0.012em" }}
              >
                {quiz.result}
              </p>
              {quiz.wrongCount > 0 && (
                <div className="mt-2 flex items-center justify-between gap-2 border-t border-[var(--color-apple-hairline)] pt-2">
                  <span className="text-[11.5px] wght-620 text-[var(--color-urgent)]">
                    오답 {quiz.wrongCount}문제 복습 →
                  </span>
                  <span className="text-[10.5px] wght-450 text-[var(--color-apple-muted)]">
                    누르면 오답만
                  </span>
                </div>
              )}
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}

function GenerateMoreCard() {
  return (
    <section className="mt-8">
      <div
        className="card-glow-ribbon elev-1 relative overflow-hidden rounded-[18px] bg-white px-8 py-8"
        style={{ ["--ribbon-color" as string]: COURSE_COLOR }}
      >
        <div className="flex items-center justify-between gap-8">
          <div>
            <p
              className="text-[12px] wght-560 uppercase"
              style={{ color: COURSE_COLOR, letterSpacing: "0.06em" }}
            >
              요약을 다 읽었다면
            </p>
            <h2
              className="mt-2 text-[28px] leading-[1.12] wght-620 text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              문제를 더 만들어 점검해 보세요
            </h2>
            <p
              className="mt-3 max-w-[680px] text-[14px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.022em" }}
            >
              객관식, 단답형, 서술형을 고르고 이 자료의 문장에서만 새 문제를 만들 수 있어요.
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-full bg-[var(--color-apple-ink)] px-5 py-3 text-[13px] wght-620 text-white shadow-[0_4px_14px_rgba(0,0,0,0.14)]"
          >
            문제 더 만들기
          </button>
        </div>
      </div>
    </section>
  );
}
