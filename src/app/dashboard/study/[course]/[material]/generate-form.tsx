"use client";

import { useState } from "react";
import { Arrow, Kbd } from "@/components/primitives";
import { cn } from "@/lib/utils";

/* ─────────── types ─────────── */

type QuestionKind = "객관식" | "주관식" | "서술형";
type Difficulty = "쉬움" | "보통" | "어려움";

const KIND_HINTS: Record<QuestionKind, string> = {
  객관식: "4지선다 · 빠르게 점검할 때",
  주관식: "단답형 · 핵심 용어 암기",
  서술형: "2~3문장 답 · 개념 설명 연습",
};

const COUNT_OPTIONS = [5, 10, 15, 20];

/* ─────────── component ─────────── */

export function GenerateForm({
  courseSlug,
  materialId,
}: {
  courseSlug: string;
  materialId: string;
}) {
  // 데모 — courseSlug/materialId는 실제 호출 시 사용됨
  void courseSlug;
  void materialId;

  const [kinds, setKinds] = useState<Set<QuestionKind>>(new Set(["객관식"]));
  const [difficulty, setDifficulty] = useState<Difficulty>("보통");
  const [count, setCount] = useState(10);
  const [generated, setGenerated] = useState(false);

  function toggleKind(k: QuestionKind) {
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function generate() {
    if (kinds.size === 0) return;
    setGenerated(true);
  }

  if (generated) {
    return (
      <Quiz
        kinds={Array.from(kinds)}
        difficulty={difficulty}
        count={count}
        onReset={() => setGenerated(false)}
      />
    );
  }

  return (
    <div>
      {/* 문제 유형 — 체크박스 중복 */}
      <FieldGroup label="문제 유형" hint="여러 개 골라도 돼요">
        <ul className="flex flex-col gap-2">
          {(Object.keys(KIND_HINTS) as QuestionKind[]).map((k) => {
            const checked = kinds.has(k);
            return (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => toggleKind(k)}
                  className={cn(
                    "group flex w-full items-baseline gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-[var(--duration-fast)]",
                    checked
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                      : "border-[var(--color-apple-hairline)] hover:border-[var(--color-apple-hairline)] hover:bg-[var(--color-apple-pearl)]",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[10px] wght-700 transition-colors",
                      checked
                        ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                        : "border-[var(--color-apple-hairline)] text-[var(--color-apple-hairline)] group-hover:border-[var(--color-apple-hairline)]",
                    )}
                  >
                    {checked ? "✓" : ""}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span
                      className={cn(
                        "text-[14px] sm:text-[14.5px]",
                        checked
                          ? "wght-560 text-[var(--color-accent-strong)]"
                          : "wght-500 text-[var(--color-apple-ink)]",
                      )}
                    >
                      {k}
                    </span>
                    <span className="mt-0.5 text-[11.5px] wght-450 text-[var(--color-apple-muted)]">
                      {KIND_HINTS[k]}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </FieldGroup>

      {/* 난이도 */}
      <FieldGroup label="난이도" className="mt-7">
        <ul className="-mx-1 flex flex-wrap gap-x-1 gap-y-2">
          {(["쉬움", "보통", "어려움"] as Difficulty[]).map((d) => {
            const active = difficulty === d;
            return (
              <li key={d}>
                <button
                  type="button"
                  onClick={() => setDifficulty(d)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[12.5px] transition-colors",
                    active
                      ? "wght-560 bg-[var(--color-apple-ink)] text-white"
                      : "wght-450 text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]",
                  )}
                >
                  {d}
                </button>
              </li>
            );
          })}
        </ul>
      </FieldGroup>

      {/* 문제 수 */}
      <FieldGroup label="문제 수" className="mt-7">
        <ul className="-mx-1 flex flex-wrap gap-x-1 gap-y-2">
          {COUNT_OPTIONS.map((n) => {
            const active = count === n;
            return (
              <li key={n}>
                <button
                  type="button"
                  onClick={() => setCount(n)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[12.5px] tabular-nums transition-colors",
                    active
                      ? "wght-560 bg-[var(--color-apple-ink)] text-white"
                      : "wght-450 text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]",
                  )}
                >
                  {n}문제
                </button>
              </li>
            );
          })}
        </ul>
      </FieldGroup>

      {/* 액션 — 모바일에서 모달 잘려도 항상 viewport 안에 */}
      <div className="sticky bottom-0 -mx-5 -mb-5 mt-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--color-apple-hairline)] bg-white px-5 py-4 sm:-mx-6 sm:-mb-6 sm:px-6 sm:py-5">
        <button
          type="button"
          onClick={generate}
          disabled={kinds.size === 0}
          className={cn(
            "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] wght-560 transition-all duration-[var(--duration-fast)]",
            kinds.size > 0
              ? "bg-[var(--color-apple-ink)] text-white hover:opacity-90"
              : "cursor-not-allowed bg-[var(--color-apple-pearl)] text-[var(--color-apple-hairline)]",
          )}
        >
          {kinds.size === 0 ? "유형을 한 개 이상 골라주세요" : `${count}문제 만들기`}
          {kinds.size > 0 && (
            <Arrow className="text-[12px] transition-transform group-hover:translate-x-0.5" />
          )}
        </button>

        <span className="ml-auto hidden items-center gap-1.5 text-[11px] wght-450 text-[var(--color-apple-muted)] sm:inline-flex">
          평균 <span className="tabular-nums text-[var(--color-apple-ink)]">15초</span>
          소요
        </span>
      </div>
    </div>
  );
}

/* ─────────── small primitives ─────────── */

function FieldGroup({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex items-baseline gap-2">
        <h3 className="text-[11px] wght-700 tabular-nums uppercase text-[var(--color-apple-muted)]">
          {label}
        </h3>
        {hint && (
          <span className="text-[11px] wght-450 text-[var(--color-apple-muted)]">{hint}</span>
        )}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/* ─────────── Quiz (생성 후 풀이) ─────────── */

interface Choice {
  id: "A" | "B" | "C" | "D";
  text: string;
}

interface Question {
  num: number;
  kind: QuestionKind;
  text: string;
  choices: Choice[];
  answer: "A" | "B" | "C" | "D";
  evidence: { page: number; paragraph: number; quote: string };
  explain: string;
}

const QUESTION: Question = {
  num: 1,
  kind: "객관식",
  text: "다음 중 교착 상태(Deadlock)의 4가지 필요조건이 아닌 것은?",
  choices: [
    { id: "A", text: "상호 배제 (Mutual Exclusion)" },
    { id: "B", text: "점유와 대기 (Hold and Wait)" },
    { id: "C", text: "선점 가능 (Preemptable)" },
    { id: "D", text: "원형 대기 (Circular Wait)" },
  ],
  answer: "C",
  evidence: {
    page: 23,
    paragraph: 4,
    quote:
      "교착 상태가 발생하기 위해서는 다음 4가지 조건이 모두 성립해야 한다 — 상호 배제, 점유와 대기, 비선점, 원형 대기. 이 중 하나라도 차단하면 교착 상태를 예방할 수 있다.",
  },
  explain:
    "교착 상태의 4가지 필요조건은 상호 배제·점유와 대기·비선점·원형 대기. '선점 가능'은 오히려 교착 상태를 풀어주는 조건이라 정답.",
};

function Quiz({
  kinds,
  difficulty,
  count,
  onReset,
}: {
  kinds: QuestionKind[];
  difficulty: Difficulty;
  count: number;
  onReset: () => void;
}) {
  const [picked, setPicked] = useState<Choice["id"] | null>(null);
  const [revealed, setRevealed] = useState(false);

  const isCorrect = picked === QUESTION.answer;

  function handlePick(id: Choice["id"]) {
    if (revealed) return;
    setPicked(id);
    setRevealed(true);
  }

  function handleNext() {
    setPicked(null);
    setRevealed(false);
  }

  return (
    <div className="fade-up">
      {/* 생성 결과 헤더 */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[11px] wght-450 text-[var(--color-apple-muted)]">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-success)]/10 px-2 py-0.5 text-[10.5px] wght-700 tabular-nums uppercase text-[var(--color-success)]">
            ✓ {count}문제 만들어졌어요
          </span>
          <span className="text-[var(--color-apple-hairline)]">·</span>
          <span>유형 {kinds.join(" · ")}</span>
          <span className="text-[var(--color-apple-hairline)]">·</span>
          <span>{difficulty}</span>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="text-[12px] wght-450 text-[var(--color-apple-muted)] hover:text-[var(--color-apple-ink)]"
        >
          다시 만들기
        </button>
      </div>

      {/* 진행률 */}
      <div className="mt-5 flex items-baseline justify-between gap-3 text-[11px] wght-560 tabular-nums uppercase">
        <span className="tabular-nums text-[var(--color-apple-ink)]">
          {String(QUESTION.num).padStart(2, "0")} / {String(count).padStart(2, "0")}
        </span>
        <span className="text-[var(--color-apple-muted)]">{QUESTION.kind}</span>
      </div>

      {/* 질문 */}
      <p className="mt-4 text-[16px] leading-[1.55] wght-560 text-[var(--color-apple-ink)] sm:text-[17px]">
        {QUESTION.text}
      </p>

      {/* 보기 */}
      <ul className="mt-5 flex flex-col gap-2">
        {QUESTION.choices.map((c) => {
          const isPicked = picked === c.id;
          const isAnswer = c.id === QUESTION.answer;
          const showCorrect = revealed && isAnswer;
          const showWrong = revealed && isPicked && !isAnswer;

          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => handlePick(c.id)}
                disabled={revealed}
                className={cn(
                  "group flex w-full items-baseline gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-[var(--duration-fast)]",
                  "disabled:cursor-default",
                  !revealed &&
                    "border-[var(--color-apple-hairline)] hover:border-[var(--color-apple-hairline)] hover:bg-[var(--color-apple-pearl)]",
                  showCorrect &&
                    "border-[var(--color-success)] bg-[color-mix(in_srgb,var(--color-success)_8%,transparent)]",
                  showWrong && "border-[var(--color-urgent)] bg-[var(--color-urgent-soft)]",
                  revealed &&
                    !showCorrect &&
                    !showWrong &&
                    "border-[var(--color-apple-hairline)] opacity-50",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] wght-700 transition-colors",
                    showCorrect && "bg-[var(--color-success)] text-white",
                    showWrong && "bg-[var(--color-urgent)] text-white",
                    !revealed &&
                      "border border-[var(--color-apple-hairline)] text-[var(--color-apple-muted)] group-hover:border-[var(--color-apple-hairline)] group-hover:text-[var(--color-apple-ink)]",
                    revealed &&
                      !showCorrect &&
                      !showWrong &&
                      "border border-[var(--color-apple-hairline)] text-[var(--color-apple-muted)]",
                  )}
                >
                  {c.id}
                </span>
                <span
                  className={cn(
                    "flex-1 text-[14px] sm:text-[14.5px]",
                    showCorrect && "wght-560 text-[var(--color-apple-ink)]",
                    showWrong && "wght-560 text-[var(--color-urgent-strong)]",
                    !revealed && "wght-450 text-[var(--color-apple-ink)]",
                  )}
                >
                  {c.text}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* 결과 영역 */}
      {revealed && (
        <div className="mt-5 fade-up">
          <p
            className={cn(
              "text-[13.5px] wght-560 kerning-tight",
              isCorrect ? "text-[var(--color-success)]" : "text-[var(--color-urgent)]",
            )}
          >
            {isCorrect ? "맞았어요." : "다음에는 맞출 수 있어요."} 정답은{" "}
            <span className="wght-700">{QUESTION.answer}</span>.
          </p>

          <p className="mt-2 text-[13.5px] leading-[1.6] text-[var(--color-apple-ink)]">
            {QUESTION.explain}
          </p>

          {/* 출처 근거 */}
          <div className="mt-5 border-l-2 border-[var(--color-apple-hairline)] pl-4">
            <p className="text-[10.5px] wght-560 tabular-nums uppercase text-[var(--color-apple-muted)]">
              근거 · {QUESTION.evidence.page}p {QUESTION.evidence.paragraph}문단
            </p>
            <p className="mt-1.5 text-[12.5px] leading-[1.6] italic text-[var(--color-apple-muted)]">
              "{QUESTION.evidence.quote}"
            </p>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
            <button
              type="button"
              onClick={handleNext}
              className="group inline-flex items-baseline gap-1.5 text-[14px] wght-560 text-[var(--color-accent)] hover:text-[var(--color-accent-strong)]"
            >
              <span className="border-b border-[var(--color-accent)]/40 pb-px group-hover:border-[var(--color-accent-strong)]">
                다음 문제
              </span>
              <Arrow className="text-[14px] transition-transform group-hover:translate-x-0.5" />
            </button>
            {!isCorrect && (
              <span className="text-[12.5px] wght-450 text-[var(--color-apple-muted)]">
                오답노트에 저장됨
              </span>
            )}
            <span className="ml-auto hidden items-center gap-1.5 text-[11px] wght-450 text-[var(--color-apple-muted)] sm:inline-flex">
              <Kbd>Enter</Kbd>
              다음
            </span>
          </div>
        </div>
      )}

      {!revealed && (
        <p className="mt-5 text-[11.5px] wght-450 text-[var(--color-apple-muted)]">
          답을 고르면 출처 페이지·해설이 함께 나와요
        </p>
      )}
    </div>
  );
}
