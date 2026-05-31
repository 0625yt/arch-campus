"use client";

import { useState } from "react";
import { SummarizeNowButton } from "./summarize-now-button";

/**
 * 요약이 이미 만들어진 상태에서 "다시 요약"하기 위한 가벼운 입력 패널.
 *
 * UX 의도:
 *   - 요약 다 읽고 자연스럽게 스크롤한 위치에 등장 — 강요 X, "더 원하면 여기"
 *   - 빈 상태(EmptySummary)·에러 상태(SummaryErrorCard)와는 별개 — 거긴 styles picker 있음
 *   - 여긴 styles 안 받음 — 이미 한 번 요약된 상태에서 톤만 미세 조정하려는 흐름
 *   - 자료 안 강조 조정만 — 자료 밖 생성은 서버 가드(intentNote 120자 cap + 프롬프트)가 거부
 *
 * 비용:
 *   - SummarizeNowButton이 그대로 호출 — POST /api/materials/{id}/summarize
 *   - 모델은 §1 모델 라우팅대로 Haiku (summarize tier). 1회당 ~$0.001.
 *   - 학생이 5번씩 누르면 누적되지만 rate limit이 ai 버킷 막아준다.
 */
export function ResummarizePanel({
  materialId,
  className,
}: {
  materialId: string;
  className?: string;
}) {
  const [intentNote, setIntentNote] = useState("");
  const trimmed = intentNote.trim();

  return (
    <section className={className}>
      <div className="elev-1 rounded-[18px] bg-white px-7 py-7 sm:px-10 sm:py-8">
        <h3
          className="text-[11px] wght-700 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "0.06em" }}
        >
          요약 다시 요청
        </h3>
        <p
          className="mt-2 text-[14px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.022em" }}
        >
          원하시는 방향에 맞게 요청해주세요. 자료 안에서 강조할 지점만 적어주세요.
        </p>
        <input
          type="text"
          value={intentNote}
          onChange={(e) => setIntentNote(e.target.value.slice(0, 120))}
          placeholder="예: 시험 직전 정리, 표 위주, 예문은 영어 그대로"
          className="mt-4 w-full rounded-full border border-[var(--color-apple-hairline)] bg-white px-4 py-2.5 text-[13.5px] wght-450 text-[var(--color-apple-ink)] outline-none focus:border-[var(--color-apple-action)] placeholder:text-[var(--color-apple-muted)]/55"
          style={{ letterSpacing: "-0.012em" }}
        />
        <div className="mt-5 flex items-center justify-between gap-3">
          <p
            className="text-[11px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {trimmed.length}/120
          </p>
          <SummarizeNowButton materialId={materialId} intentNote={trimmed || undefined} />
        </div>
      </div>
    </section>
  );
}
