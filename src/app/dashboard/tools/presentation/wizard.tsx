"use client";

import { useEffect, useRef, useState } from "react";
import { Kbd } from "@/components/primitives";
import { WizardWatermark } from "@/components/wizard-shell";
import { cn } from "@/lib/utils";

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
    bullets: ["BST의 최악 시간 복잡도 O(n)", "데이터가 정렬돼서 들어올 때의 함정"],
    duration: "1분",
  },
  {
    num: 2,
    title: "AVL 트리 — 엄격한 균형",
    bullets: ["Balance Factor 정의", "회전 4가지 (LL · LR · RR · RL)"],
    duration: "3분",
    source: "자료구조 4주차 · 18p",
  },
  {
    num: 3,
    title: "Red-Black 트리 — 느슨한 균형",
    bullets: ["5가지 속성과 의미", "왜 실무에서 더 자주 쓰이나"],
    duration: "3분",
    source: "자료구조 4주차 · 24p",
  },
  {
    num: 4,
    title: "사례 분석 — Linux CFS 스케줄러",
    bullets: ["Red-Black 트리를 어떻게 쓰는가", "선택의 근거"],
    duration: "2분",
    source: "자료구조 5장 · 7p",
  },
  {
    num: 5,
    title: "정리 + Q&A",
    bullets: ["핵심 한 줄 요약", "예상 질문 3개"],
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
    <div className="rounded-[18px] bg-white p-7 sm:p-10">
      {/* 진행 바 */}
      <div
        className="flex items-center gap-3 text-[12px] wght-560"
        style={{ letterSpacing: "-0.012em" }}
      >
        <span className="tabular-nums text-[var(--color-apple-ink)]">
          {String(current.num).padStart(2, "0")}
        </span>
        <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-[var(--color-apple-hairline)]">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-apple-action)] transition-all duration-300"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <span className="tabular-nums text-[var(--color-apple-muted)]">
          {String(STEPS.length).padStart(2, "0")}
        </span>
      </div>

      {/* 단계 라벨들 */}
      <ul
        className="mt-5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] wght-450"
        style={{ letterSpacing: "-0.012em" }}
      >
        {STEPS.map((s, i) => (
          <li
            key={s.num}
            className={cn(
              "inline-flex items-center gap-1",
              i === step
                ? "wght-560 text-[var(--color-apple-ink)]"
                : i < step
                  ? "text-[var(--color-apple-action)]"
                  : "text-[var(--color-apple-muted)]",
            )}
          >
            {i < step && <CheckIcon />}
            {s.label}
            {i < STEPS.length - 1 && (
              <span className="ml-3 text-[var(--color-apple-hairline)]">·</span>
            )}
          </li>
        ))}
      </ul>

      {/* 질문 */}
      <h2
        className="mt-10 text-[24px] leading-[1.2] wght-620 text-[var(--color-apple-ink)] sm:text-[30px]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {current.question}
      </h2>
      <p
        className="mt-3 text-[14px] leading-[1.55] wght-450 text-[var(--color-apple-muted)] sm:text-[15px]"
        style={{ letterSpacing: "-0.022em" }}
      >
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
            className="w-full border-b border-[var(--color-apple-hairline)] bg-transparent pb-3 text-[18px] wght-560 text-[var(--color-apple-ink)] placeholder:wght-450 placeholder:text-[var(--color-apple-muted)] focus:border-[var(--color-apple-action)] focus-visible:outline-none sm:text-[20px]"
            style={{ letterSpacing: "-0.012em" }}
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
                      "group flex w-full items-center gap-3 rounded-[12px] border px-4 py-3.5 text-left transition-colors",
                      picked
                        ? "border-[var(--color-apple-action)] bg-[#f0f7ff]"
                        : "border-[var(--color-apple-hairline-soft)] bg-white hover:border-[var(--color-apple-hairline)] hover:bg-[var(--color-apple-pearl)]",
                    )}
                    style={{ letterSpacing: "-0.012em" }}
                  >
                    <span
                      className={cn(
                        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] wght-700 transition-colors",
                        picked
                          ? "border-[var(--color-apple-action)] bg-[var(--color-apple-action)] text-white"
                          : "border-[var(--color-apple-hairline)] text-[var(--color-apple-muted)]",
                      )}
                    >
                      {picked ? "✓" : ""}
                    </span>
                    <span
                      className={cn(
                        "flex-1 text-[14px] sm:text-[15px]",
                        picked
                          ? "wght-560 text-[var(--color-apple-action)]"
                          : "wght-450 text-[var(--color-apple-ink)]",
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
      <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-2">
        {current.type === "text" && (
          <button
            type="button"
            onClick={next}
            disabled={!answers[step]?.trim()}
            className={cn(
              "group inline-flex h-[44px] items-center justify-center rounded-full px-6 text-[14px] wght-560 transition-all duration-150 active:scale-[0.97]",
              answers[step]?.trim()
                ? "bg-[var(--color-apple-action)] text-white hover:bg-[var(--color-apple-action-hover)]"
                : "cursor-not-allowed bg-[var(--color-apple-hairline)] text-white",
            )}
            style={{ letterSpacing: "-0.012em" }}
          >
            {step === STEPS.length - 1 ? "결과 보기" : "다음 단계"}
            <span className="ml-1.5 transition-transform group-hover:translate-x-0.5">›</span>
          </button>
        )}

        {step > 0 && (
          <button
            type="button"
            onClick={back}
            className="text-[13px] wght-450 text-[var(--color-apple-muted)] hover:text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            이전
          </button>
        )}

        {current.type === "text" && (
          <span
            className="ml-auto hidden items-center gap-1.5 text-[11px] wght-450 text-[var(--color-apple-muted)] sm:inline-flex"
            style={{ letterSpacing: "-0.012em" }}
          >
            <Kbd>Enter</Kbd>
            다음
          </span>
        )}
      </div>
    </div>
  );
}

/* ─────────── result ─────────── */

function Result({ answers, onReset }: { answers: string[]; onReset: () => void }) {
  return (
    <div className="fade-up rounded-[18px] bg-white p-7 sm:p-10">
      {/* 헤더 */}
      <div className="flex items-baseline justify-between gap-3">
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-apple-pearl)] px-2.5 py-1 text-[11px] wght-560 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          예고 · 준비 중
        </span>
        <button
          type="button"
          onClick={onReset}
          className="text-[13px] wght-450 text-[var(--color-apple-muted)] hover:text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          처음으로
        </button>
      </div>

      {/* 안내 — 아직 AI 호출이 연결되지 않은 미리보기 */}
      <p
        className="mt-4 rounded-[12px] bg-[var(--color-apple-pearl)] px-4 py-3 text-[12.5px] leading-[1.55] wght-450 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        아래는 발표 위저드가 어떤 구조로 나올지 보여주는 예고 화면이에요. 입력하신 답변은 아직 AI로 보내지지 않고, 표시되는 슬라이드·질문은 고정된 샘플입니다. 실제 생성은 곧 열어드릴게요.
      </p>

      {/* 입력 요약 */}
      <ul className="mt-6 flex flex-col gap-2 rounded-[12px] bg-[var(--color-apple-pearl)] px-4 py-4">
        {STEPS.map((s, i) => (
          <li
            key={s.num}
            className="flex gap-3 text-[12.5px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            <span className="w-[60px] shrink-0 wght-560 text-[var(--color-apple-muted)]">
              {s.label}
            </span>
            <span className="wght-450 text-[var(--color-apple-ink)]">{answers[i]}</span>
          </li>
        ))}
      </ul>

      {/* 구조 */}
      <h2 className="mt-10 text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
        슬라이드 구조 · {OUTLINE.length}장
      </h2>
      <ol className="mt-5 flex flex-col gap-5">
        {OUTLINE.map((s) => (
          <li key={s.num} className="flex gap-4">
            <span
              className="w-8 shrink-0 text-[22px] wght-620 tabular-nums text-[var(--color-apple-hairline)]"
              style={{ letterSpacing: "-0.024em" }}
            >
              {String(s.num).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <h3
                  className="text-[15px] wght-560 text-[var(--color-apple-ink)] sm:text-[16px]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  {s.title}
                </h3>
                <span
                  className="shrink-0 text-[11px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  {s.duration}
                </span>
              </div>
              <ul
                className="mt-2 flex flex-col gap-1 text-[13px] leading-[1.55] wght-450 text-[var(--color-apple-ink)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                {s.bullets.map((b, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-[10px] h-1 w-1 shrink-0 rounded-full bg-[var(--color-apple-muted)]" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              {s.source && (
                <p
                  className="mt-2 text-[11px] wght-450 text-[var(--color-apple-muted)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  근거 · {s.source}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>

      <hr className="my-10 border-[var(--color-apple-hairline-soft)]" />

      {/* 예상 질문 */}
      <h2 className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
        예상 질문 · {QUESTIONS.length}개
      </h2>
      <ul className="mt-5 flex flex-col gap-3.5">
        {QUESTIONS.map((q, i) => (
          <li
            key={i}
            className="flex gap-3 text-[13.5px] leading-[1.6]"
            style={{ letterSpacing: "-0.012em" }}
          >
            <span className="shrink-0 wght-560 tabular-nums text-[var(--color-apple-muted)]">
              Q{i + 1}
            </span>
            <span className="wght-450 text-[var(--color-apple-ink)]">{q}</span>
          </li>
        ))}
      </ul>

      <WizardWatermark modelText="이 자료는 학습 보조용이며 본인이 다시 검토·수정해야 학습이 완성돼요. (현재 화면은 샘플 예고)" />
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
