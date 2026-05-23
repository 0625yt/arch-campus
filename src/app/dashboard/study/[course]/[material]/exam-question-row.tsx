"use client";

import { useState } from "react";
import type { ExamExtractedQuestionT } from "@/lib/schemas";

/**
 * 기출 추출 결과의 한 문제 행 — 치팅 라인 §4 정답 노출 게이트.
 *
 * 사활:
 *   - 자료 PDF에 답이 있다고 해서 자동으로 보여주면 "PDF 한 장 올리고 정답 받는 앱" = Gauth.
 *   - 학생이 "내 답 입력" 또는 "정답 보기" 의사를 명시해야 정답·해설 노출.
 *   - "정답 보기"는 마지막 수단 — 우선은 자기 답을 적게 유도.
 *
 * 상태:
 *   - revealed=false  (기본): stem·choices만 노출, answer·explanation 가림
 *   - 사용자 답 입력 후 "확인" 클릭 → revealed=true → 정답·해설 노출
 *   - "그냥 정답 보기" (탈출구) 클릭 → revealed=true (단, 자기 답 입력 안 한 행은 시각적 구분)
 *
 * needsManualCheck=true면 시각적으로 ⚠ 표시: "AI가 자신 없음, 본인이 확인 필요".
 */
export function ExamQuestionRow({ q }: { q: ExamExtractedQuestionT }) {
  const [myAnswer, setMyAnswer] = useState<string>("");
  const [revealed, setRevealed] = useState(false);
  const [revealedWithoutAnswer, setRevealedWithoutAnswer] = useState(false);

  function reveal(withAnswer: boolean) {
    setRevealed(true);
    setRevealedWithoutAnswer(!withAnswer);
  }

  const isMC = q.kind === "multiple-choice";
  const isCorrect =
    revealed && isMC && q.answer != null && myAnswer.trim().toUpperCase() === q.answer;

  return (
    <article
      className="elev-1 rounded-[12px] bg-white p-5 sm:p-6"
      style={{
        ["--ribbon-color" as string]: q.needsManualCheck
          ? "var(--color-apple-muted)"
          : "var(--color-urgent)",
      }}
    >
      <div className="flex items-baseline gap-3">
        <span
          className="text-[11px] wght-620 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "0.06em" }}
        >
          문제 {q.id} · {kindLabel(q.kind)}
        </span>
        {q.sourcePageNum != null && (
          <span
            className="text-[11px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            p.{q.sourcePageNum}
          </span>
        )}
        {q.needsManualCheck && (
          <span
            className="text-[11px] wght-560 text-[var(--color-apple-action)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            ⚠ 확인 필요
          </span>
        )}
      </div>

      <p
        className="mt-3 whitespace-pre-wrap text-[15px] leading-[1.6] wght-560 text-[var(--color-apple-ink)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {q.stem}
      </p>

      {/* 객관식 보기 */}
      {isMC && q.choices && (
        <ul className="mt-4 flex flex-col gap-1.5">
          {q.choices.map((c) => {
            const selected = myAnswer === c.key;
            const isAnswerKey = revealed && q.answer === c.key;
            return (
              <li key={c.key}>
                <button
                  type="button"
                  onClick={() => !revealed && setMyAnswer(c.key)}
                  disabled={revealed}
                  className={`flex w-full items-baseline gap-3 rounded-[8px] border px-3 py-2 text-left text-[13.5px] leading-[1.5] transition-colors ${
                    isAnswerKey
                      ? "border-[var(--color-apple-action)] bg-[var(--color-apple-action-soft)]"
                      : selected
                        ? "border-[var(--color-apple-ink)] bg-[var(--color-apple-pearl)]"
                        : "border-[var(--color-apple-hairline)] bg-white hover:border-[var(--color-apple-ink)]/30"
                  }`}
                  style={{ letterSpacing: "-0.012em" }}
                >
                  <span
                    className={`shrink-0 text-[12px] wght-620 ${
                      isAnswerKey
                        ? "text-[var(--color-apple-action)]"
                        : "text-[var(--color-apple-muted)]"
                    }`}
                  >
                    {c.key}.
                  </span>
                  <span className="text-[var(--color-apple-ink)]">{c.text}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* 단답형·서술형 입력 */}
      {!isMC && !revealed && (
        <div className="mt-4">
          <textarea
            value={myAnswer}
            onChange={(e) => setMyAnswer(e.target.value)}
            rows={q.kind === "essay" ? 4 : 1}
            placeholder={q.kind === "short-answer" ? "정답을 적어보세요" : "본인 답안을 적어보세요"}
            className="w-full resize-none rounded-[8px] border border-[var(--color-apple-hairline)] bg-white px-3 py-2 text-[14px] leading-[1.5] wght-450 text-[var(--color-apple-ink)] outline-none focus:border-[var(--color-apple-action)] placeholder:text-[var(--color-apple-muted)]/55"
            style={{ letterSpacing: "-0.012em" }}
          />
        </div>
      )}

      {/* 액션 — revealed=false면 두 가지 진입로 */}
      {!revealed && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => reveal(true)}
            disabled={!myAnswer.trim()}
            className="inline-flex items-center rounded-full bg-[var(--color-apple-ink)] px-4 py-1.5 text-[13px] wght-560 text-white transition-opacity hover:opacity-90 disabled:opacity-30"
            style={{ letterSpacing: "-0.012em" }}
          >
            확인
          </button>
          <button
            type="button"
            onClick={() => reveal(false)}
            className="text-[12.5px] wght-450 text-[var(--color-apple-muted)] hover:text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            그냥 정답 보기
          </button>
        </div>
      )}

      {/* 정답·해설 — revealed 시에만 */}
      {revealed && (
        <div className="mt-5 border-t border-[var(--color-apple-hairline-soft)] pt-4">
          {/* 본인 답 입력 안 했으면 안내 한 줄 — 객관식·서술형 둘 다 노출 */}
          {revealedWithoutAnswer && (
            <p
              className="mb-3 text-[11.5px] wght-450 text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              본인 답 없이 정답을 봤어요. 다음엔 적어보고 비교하는 게 학습에 더 도움 돼요.
            </p>
          )}

          {/* 객관식이면 정답 키, 그 외엔 정답 텍스트 */}
          {q.answer != null ? (
            <>
              <p
                className="text-[11px] wght-620 uppercase tracking-[0.06em]"
                style={{ letterSpacing: "0.06em", color: "var(--color-apple-action)" }}
              >
                정답
              </p>
              <p
                className="mt-1 text-[14px] leading-[1.6] wght-560 text-[var(--color-apple-ink)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                {q.answer}
                {isMC && myAnswer && (
                  <span
                    className={`ml-2 text-[12px] wght-560 ${
                      isCorrect ? "text-[var(--color-apple-success)]" : "text-[var(--color-urgent)]"
                    }`}
                  >
                    {isCorrect ? "✓ 맞췄어요" : `✗ 본인 답: ${myAnswer}`}
                  </span>
                )}
              </p>
            </>
          ) : (
            <p
              className="text-[12.5px] wght-450 text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              자료에 정답이 명시되어 있지 않아요. 본인이 자료를 다시 확인해 주세요.
            </p>
          )}

          {q.explanation && (
            <>
              <p
                className="mt-4 text-[11px] wght-620 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]"
                style={{ letterSpacing: "0.06em" }}
              >
                해설
              </p>
              <p
                className="mt-1 whitespace-pre-wrap text-[13.5px] leading-[1.65] wght-450 text-[var(--color-apple-ink)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                {q.explanation}
              </p>
            </>
          )}
        </div>
      )}
    </article>
  );
}

function kindLabel(kind: ExamExtractedQuestionT["kind"]): string {
  if (kind === "multiple-choice") return "객관식";
  if (kind === "short-answer") return "단답형";
  return "서술형";
}
