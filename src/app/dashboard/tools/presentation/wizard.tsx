"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Arrow, Kbd, Divider } from "@/components/primitives";

/* ─────────── steps ─────────── */

interface Step {
  num: number;
  label: string;
  question: string;
  hint: string;
  type: "text" | "choice";
  placeholder?: string;
  choices?: string[];
}

const STEPS: Step[] = [
  {
    num: 1,
    label: "주제",
    question: "어떤 주제로 발표하나요?",
    hint: "한 줄로 적어주세요. 예: 'BST의 균형 유지 알고리즘'",
    type: "text",
    placeholder: "발표 주제를 한 줄로",
  },
  {
    num: 2,
    label: "시간",
    question: "발표 시간은 얼마나 되나요?",
    hint: "슬라이드 수와 깊이를 결정해요",
    type: "choice",
    choices: ["5분", "10분", "15분", "20분 이상"],
  },
  {
    num: 3,
    label: "청중",
    question: "청중은 어떤 사람들인가요?",
    hint: "전공 지식 수준에 맞춰 어휘와 예시를 골라요",
    type: "choice",
    choices: [
      "같은 과 학생들 (전공 지식 있음)",
      "다른 과 학생들 (일반 청중)",
      "교수님 + 학생",
      "외부 심사위원",
    ],
  },
  {
    num: 4,
    label: "평가 기준",
    question: "교수님이 강조한 평가 기준은?",
    hint: "이게 가장 중요해요. 가점 포인트로 들어가요",
    type: "text",
    placeholder: "예: '실제 사례 분석 30%, 비판적 시각 20%'",
  },
  {
    num: 5,
    label: "참고 자료",
    question: "참고할 자료를 골라주세요",
    hint: "업로드한 자료에서 근거 자동 인용돼요",
    type: "choice",
    choices: [
      "자료구조 / 4주차 — 이진 탐색 트리",
      "자료구조 / 5장 균형 트리 읽기",
      "직접 업로드",
      "자료 없이 진행",
    ],
  },
];

/* ─────────── result (mock) ─────────── */

interface OutlineSlide {
  num: number;
  title: string;
  bullets: string[];
  duration: string;
  source?: string;
}

const OUTLINE: OutlineSlide[] = [
  {
    num: 1,
    title: "왜 균형 트리인가",
    bullets: [
      "BST의 최악 시간 복잡도 O(n)",
      "데이터가 정렬돼서 들어올 때의 함정",
    ],
    duration: "1분",
  },
  {
    num: 2,
    title: "AVL 트리 — 엄격한 균형",
    bullets: [
      "Balance Factor 정의",
      "회전 4가지 (LL · LR · RR · RL)",
    ],
    duration: "3분",
    source: "자료구조 4주차 · 18p",
  },
  {
    num: 3,
    title: "Red-Black 트리 — 느슨한 균형",
    bullets: [
      "5가지 속성과 의미",
      "왜 실무에서 더 자주 쓰이나",
    ],
    duration: "3분",
    source: "자료구조 4주차 · 24p",
  },
  {
    num: 4,
    title: "사례 분석 — Linux CFS 스케줄러",
    bullets: [
      "Red-Black 트리를 어떻게 쓰는가",
      "선택의 근거",
    ],
    duration: "2분",
    source: "자료구조 5장 · 7p",
  },
  {
    num: 5,
    title: "정리 + Q&A",
    bullets: [
      "핵심 한 줄 요약",
      "예상 질문 3개",
    ],
    duration: "1분",
  },
];

const QUESTIONS = [
  "AVL과 Red-Black 중 어떤 상황에서 무엇을 선택해야 하나요?",
  "회전 연산의 시간 복잡도가 정말 O(1)인가요?",
  "B-Tree와 비교했을 때 강점은?",
];

/* ─────────── component ─────────── */

export function Wizard() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>(Array(STEPS.length).fill(""));
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const current = STEPS[step];
  const progress = (step + 1) / STEPS.length;

  useEffect(() => {
    if (current?.type === "text") {
      inputRef.current?.focus();
    }
  }, [step, current?.type]);

  function setAnswer(value: string) {
    setAnswers((prev) => {
      const next = [...prev];
      next[step] = value;
      return next;
    });
  }

  function next() {
    if (!answers[step]?.trim()) return;
    if (step === STEPS.length - 1) {
      setDone(true);
    } else {
      setStep(step + 1);
    }
  }

  function back() {
    if (step === 0) return;
    setStep(step - 1);
  }

  function reset() {
    setStep(0);
    setAnswers(Array(STEPS.length).fill(""));
    setDone(false);
  }

  function pick(choice: string) {
    setAnswer(choice);
    setTimeout(() => {
      if (step === STEPS.length - 1) {
        setDone(true);
      } else {
        setStep(step + 1);
      }
    }, 120);
  }

  if (done) {
    return <Result answers={answers} onReset={reset} />;
  }

  return (
    <div>
      {/* 진행 바 */}
      <div className="flex items-center gap-3 text-[11px] wght-560 kerning-mono uppercase">
        <span className="tabular-nums text-[var(--color-fg)]">
          {String(current.num).padStart(2, "0")}
        </span>
        <div className="relative h-px flex-1 bg-[var(--color-line)]">
          <div
            className="absolute inset-y-0 left-0 bg-[var(--color-fg-strong)] transition-all duration-[var(--duration-base)]"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <span className="tabular-nums text-[var(--color-fg-subtle)]">
          {String(STEPS.length).padStart(2, "0")}
        </span>
      </div>

      {/* 단계 라벨들 */}
      <ul className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-[11px] wght-450 kerning-tight">
        {STEPS.map((s, i) => (
          <li
            key={s.num}
            className={cn(
              "inline-flex items-center gap-1",
              i === step
                ? "wght-560 text-[var(--color-fg-strong)]"
                : i < step
                  ? "text-[var(--color-fg-muted)]"
                  : "text-[var(--color-fg-subtle)]"
            )}
          >
            {i < step && <CheckIcon />}
            {s.label}
            {i < STEPS.length - 1 && (
              <span className="ml-3 text-[var(--color-line-strong)]">·</span>
            )}
          </li>
        ))}
      </ul>

      {/* 질문 */}
      <h2 className="mt-10 text-[24px] leading-[1.3] kerning-tight wght-700 text-[var(--color-fg-strong)] sm:text-[28px]">
        {current.question}
      </h2>
      <p className="mt-2 text-[13.5px] wght-450 kerning-tight text-[var(--color-fg-muted)] sm:text-[14px]">
        {current.hint}
      </p>

      {/* 입력 영역 */}
      <div className="mt-8">
        {current.type === "text" ? (
          <input
            ref={inputRef}
            type="text"
            value={answers[step]}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") next();
            }}
            placeholder={current.placeholder}
            className="w-full border-b border-[var(--color-line-strong)] bg-transparent pb-2 text-[18px] wght-560 kerning-tight text-[var(--color-fg-strong)] placeholder:wght-380 placeholder:text-[var(--color-fg-disabled)] focus:border-[var(--color-accent)] focus-visible:outline-none sm:text-[20px]"
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {current.choices!.map((c) => {
              const picked = answers[step] === c;
              return (
                <li key={c}>
                  <button
                    type="button"
                    onClick={() => pick(c)}
                    className={cn(
                      "group flex w-full items-baseline gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-[var(--duration-fast)]",
                      picked
                        ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                        : "border-[var(--color-line)] hover:border-[var(--color-fg-disabled)] hover:bg-[var(--color-surface)]"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] wght-700 kerning-tight transition-colors",
                        picked
                          ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                          : "border-[var(--color-line-strong)] text-[var(--color-fg-subtle)] group-hover:border-[var(--color-fg-disabled)]"
                      )}
                    >
                      {picked ? "✓" : ""}
                    </span>
                    <span
                      className={cn(
                        "flex-1 text-[14px] kerning-tight sm:text-[14.5px]",
                        picked
                          ? "wght-560 text-[var(--color-accent-strong)]"
                          : "wght-450 text-[var(--color-fg)]"
                      )}
                    >
                      {c}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 액션 */}
      <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2">
        {current.type === "text" && (
          <button
            type="button"
            onClick={next}
            disabled={!answers[step]?.trim()}
            className={cn(
              "group inline-flex items-baseline gap-1.5 text-[14px] wght-560 kerning-tight transition-colors",
              answers[step]?.trim()
                ? "text-[var(--color-accent)] hover:text-[var(--color-accent-strong)]"
                : "cursor-not-allowed text-[var(--color-fg-disabled)]"
            )}
          >
            <span
              className={cn(
                "border-b pb-px",
                answers[step]?.trim()
                  ? "border-[var(--color-accent)]/40 group-hover:border-[var(--color-accent-strong)]"
                  : "border-transparent"
              )}
            >
              {step === STEPS.length - 1 ? "결과 보기" : "다음 단계"}
            </span>
            <Arrow className="text-[14px] transition-transform group-hover:translate-x-0.5" />
          </button>
        )}

        {step > 0 && (
          <button
            type="button"
            onClick={back}
            className="text-[12.5px] wght-450 kerning-tight text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
          >
            이전
          </button>
        )}

        {current.type === "text" && (
          <span className="ml-auto hidden items-center gap-1.5 text-[11px] wght-450 kerning-tight text-[var(--color-fg-subtle)] sm:inline-flex">
            <Kbd>Enter</Kbd>
            다음
          </span>
        )}
      </div>
    </div>
  );
}

/* ─────────── result ─────────── */

function Result({
  answers,
  onReset,
}: {
  answers: string[];
  onReset: () => void;
}) {
  return (
    <div className="fade-up">
      {/* 헤더 */}
      <div className="flex items-baseline justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-success)]/10 px-2.5 py-1 text-[10.5px] wght-700 kerning-mono uppercase text-[var(--color-success)]">
          <CheckIcon />
          만들어졌어요
        </span>
        <button
          type="button"
          onClick={onReset}
          className="text-[12px] wght-450 kerning-tight text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
        >
          다시 만들기
        </button>
      </div>

      {/* 입력 요약 — 작게 */}
      <ul className="mt-5 flex flex-col gap-1.5 border-l-2 border-[var(--color-line-strong)] pl-4 text-[12px] wght-450 kerning-tight text-[var(--color-fg-muted)]">
        {STEPS.map((s, i) => (
          <li key={s.num} className="flex gap-2">
            <span className="w-[60px] shrink-0 wght-560 text-[var(--color-fg-subtle)]">
              {s.label}
            </span>
            <span className="text-[var(--color-fg)]">{answers[i]}</span>
          </li>
        ))}
      </ul>

      {/* 구조 */}
      <h2 className="mt-10 text-[12px] wght-560 kerning-mono uppercase text-[var(--color-fg-subtle)]">
        슬라이드 구조 · {OUTLINE.length}장
      </h2>
      <ol className="mt-4 flex flex-col gap-4">
        {OUTLINE.map((s) => (
          <li key={s.num} className="flex gap-4">
            <span className="w-7 shrink-0 text-[20px] wght-700 kerning-tight tabular-nums text-[var(--color-fg-disabled)]">
              {String(s.num).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-[15px] wght-700 kerning-tight text-[var(--color-fg-strong)] sm:text-[15.5px]">
                  {s.title}
                </h3>
                <span className="shrink-0 text-[10.5px] wght-560 kerning-mono uppercase tabular-nums text-[var(--color-fg-subtle)]">
                  {s.duration}
                </span>
              </div>
              <ul className="mt-1.5 flex flex-col gap-0.5 text-[13px] leading-[1.55] wght-450 kerning-tight text-[var(--color-fg)]">
                {s.bullets.map((b, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-[var(--color-fg-disabled)]">·</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              {s.source && (
                <p className="mt-1.5 text-[10.5px] wght-500 kerning-mono uppercase text-[var(--color-fg-subtle)]">
                  근거 · {s.source}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>

      <Divider className="my-10" />

      {/* 예상 질문 */}
      <h2 className="text-[12px] wght-560 kerning-mono uppercase text-[var(--color-fg-subtle)]">
        예상 질문 · {QUESTIONS.length}개
      </h2>
      <ul className="mt-4 flex flex-col gap-3">
        {QUESTIONS.map((q, i) => (
          <li
            key={i}
            className="flex gap-3 text-[13.5px] leading-[1.6] kerning-tight"
          >
            <span className="shrink-0 wght-700 tabular-nums text-[var(--color-fg-disabled)]">
              Q{i + 1}
            </span>
            <span className="wght-450 text-[var(--color-fg)]">{q}</span>
          </li>
        ))}
      </ul>

    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
      <path
        d="M2 5.2l2 2L8 3"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
