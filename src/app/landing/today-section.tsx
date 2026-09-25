const UPCOMING = [
  {
    title: "운영체제 5주차 복습",
    meta: "내 자료로 만든 12문제",
    time: "25분",
    color: "#7fb38c",
  },
  {
    title: "DB 발표 구조 점검",
    meta: "교수 요구사항과 내 메모 연결",
    time: "수 D-2",
    color: "#7aa6d6",
  },
] as const;

/** 랜딩에서 보여주는 Today 결과 화면. */
export function TodaySection() {
  return (
    <section
      id="flow"
      className="border-b px-5 py-20 sm:px-8 sm:py-24 lg:px-12 lg:py-28"
      style={{ borderColor: "var(--color-landing-hairline)" }}
      aria-labelledby="today-outcome-title"
    >
      <div className="mx-auto max-w-[1180px]">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end lg:gap-16">
          <div>
            <p
              className="text-[11px] wght-700 tracking-[0.08em]"
              style={{ color: "var(--color-apple-action)" }}
            >
              하루의 시작점
            </p>
            <h2
              id="today-outcome-title"
              className="mt-4 break-keep text-[36px] leading-[1.07] wght-700 sm:text-[46px] lg:text-[48px]"
              style={{
                color: "var(--color-landing-text-strong)",
                letterSpacing: "-0.03em",
              }}
            >
              그래서 매일 아침,
              <br />
              무엇부터 할지만 봅니다
            </h2>
          </div>
          <p
            className="max-w-[560px] break-keep text-[15px] leading-[1.7] wght-450 sm:text-[17px] lg:justify-self-end"
            style={{ color: "var(--color-landing-text-muted)" }}
          >
            캘린더를 뒤지고 PDF를 다시 찾는 대신, 마감·복습·발표 준비 중 지금 먼저 손대야 할 일부터
            보여줍니다
          </p>
        </div>

        <div className="fade-up mt-12 sm:mt-16">
          <div
            className="overflow-hidden rounded-[16px] border"
            style={{
              borderColor: "var(--color-landing-hairline)",
              background: "var(--color-landing-card)",
              boxShadow:
                "0 1px 2px rgba(20,20,20,0.04), 0 18px 50px -40px color-mix(in oklab, var(--color-landing-text-strong) 20%, transparent)",
            }}
          >
            <div
              className="flex min-h-14 items-center justify-between border-b px-4 sm:px-6"
              style={{ borderColor: "var(--color-landing-hairline)" }}
            >
              <div className="flex items-baseline gap-3">
                <span
                  className="text-[13px] wght-700"
                  style={{ color: "var(--color-landing-text-strong)" }}
                >
                  오늘
                </span>
                <span
                  className="text-[11px] wght-450"
                  style={{ color: "var(--color-landing-text-muted)" }}
                >
                  마감·공부·발표를 한 곳에서
                </span>
              </div>
              <span
                className="text-[10px] wght-560 tracking-[0.06em]"
                style={{ color: "var(--color-landing-text-muted)" }}
              >
                예시 화면
              </span>
            </div>

            <div className="grid lg:grid-cols-[1.04fr_0.96fr]">
              <div
                className="p-5 sm:p-8 lg:border-r lg:p-10"
                style={{ borderColor: "var(--color-landing-hairline)" }}
              >
                <div className="border-l-[3px] border-[#e0445e] pl-4 sm:pl-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <p
                      className="text-[11px] wght-700"
                      style={{ color: "var(--color-apple-action)" }}
                    >
                      지금 먼저 할 일
                    </p>
                    <span
                      className="rounded-[6px] px-2 py-1 text-[10px] wght-700 tabular-nums"
                      style={{
                        background: "var(--color-urgent-soft)",
                        color: "var(--color-landing-urgent-ink)",
                      }}
                    >
                      오늘 23:59
                    </span>
                  </div>
                  <h3
                    className="mt-5 text-[28px] leading-[1.14] wght-700 sm:text-[38px]"
                    style={{
                      color: "var(--color-landing-text-strong)",
                      letterSpacing: "-0.026em",
                    }}
                  >
                    자료구조 과제 제출
                  </h3>
                  <p
                    className="mt-4 text-[13px] leading-[1.65] wght-450 sm:text-[14px]"
                    style={{ color: "var(--color-landing-text-muted)" }}
                  >
                    강의계획서에서 추출 · 제출 조건과 마감 시각을 원문에서 확인
                  </p>
                </div>

                <div
                  className="mt-9 flex items-center justify-between border-t pt-5 text-[11px] wght-560"
                  style={{
                    borderColor: "var(--color-landing-hairline)",
                    color: "var(--color-landing-text-muted)",
                  }}
                >
                  <span>마감 확인</span>
                  <span aria-hidden>→</span>
                  <span>필요 자료</span>
                  <span aria-hidden>→</span>
                  <span>제출 전 점검</span>
                </div>
              </div>

              <div
                className="border-t p-5 sm:p-8 lg:border-t-0 lg:p-10"
                style={{ borderColor: "var(--color-landing-hairline)" }}
              >
                <p
                  className="text-[11px] wght-700"
                  style={{ color: "var(--color-landing-text-muted)" }}
                >
                  그다음으로 이어질 일
                </p>
                <div className="mt-4">
                  {UPCOMING.map((item) => (
                    <article
                      key={item.title}
                      className="grid grid-cols-[3px_1fr_auto] gap-4 border-t py-5 first:border-t-0"
                      style={{ borderColor: "var(--color-landing-hairline)" }}
                    >
                      <span className="rounded-full" style={{ background: item.color }} />
                      <div>
                        <h3
                          className="text-[14px] leading-[1.4] wght-700"
                          style={{ color: "var(--color-landing-text-strong)" }}
                        >
                          {item.title}
                        </h3>
                        <p
                          className="mt-1.5 text-[11.5px] leading-[1.5] wght-450"
                          style={{ color: "var(--color-landing-text-muted)" }}
                        >
                          {item.meta}
                        </p>
                      </div>
                      <span
                        className="pt-0.5 text-[11px] tabular-nums wght-620"
                        style={{ color: "var(--color-landing-text-muted)" }}
                      >
                        {item.time}
                      </span>
                    </article>
                  ))}
                </div>

                <p
                  className="mt-6 border-t pt-5 text-[12px] leading-[1.6] wght-450"
                  style={{
                    borderColor: "var(--color-landing-hairline)",
                    color: "var(--color-landing-text-muted)",
                  }}
                >
                  마감과 예정된 공부를 한 화면에서 함께 확인합니다
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
