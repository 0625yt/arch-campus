import { WizardWatermark } from "@/components/wizard-shell";
import type { ExtractedExamView } from "@/lib/data/quizzes";
import { ExamQuestionRow } from "./exam-question-row";

/**
 * type=exam 자료의 추출 결과 표시.
 *
 * 각 문제는 ExamQuestionRow (게이트 컴포넌트) — 정답 노출은 사용자가 답 입력 후.
 * 자료 분량이 100문제 넘으면 truncated 표시.
 */
export function ExtractExamView({
  extracted,
  className,
}: {
  extracted: ExtractedExamView;
  className?: string;
}) {
  // 본문에 답이 없어 AI가 추정으로 채운 문제 수 — 있으면 상단에 한 줄 안내(§4 투명성).
  const aiGuessCount = extracted.questions.filter((q) => q.answerSource === "ai").length;

  return (
    <section className={className}>
      <header className="mb-5 flex items-baseline justify-between gap-3">
        <h2
          className="text-[18px] wght-620 text-[var(--color-apple-ink)] sm:text-[20px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          기출문제 {extracted.questions.length}개
        </h2>
        <p
          className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          본인 답을 적은 후 정답을 봐주세요
        </p>
      </header>

      {aiGuessCount > 0 && (
        <p
          className="mb-4 rounded-[10px] bg-[var(--color-apple-action-soft)] px-3.5 py-2.5 text-[12.5px] leading-[1.55] wght-450 text-[var(--color-apple-action)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          이 중 <strong className="wght-700">{aiGuessCount}개</strong>는 자료 본문에 답이 없어 AI가
          추정한 정답이에요. <strong className="wght-700">AI 추정</strong> 표시가 붙은 문제는 틀릴
          수 있으니 꼭 본인이 확인하세요.
        </p>
      )}

      <ul className="flex flex-col gap-3 sm:gap-4">
        {extracted.questions.map((q) => (
          <li key={q.id}>
            <ExamQuestionRow q={q} />
          </li>
        ))}
      </ul>

      <div className="mt-6 px-2">
        <WizardWatermark modelText={extracted.watermark} />
      </div>
    </section>
  );
}
