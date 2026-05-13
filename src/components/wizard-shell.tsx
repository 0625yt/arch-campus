import { WATERMARK } from "@/lib/schemas";

/**
 * 위저드 결과 화면 공통 푸터.
 *
 * AI가 만든 모든 결과물(요약·문제·발표·벼락치기·과제·자기소개서…) 끝에 일관되게 박힌다.
 *
 * 정책:
 *  - 모델 출력의 watermark가 schemas.WATERMARK("이 자료는 학습 보조용이며")를
 *    포함하면 그대로 표시.
 *  - 안 포함하거나 비어있으면 코드 상수로 fallback — 학칙·치팅 라인 보호 (CLAUDE.md §4).
 */
export function WizardWatermark({ modelText }: { modelText?: string | null }) {
  const safe = modelText && modelText.includes(WATERMARK)
    ? modelText
    : `${WATERMARK} 본인이 다시 검토·수정해야 학습이 완성돼요.`;
  return (
    <p
      className="mt-2 text-[11px] wght-450 italic leading-[1.55] text-[var(--color-apple-muted)]"
      style={{ letterSpacing: "-0.012em" }}
    >
      {safe}
    </p>
  );
}

/**
 * 위저드 결과 화면을 묶는 공통 컨테이너.
 * 안에 자유 마크업 + 결과 카드들 + (선택) 공용 워터마크.
 */
export function WizardResultShell({
  title,
  subtitle,
  children,
  watermark,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** 모델이 만든 워터마크. 없거나 형식 위반이면 안전 fallback. */
  watermark?: string | null;
}) {
  return (
    <section className="flex flex-col gap-6 fade-up">
      <header className="rounded-[18px] bg-white p-7 sm:p-9">
        <p
          className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-action)]"
        >
          결과
        </p>
        <h2
          className="mt-3 text-[24px] leading-[1.2] wght-620 text-[var(--color-apple-ink)] sm:text-[28px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {title}
        </h2>
        {subtitle && (
          <p
            className="mt-2 text-[13.5px] wght-450 leading-[1.55] text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {subtitle}
          </p>
        )}
      </header>

      {children}

      <WizardWatermark modelText={watermark} />
    </section>
  );
}
