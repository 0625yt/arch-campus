// biome-ignore-all lint/a11y/noNoninteractiveTabindex: the horizontally scrollable product region must be keyboard focusable
"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";

const SLIDES = [
  {
    key: "calendar",
    number: "01",
    label: "일정",
    kicker: "강의계획서 → 확인 → 캘린더",
    title: "마감일은 찾지 말고,\n확인만 하세요",
    body: "AI가 시험·과제·발표 일정 후보를 찾습니다. 날짜와 제목을 확인한 일정만 캘린더에 저장합니다",
    image: "/landing/product-calendar.png",
    alt: "arch에서 시간표와 강의계획서를 올려 일정을 가져오는 실제 화면",
  },
  {
    key: "study",
    number: "02",
    label: "자료 정리",
    kicker: "PDF 원문 ↔ 요약 ↔ 출처 페이지",
    title: "요약을 읽다가,\n바로 원문으로",
    body: "PDF와 요약을 나란히 보고 p.N을 누르면 해당 원문 페이지로 이동합니다. 요약본만 따로 PDF로 저장할 수도 있습니다",
    image: "/landing/product-material-split.jpg",
    alt: "PDF 원문과 출처 페이지가 표시된 요약을 나란히 보는 arch의 실제 자료 화면",
  },
  {
    key: "quiz",
    number: "03",
    label: "문제·복습",
    kicker: "내 자료 → 내 문제 → 오답 복습",
    title: "읽고 끝내지 않고,\n풀고 기억하게",
    body: "내 강의자료 안의 근거가 확인된 문제를 풀고, 헷갈린 문제와 약한 개념을 다시 모아 복습합니다",
    image: "/landing/product-quiz.jpg",
    alt: "arch에서 학습 자료로 만든 문제를 푸는 실제 화면",
  },
  {
    key: "tools",
    number: "04",
    label: "AI 도구",
    kicker: "막막함 → 질문 → 시작점",
    title: "AI를 잘 몰라도,\n질문부터 차근차근",
    body: "발표 구조·교수 요구사항·벼락치기 계획을 짧은 질문으로 구체화하고, 내 자료와 판단으로 완성합니다",
    image: "/landing/product-tools.png",
    alt: "arch의 발표, 과제, 시험 학업 도구를 보여주는 실제 화면",
  },
] as const;

export function ProductShowcase({
  startHref,
  startLabel,
}: {
  startHref: string;
  startLabel: string;
}) {
  const [active, setActive] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  const goTo = useCallback((index: number) => {
    const next = (index + SLIDES.length) % SLIDES.length;
    setActive(next);
    trackRef.current?.scrollTo({
      left: next * trackRef.current.clientWidth,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, []);

  const syncActiveSlide = () => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    setActive(Math.round(track.scrollLeft / track.clientWidth));
  };

  return (
    <section
      id="product"
      className="overflow-hidden border-b py-20 sm:py-24 lg:py-28"
      style={{
        borderColor: "var(--color-landing-hairline)",
        background: "var(--color-landing-pearl)",
      }}
      aria-labelledby="product-showcase-title"
    >
      <div className="mx-auto max-w-[1280px] px-5 sm:px-8 lg:px-12">
        <p
          className="text-[11px] wght-700 tracking-[0.08em]"
          style={{ color: "var(--color-landing-action-ink)" }}
        >
          실제 제품 화면
        </p>
        <h2
          id="product-showcase-title"
          className="mt-4 max-w-[980px] break-keep text-[38px] leading-[1.04] wght-700 sm:text-[50px] lg:text-[54px]"
          style={{
            color: "var(--color-landing-text-strong)",
            letterSpacing: "-0.034em",
          }}
        >
          한 번 올린 자료가
          <br />
          <span style={{ color: "var(--color-apple-action)" }}>한 학기 내내 이어집니다</span>
        </h2>
        <p
          className="mt-7 max-w-[760px] break-keep text-[16px] leading-[1.65] wght-450 sm:text-[18px]"
          style={{ color: "var(--color-landing-text-muted)" }}
        >
          강의계획서는 일정으로, 강의자료는 요약과 문제로, 기출 PDF는 직접 푸는 화면으로 이어집니다.
          아래는 실제 arch 화면과 기능 흐름입니다
        </p>

        <div className="mt-12 sm:mt-14">
          <div
            className="grid grid-cols-4 border-b"
            role="tablist"
            aria-label="제품 기능 화면 선택"
            style={{ borderColor: "var(--color-landing-hairline)" }}
          >
            {SLIDES.map((slide, index) => (
              <button
                key={slide.key}
                type="button"
                role="tab"
                id={`product-tab-${slide.key}`}
                aria-selected={active === index}
                aria-controls={`product-panel-${slide.key}`}
                tabIndex={active === index ? 0 : -1}
                onClick={() => goTo(index)}
                onKeyDown={(event) => {
                  let next = index;
                  if (event.key === "ArrowRight") next = (index + 1) % SLIDES.length;
                  else if (event.key === "ArrowLeft") {
                    next = (index - 1 + SLIDES.length) % SLIDES.length;
                  } else if (event.key === "Home") next = 0;
                  else if (event.key === "End") next = SLIDES.length - 1;
                  else return;

                  event.preventDefault();
                  goTo(next);
                  const nextTab = event.currentTarget.parentElement?.children[next];
                  if (nextTab instanceof HTMLElement) nextTab.focus();
                }}
                className="relative min-h-14 px-1 pb-4 text-left text-[12px] wght-620 transition-colors sm:min-h-16 sm:px-2 sm:pb-5 sm:text-[14px]"
                style={{
                  color:
                    active === index
                      ? "var(--color-landing-text-strong)"
                      : "var(--color-landing-text-muted)",
                }}
              >
                <span className="hidden text-[10px] tabular-nums sm:block">{slide.number}</span>
                <span className="sm:mt-1 sm:block">{slide.label}</span>
                <span
                  aria-hidden
                  className="absolute inset-x-1 bottom-[-1px] h-0.5 transition-opacity sm:inset-x-2"
                  style={{
                    background: "var(--color-apple-action)",
                    opacity: active === index ? 1 : 0,
                  }}
                />
              </button>
            ))}
          </div>

          <div className="relative mt-8 sm:mt-10">
            <section
              ref={trackRef}
              onScroll={syncActiveSlide}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") goTo(active + 1);
                else if (event.key === "ArrowLeft") goTo(active - 1);
                else if (event.key === "Home") goTo(0);
                else if (event.key === "End") goTo(SLIDES.length - 1);
                else return;
                event.preventDefault();
              }}
              tabIndex={0}
              aria-label="제품 화면 슬라이드. 좌우 방향키로 이동"
              className="product-showcase-track flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
            >
              {SLIDES.map((slide, index) => (
                <article
                  key={slide.key}
                  id={`product-panel-${slide.key}`}
                  role="tabpanel"
                  aria-labelledby={`product-tab-${slide.key}`}
                  aria-hidden={active !== index}
                  className="w-full shrink-0 snap-center"
                >
                  <div className="mb-8 grid gap-5 sm:mb-10 lg:grid-cols-[1fr_0.72fr] lg:items-end lg:gap-16">
                    <div>
                      <p
                        className="text-[11px] wght-700 tracking-[0.06em]"
                        style={{ color: "var(--color-landing-action-ink)" }}
                      >
                        {slide.kicker}
                      </p>
                      <h3
                        className="mt-3 whitespace-pre-line text-[32px] leading-[1.07] wght-700 sm:text-[46px] lg:text-[52px]"
                        style={{
                          color: "var(--color-landing-text-strong)",
                          letterSpacing: "-0.03em",
                        }}
                      >
                        {slide.title}
                      </h3>
                    </div>
                    <p
                      className="max-w-[500px] text-[14px] leading-[1.65] wght-450 sm:text-[16px] lg:pb-1"
                      style={{ color: "var(--color-landing-text-muted)" }}
                    >
                      {slide.body}
                    </p>
                  </div>

                  <div
                    className="relative overflow-hidden rounded-[14px] border bg-white"
                    style={{
                      borderColor: "var(--color-landing-hairline)",
                      boxShadow:
                        "0 1px 2px rgba(20,20,20,0.04), 0 18px 54px -42px color-mix(in oklab, var(--color-landing-text-strong) 26%, transparent)",
                    }}
                  >
                    <div className="relative aspect-square overflow-hidden sm:aspect-video">
                      <Image
                        src={slide.image}
                        alt={slide.alt}
                        fill
                        sizes="(max-width: 639px) 100vw, (max-width: 1280px) 100vw, 1180px"
                        className={
                          slide.key === "calendar"
                            ? "origin-top scale-[1.12] object-cover object-top"
                            : "object-cover object-top"
                        }
                      />
                    </div>
                  </div>
                </article>
              ))}
            </section>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-5 sm:mt-8">
              <Link
                href={startHref}
                className="spring-press inline-flex min-h-12 items-center rounded-[10px] bg-[var(--color-landing-text-strong)] px-5 text-[13px] wght-700 transition-opacity hover:opacity-85"
                style={{ color: "var(--color-landing-bg)" }}
              >
                {startLabel}
                <span aria-hidden className="ml-2 text-[16px]">
                  →
                </span>
              </Link>

              <div className="ml-auto flex items-center gap-4">
                <p
                  className="text-[11px] wght-560 tabular-nums"
                  style={{ color: "var(--color-landing-text-muted)" }}
                  aria-live="polite"
                >
                  {String(active + 1).padStart(2, "0")} / {String(SLIDES.length).padStart(2, "0")}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => goTo(active - 1)}
                    className="spring-press inline-flex h-11 w-11 items-center justify-center rounded-[10px] border text-[20px] transition-colors"
                    style={{
                      borderColor: "var(--color-landing-hairline)",
                      background: "var(--color-landing-card-strong)",
                      color: "var(--color-landing-text-strong)",
                    }}
                    aria-label="이전 제품 화면"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => goTo(active + 1)}
                    className="spring-press inline-flex h-11 w-11 items-center justify-center rounded-[10px] bg-[var(--color-landing-text-strong)] text-[20px] transition-opacity hover:opacity-85"
                    style={{ color: "var(--color-landing-bg)" }}
                    aria-label="다음 제품 화면"
                  >
                    →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
