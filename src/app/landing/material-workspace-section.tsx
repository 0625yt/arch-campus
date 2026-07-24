import Image from "next/image";
import Link from "next/link";

const MATERIAL_PROOFS = [
  {
    label: "원문 ↔ 요약",
    body: "PDF만·5:5·요약만으로 바꾸고, 가운데 경계를 드래그해 비율을 조절합니다",
  },
  {
    label: "p.6 → 원문",
    body: "요약에 붙은 페이지를 누르면 데스크톱에서는 같은 화면의 PDF가 그 위치로 이동합니다",
  },
  {
    label: "요약 PDF 저장",
    body: "정리된 요약만 따로 인쇄하거나 PDF로 저장해 시험 직전 다시 꺼냅니다",
  },
] as const;

export function MaterialWorkspaceSection({
  startHref,
  startLabel,
}: {
  startHref: string;
  startLabel: string;
}) {
  return (
    <section
      id="material"
      className="border-b px-5 py-20 sm:px-8 sm:py-24 lg:px-12 lg:py-28"
      style={{ borderColor: "var(--color-landing-hairline)" }}
      aria-labelledby="material-workspace-title"
    >
      <div className="mx-auto max-w-[1180px]">
        <div className="grid gap-7 lg:grid-cols-[0.9fr_1.1fr] lg:items-end lg:gap-20">
          <div>
            <p
              className="text-[11px] wght-700 tracking-[0.08em]"
              style={{ color: "var(--color-landing-action-ink)" }}
            >
              PDF 원문에서 오답까지
            </p>
            <h2
              id="material-workspace-title"
              className="mt-4 break-keep text-[36px] leading-[1.06] wght-700 sm:text-[46px] lg:text-[50px]"
              style={{
                color: "var(--color-landing-text-strong)",
                letterSpacing: "-0.032em",
              }}
            >
              자료 하나를 열면,
              <br />
              <span style={{ color: "var(--color-apple-action)" }}>
                시험공부가 끝까지 이어집니다
              </span>
            </h2>
          </div>

          <p
            className="max-w-[610px] break-keep text-[15px] leading-[1.72] wght-450 sm:text-[17px] lg:justify-self-end"
            style={{ color: "var(--color-landing-text-muted)" }}
          >
            PDF 원문과 요약을 나란히 보고, 요약의 p.N을 누르면 해당 원문 페이지로 이동합니다. 요약은
            PDF로 따로 저장하고, 아래에서는 이 자료로 만든 문제와 남은 오답을 바로 이어서 풉니다
          </p>
        </div>

        <figure className="mt-12 sm:mt-16">
          <div
            className="overflow-hidden rounded-[14px] border bg-white"
            style={{ borderColor: "var(--color-landing-hairline)" }}
          >
            <Image
              src="/landing/product-material-split.jpg"
              alt="PDF 원문과 출처 페이지가 표시된 요약을 나란히 보는 arch의 실제 자료 화면"
              width={1270}
              height={714}
              sizes="(max-width: 1280px) 100vw, 1180px"
              className="h-auto w-full"
              priority={false}
            />
            <figcaption
              className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-[10.5px] wght-500 sm:px-5"
              style={{
                borderColor: "var(--color-landing-hairline)",
                color: "var(--color-landing-text-muted)",
              }}
            >
              <span>실제 제품 UI · 공개용 예시 데이터</span>
              <span style={{ color: "var(--color-landing-action-ink)" }}>
                데스크톱은 분할 화면 · 모바일은 요약에서 원문 열기
              </span>
            </figcaption>
          </div>
        </figure>

        <dl
          className="mt-8 grid border-y sm:grid-cols-3"
          style={{ borderColor: "var(--color-landing-hairline)" }}
        >
          {MATERIAL_PROOFS.map((proof, index) => (
            <div
              key={proof.label}
              className={`py-6 sm:px-6 sm:py-7 ${
                index > 0 ? "border-t sm:border-t-0 sm:border-l" : ""
              }`}
              style={{ borderColor: "var(--color-landing-hairline)" }}
            >
              <dt
                className="text-[14px] wght-700 tabular-nums"
                style={{ color: "var(--color-landing-text-strong)" }}
              >
                {proof.label}
              </dt>
              <dd
                className="mt-2 max-w-[330px] break-keep text-[12.5px] leading-[1.65] wght-450 sm:text-[13px]"
                style={{ color: "var(--color-landing-text-muted)" }}
              >
                {proof.body}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-20 grid gap-10 sm:mt-24 lg:grid-cols-[0.66fr_1.34fr] lg:items-center lg:gap-16">
          <div>
            <p
              className="text-[11px] wght-700 tracking-[0.08em]"
              style={{ color: "var(--color-landing-action-ink)" }}
            >
              만든 문제 · 점수 · 오답
            </p>
            <h3
              className="mt-4 break-keep text-[30px] leading-[1.08] wght-700 sm:text-[40px]"
              style={{
                color: "var(--color-landing-text-strong)",
                letterSpacing: "-0.03em",
              }}
            >
              정리한 순간부터,
              <br />풀 문제도 생깁니다
            </h3>
            <p
              className="mt-6 max-w-[450px] break-keep text-[14px] leading-[1.72] wght-450 sm:text-[16px]"
              style={{ color: "var(--color-landing-text-muted)" }}
            >
              자료 아래에 문제 세트가 쌓이고 최근 점수, 풀이 횟수, 남은 오답을 함께 보여줍니다.
              새로운 난이도로 더 만들거나 오답만 다시 열 수 있습니다
            </p>

            <div
              className="mt-7 border-l-2 pl-4"
              style={{ borderColor: "var(--color-apple-action)" }}
            >
              <p
                className="text-[12px] leading-[1.6] wght-620"
                style={{ color: "var(--color-landing-text-strong)" }}
              >
                요약 → 문제 → 오답 → 원문 근거
              </p>
              <p
                className="mt-1 text-[11.5px] leading-[1.6] wght-450"
                style={{ color: "var(--color-landing-text-muted)" }}
              >
                같은 자료 안에서 복습 흐름이 끊기지 않습니다
              </p>
            </div>
          </div>

          <figure
            className="overflow-hidden rounded-[14px] border bg-white"
            style={{ borderColor: "var(--color-landing-hairline)" }}
          >
            <Image
              src="/landing/product-material-practice.jpg"
              alt="같은 자료로 만든 문제 세트와 최근 점수, 남은 오답을 보여주는 arch의 실제 화면"
              width={1270}
              height={714}
              sizes="(max-width: 1023px) 100vw, 760px"
              className="h-auto w-full"
            />
            <figcaption
              className="border-t px-4 py-2.5 text-[10.5px] wght-500"
              style={{
                borderColor: "var(--color-landing-hairline)",
                color: "var(--color-landing-text-muted)",
              }}
            >
              실제 제품 UI · 공개용 예시 데이터
            </figcaption>
          </figure>
        </div>

        <div
          className="mt-16 grid gap-7 rounded-[14px] border px-6 py-7 sm:px-8 sm:py-8 lg:grid-cols-[0.76fr_1.24fr] lg:items-center lg:gap-16"
          style={{
            borderColor: "var(--color-landing-hairline)",
            background: "var(--color-landing-pearl)",
          }}
        >
          <div>
            <p
              className="text-[11px] wght-700 tracking-[0.08em]"
              style={{ color: "var(--color-landing-action-ink)" }}
            >
              기출문제 자료라면
            </p>
            <h3
              className="mt-3 break-keep text-[24px] leading-[1.12] wght-700 sm:text-[30px]"
              style={{
                color: "var(--color-landing-text-strong)",
                letterSpacing: "-0.026em",
              }}
            >
              문제·정답·해설을 문제별 화면으로
            </h3>
          </div>
          <div>
            <p
              className="max-w-[620px] break-keep text-[13.5px] leading-[1.7] wght-450 sm:text-[15px]"
              style={{ color: "var(--color-landing-text-muted)" }}
            >
              기출문제 유형으로 올린 PDF에서는 본문에 실린 문제와 정답, 해설을 문제별로 정리해 먼저
              풀고 확인할 수 있는 화면으로 이어집니다
            </p>
            <p
              className="mt-4 text-[11.5px] wght-620"
              style={{ color: "var(--color-landing-text-strong)" }}
            >
              문제별 정리 <span aria-hidden>→</span> 내 답 선택 <span aria-hidden>→</span> 정답·해설
              확인
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-5 border-t pt-8 sm:flex-row sm:items-center">
          <p
            className="max-w-[580px] break-keep text-[14px] leading-[1.65] wght-560 sm:text-[15px]"
            style={{ color: "var(--color-landing-text-strong)" }}
          >
            다음 시험 자료부터, 찾고 옮기는 시간을 줄여보세요
          </p>
          <Link
            href={startHref}
            className="spring-press inline-flex min-h-12 shrink-0 items-center rounded-[10px] bg-[var(--color-landing-text-strong)] px-5 text-[13px] wght-700 transition-opacity hover:opacity-85"
            style={{ color: "var(--color-landing-bg)" }}
          >
            {startLabel}
            <span aria-hidden className="ml-2 text-[16px]">
              →
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
