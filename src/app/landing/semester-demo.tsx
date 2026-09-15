"use client";

import { ArrowRight, Check, CheckCheck, FileText, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import styles from "./landing.module.css";

const STEPS = [
  { id: "schedule", label: "일정 확인", file: "자료구조_강의계획서.pdf" },
  { id: "summary", label: "요약 읽기", file: "자료구조_04_스택과큐.pdf" },
  { id: "quiz", label: "문제 풀기", file: "자료구조_04_스택과큐.pdf" },
] as const;
const ANSWERS = ["가장 먼저 넣은 데이터", "가장 나중에 넣은 데이터"] as const;

/** Public sample, isolated from account data. Changes stay in this component. */
export function SemesterDemo() {
  const [activeStep, setActiveStep] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [answer, setAnswer] = useState<number | null>(null);
  const firstAnswerRef = useRef<HTMLButtonElement>(null);
  const step = STEPS[activeStep];

  return (
    <div className={styles.demoStage}>
      <div className={styles.demoAnnotation}>
        <span aria-hidden>↙</span> 가입 전에, 직접 눌러보세요
      </div>
      <div className={styles.demoSheet}>
        <div className={styles.demoMasthead}>
          <span className={styles.demoWordmark}>my semester</span>
          <span className={styles.demoSample}>체험용 예시</span>
        </div>
        <div className={styles.demoTabs} role="tablist" aria-label="학습 흐름 체험">
          {STEPS.map((item, index) => (
            <button
              key={item.id}
              id={`demo-tab-${item.id}`}
              role="tab"
              type="button"
              aria-selected={activeStep === index}
              aria-controls={`demo-panel-${item.id}`}
              tabIndex={activeStep === index ? 0 : -1}
              onClick={() => setActiveStep(index)}
              onKeyDown={(event) => {
                let next = index;
                if (event.key === "ArrowRight") next = (index + 1) % STEPS.length;
                else if (event.key === "ArrowLeft")
                  next = (index + STEPS.length - 1) % STEPS.length;
                else if (event.key === "Home") next = 0;
                else if (event.key === "End") next = STEPS.length - 1;
                else return;
                event.preventDefault();
                setActiveStep(next);
                const nextTab = event.currentTarget.parentElement?.children[next];
                if (nextTab instanceof HTMLElement) nextTab.focus();
              }}
            >
              <span className={styles.demoTabNumber}>0{index + 1}</span>
              {item.label}
            </button>
          ))}
        </div>
        {STEPS.map((item, index) => (
          <div
            key={item.id}
            role="tabpanel"
            id={`demo-panel-${item.id}`}
            aria-labelledby={`demo-tab-${item.id}`}
            hidden={activeStep !== index}
            className={styles.demoPanel}
          >
            {index === 0 && (
              <>
                <p className={styles.demoEyebrow}>다가오는 일정</p>
                <div className={styles.demoHeadingRow}>
                  <h2 className={styles.demoHeading}>
                    놓치기 전에,
                    <br />한 번 더 확인.
                  </h2>
                  <span className={styles.calendarStamp} aria-hidden>
                    OCT<strong>21</strong>WED
                  </span>
                </div>
                <div className={styles.scheduleItem}>
                  <div>
                    <span className={styles.courseLabel}>자료구조</span>
                    <h3>중간고사</h3>
                    <p>10월 21일 · 10:00–11:00</p>
                  </div>
                  <span className={styles.sourcePage}>p.2</span>
                </div>
                <p className={styles.demoHint}>
                  강의계획서에서 찾은 일정이에요. 날짜를 확인해 주세요.
                </p>
                <button
                  type="button"
                  className={styles.demoAction}
                  data-complete={confirmed || undefined}
                  aria-pressed={confirmed}
                  onClick={() => setConfirmed(!confirmed)}
                >
                  {confirmed ? (
                    <CheckCheck size={17} aria-hidden />
                  ) : (
                    <Check size={17} aria-hidden />
                  )}
                  {confirmed ? "확인했어요 · 다시 해보기" : "일정 확인해 보기"}
                </button>
                <p className={styles.demoStatus} role="status">
                  {confirmed
                    ? "내 캘린더에는 저장되지 않는 체험이에요."
                    : "내가 확인한 일정만 저장하는 흐름"}
                </p>
              </>
            )}
            {index === 1 && (
              <>
                <p className={styles.demoEyebrow}>자료의 핵심부터</p>
                <h2 className={styles.demoHeading}>
                  길었던 자료가,
                  <br />
                  이해되는 순간.
                </h2>
                <div className={styles.summaryNote}>
                  <h3>스택과 큐, 순서의 차이</h3>
                  <p>
                    <strong>스택</strong>은 나중에 넣은 데이터부터 꺼내고,
                    <br />
                    <strong>큐</strong>는 먼저 넣은 데이터부터 꺼냅니다.
                  </p>
                  <button
                    type="button"
                    className={styles.sourceButton}
                    aria-expanded={showSource}
                    aria-controls="demo-source"
                    onClick={() => setShowSource(!showSource)}
                  >
                    <FileText size={13} aria-hidden />
                    p.6 원문 근거 {showSource ? "접기" : "보기"}
                    <ArrowRight size={13} aria-hidden />
                  </button>
                </div>
                <div id="demo-source" hidden={!showSource} className={styles.sourceExcerpt}>
                  <span>예시 원문 · 6페이지</span>
                  <p>Stack: Last In, First Out (LIFO). Queue: First In, First Out (FIFO).</p>
                </div>
                {!showSource && (
                  <p className={styles.demoHint}>페이지를 누르면 요약의 근거까지 함께 확인해요.</p>
                )}
              </>
            )}
            {index === 2 && (
              <>
                <p className={styles.demoEyebrow}>읽은 내용을 내 것으로</p>
                <h2 className={styles.demoHeading}>
                  알 것 같다면,
                  <br />한 문제만 더.
                </h2>
                <fieldset className={styles.quizOptions}>
                  <legend>스택에서 가장 먼저 꺼내는 데이터는?</legend>
                  {ANSWERS.map((option, optionIndex) => (
                    <button
                      key={option}
                      ref={optionIndex === 0 ? firstAnswerRef : undefined}
                      type="button"
                      aria-pressed={answer === optionIndex}
                      className={styles.quizOption}
                      data-correct={answer !== null && optionIndex === 1 ? true : undefined}
                      onClick={() => setAnswer(optionIndex)}
                    >
                      <span>{String.fromCharCode(65 + optionIndex)}</span>
                      {option}
                      {answer !== null && optionIndex === 1 && <Check size={15} aria-hidden />}
                    </button>
                  ))}
                </fieldset>
                <div className={styles.quizFeedback} role="status">
                  {answer === null ? (
                    <p>답을 골라보세요. 바로 해설을 확인할 수 있어요.</p>
                  ) : (
                    <>
                      <p>
                        <strong>{answer === 1 ? "맞았어요!" : "헷갈려도 괜찮아요."}</strong> 스택은
                        후입선출(LIFO), 나중에 들어온 데이터부터 꺼냅니다.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setAnswer(null);
                          firstAnswerRef.current?.focus();
                        }}
                        aria-label="문제 다시 풀기"
                      >
                        <RotateCcw size={14} aria-hidden />
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
        <div className={styles.demoSourceBar}>
          <FileText size={15} aria-hidden />
          <span>{step.file}</span>
          <span className={styles.demoSourceLabel}>내 자료에서 시작</span>
        </div>
      </div>
      <div className={styles.demoCaption}>
        <span>자료에서 시작해, 내 공부로 이어지는 흐름</span>
        <span aria-hidden>01 — 03</span>
      </div>
    </div>
  );
}
