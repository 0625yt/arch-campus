import Link from "next/link";

/**
 * Trust + 마무리 CTA.
 */
export function TrustSection({
  startHref,
  startLabel,
}: {
  startHref: string;
  startLabel: string;
}) {
  return (
    <section id="trust" className="px-5 py-20 sm:px-8 sm:py-28 lg:px-12">
      <div className="mx-auto max-w-[1180px]">
        <div className="text-center">
          <p
            className="text-[11px] wght-700 uppercase tracking-[0.08em]"
            style={{ color: "var(--color-apple-action)" }}
          >
            Trust
          </p>
          <h2
            className="mx-auto mt-3 max-w-[720px] text-[32px] leading-[1.08] wght-700 sm:text-[48px]"
            style={{
              color: "var(--color-landing-text-strong)",
              letterSpacing: "-0.022em",
            }}
          >
            대신 써주지 않습니다.
            <br />
            <span style={{ color: "var(--color-apple-action)" }}>막혔을 때</span>만 거듭니다.
          </h2>
          <p
            className="mx-auto mt-6 max-w-[600px] text-[15px] leading-[1.6] wght-450 sm:text-[16px]"
            style={{ color: "var(--color-landing-text-muted)" }}
          >
            본문 작성·시험 풀이는 본인이 합니다. arch는 구조·체크리스트·복습 큐만 잡습니다.
            결과물엔 학습 보조 워터마크가 박힙니다.
          </p>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-3">
          <TrustTile title="자료에서 시작" body="강의자료·강의계획서·시간표 한 장이면 충분" />
          <TrustTile title="확인 후 추가" body="AI가 추출한 일정·요약은 본인이 보고 확정" />
          <TrustTile title="과목별 누적" body="자료가 쌓일수록 시험 직전 복습이 단단해짐" />
        </div>

        <div className="mt-16 flex flex-col items-center gap-3">
          <Link
            href={startHref}
            className="spring-press inline-flex h-[56px] items-center justify-center rounded-full bg-[var(--color-apple-action)] px-10 text-[15px] wght-700 text-white shadow-[0_18px_42px_-14px_rgba(0,113,227,0.6)] transition-all hover:bg-[var(--color-apple-action-hover)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {startLabel}
          </Link>
          <p
            className="text-[12.5px] wght-450"
            style={{ color: "var(--color-landing-text-muted)" }}
          >
            구글 계정 10초 시작 · 카드 없음
          </p>
        </div>
      </div>
    </section>
  );
}

function TrustTile({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="rounded-[14px] border p-6 backdrop-blur-xl"
      style={{
        borderColor: "var(--color-landing-hairline)",
        background: "var(--color-landing-card)",
      }}
    >
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-[var(--color-apple-success)]" />
        <p
          className="text-[15px] wght-700"
          style={{
            color: "var(--color-landing-text-strong)",
            letterSpacing: "-0.012em",
          }}
        >
          {title}
        </p>
      </div>
      <p
        className="mt-3 text-[13px] leading-[1.6] wght-450"
        style={{ color: "var(--color-landing-text-muted)" }}
      >
        {body}
      </p>
    </div>
  );
}
