import Link from "next/link";

const CONFIDENCE_ITEMS = [
  {
    number: "01",
    title: "다른 사용자에게 공개되지 않음",
    body: "올린 강의자료와 강의계획서는 공개·팀 공유 기능이 없어 다른 사용자에게 보이지 않습니다.",
  },
  {
    number: "02",
    title: "외부 AI는 필요한 범위에서만",
    body: "요약·문제 생성·일정 추출을 위해 자료의 필요한 내용이 외부 AI 처리 시스템으로 전달될 수 있습니다. 다른 사용자에게 공개되는 것과는 별개입니다.",
  },
  {
    number: "03",
    title: "AI가 일정을 바로 확정하지 않음",
    body: "찾아낸 시험·과제 일정의 날짜와 제목을 고치거나 빼고, 선택한 일정만 캘린더에 저장합니다.",
  },
  {
    number: "04",
    title: "자료와 계정은 직접 삭제",
    body: "올린 자료는 개별로 지울 수 있고, 설정에서 계정 삭제를 요청하면 연결된 자료와 학습 데이터도 함께 정리합니다.",
  },
  {
    number: "05",
    title: "문제는 자료 안 근거를 먼저 검사",
    body: "근거가 비어 있거나 자료와 맞지 않는 문제, 중복 보기와 잘못된 정답 표시를 걸러내고 풀이 후 근거를 보여줍니다.",
  },
] as const;

/**
 * 가입 직전의 불안을 해소하고 시작으로 이어지는 마지막 섹션.
 */
export function TrustSection({ startHref, startLabel }: { startHref: string; startLabel: string }) {
  return (
    <section
      id="trust"
      className="px-5 py-20 sm:px-8 sm:py-28 lg:px-12 lg:py-32"
      style={{ background: "#1d1d1f" }}
    >
      <div className="mx-auto grid max-w-[1180px] gap-16 lg:grid-cols-[0.82fr_1.18fr] lg:gap-24">
        <div className="lg:pt-2">
          <p className="text-[12px] wght-700 tracking-[-0.01em]" style={{ color: "#76b7ff" }}>
            시작 전 확인
          </p>
          <h2
            className="mt-5 break-keep text-[36px] leading-[1.08] wght-700 sm:text-[48px] lg:text-[52px]"
            style={{
              color: "#f5f5f7",
              letterSpacing: "-0.03em",
            }}
          >
            내 자료는 지키고,
            <br />
            중요한 결정은
            <br />
            내가 확인합니다
          </h2>
          <p
            className="mt-7 max-w-[460px] text-[15px] leading-[1.7] wght-450"
            style={{
              color: "rgba(245, 245, 247, 0.72)",
              letterSpacing: "-0.012em",
            }}
          >
            빠르게 시작해도 불안하지 않도록 자료의 공개 범위와 AI가 개입하는 지점을 분명히 했습니다.
          </p>

          <div className="mt-10 border-t pt-8" style={{ borderColor: "rgba(245, 245, 247, 0.14)" }}>
            <Link
              href={startHref}
              className="spring-press inline-flex min-h-14 items-center justify-center rounded-[12px] bg-[#f5f5f7] px-8 text-[15px] wght-700 text-[#1d1d1f] transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
              style={{ letterSpacing: "-0.012em" }}
            >
              {startLabel}
              <span aria-hidden className="ml-2 text-[18px]">
                →
              </span>
            </Link>
            <p
              className="mt-4 text-[12px] leading-[1.6] wght-450"
              style={{ color: "rgba(245, 245, 247, 0.62)" }}
            >
              현재 베타 무료 · 구글 또는 이메일 가입 · 카드 등록 없음
            </p>
          </div>
        </div>

        <div className="border-y" style={{ borderColor: "rgba(245, 245, 247, 0.16)" }}>
          <ol>
            {CONFIDENCE_ITEMS.map((item) => (
              <li
                key={item.number}
                className="grid grid-cols-[38px_1fr] gap-3 border-b py-7 last:border-b-0 sm:grid-cols-[52px_1fr] sm:gap-5 sm:py-8"
                style={{
                  borderColor: "rgba(245, 245, 247, 0.12)",
                }}
              >
                <span
                  aria-hidden
                  className="pt-1 text-[11px] tabular-nums wght-700"
                  style={{ color: "#76b7ff" }}
                >
                  {item.number}
                </span>
                <div>
                  <h3
                    className="text-[17px] leading-[1.35] wght-620 sm:text-[20px]"
                    style={{
                      color: "#f5f5f7",
                      letterSpacing: "-0.018em",
                    }}
                  >
                    {item.title}
                  </h3>
                  <p
                    className="mt-3 max-w-[560px] text-[13px] leading-[1.7] wght-450 sm:text-[14px]"
                    style={{
                      color: "rgba(245, 245, 247, 0.7)",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {item.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <div
            className="flex min-h-14 items-center gap-5 border-t text-[12px] wght-500"
            style={{
              borderColor: "rgba(245, 245, 247, 0.12)",
              color: "rgba(245, 245, 247, 0.68)",
            }}
          >
            <Link className="inline-flex min-h-11 items-center hover:text-white" href="/privacy">
              개인정보처리방침
            </Link>
            <Link className="inline-flex min-h-11 items-center hover:text-white" href="/terms">
              이용약관
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
