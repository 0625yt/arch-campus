"use client";

/**
 * 추출 신뢰도 배지 — syllabus·timetable HITL 단계 공용.
 *
 * 톤 분기 (NEXT-STEPS.md §3-2):
 *   - ≥0.9: 평소처럼, 초록 점 + "확실" — 사용자 그냥 통과
 *   - 0.7~0.9: 노란 점 + "확인 필요" — 한 번 훑어보길 권유
 *   - <0.7: 빨간 점 + "추정" — 강하게 검수 권유, 저장 전 dialog
 *
 * 디자인:
 *   - 점·퍼센트·라벨이 한 줄. 모바일은 라벨 숨김(좁아서).
 *   - 점은 1.5px 원형. 색만 변하고 모양은 같아 시각적 혼란 없음.
 *   - 색은 var(--color-*) 토큰 사용 — 한 가지라도 잘못 박아 빌드 깨지지 않게 디자인 시스템 따라간다.
 */
export function ConfidenceBadge({ value }: { value: number }) {
  const tone: "high" | "mid" | "low" = value >= 0.9 ? "high" : value >= 0.7 ? "mid" : "low";

  const dotCls =
    tone === "high"
      ? "bg-[var(--color-apple-success)]"
      : tone === "mid"
        ? "bg-[var(--color-apple-warn-ink)]"
        : "bg-[var(--color-urgent)]";

  const textCls =
    tone === "high"
      ? "text-[var(--color-apple-success)]"
      : tone === "mid"
        ? "text-[var(--color-apple-warn-ink)]"
        : "text-[var(--color-urgent)]";

  const label = tone === "high" ? "확실" : tone === "mid" ? "확인 필요" : "추정";

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10.5px] wght-560 ${textCls}`}
      style={{ letterSpacing: "0.04em" }}
    >
      <span aria-hidden className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${dotCls}`} />
      <span className="tabular-nums">{Math.round(value * 100)}%</span>
      <span className="hidden sm:inline">·</span>
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}

/**
 * confidence 분포 통계 — 카운터 UI에 박을 N건.
 *   - 0.7 미만 = 추정(빨강)
 *   - 0.7 이상 0.9 미만 = 확인 필요(노랑)
 *   - 0.9 이상 = 확실(초록)
 */
export function countByConfidence(values: number[]): {
  high: number;
  mid: number;
  low: number;
} {
  let high = 0;
  let mid = 0;
  let low = 0;
  for (const v of values) {
    if (v >= 0.9) high++;
    else if (v >= 0.7) mid++;
    else low++;
  }
  return { high, mid, low };
}
