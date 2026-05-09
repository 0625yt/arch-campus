import Link from "next/link";
import { COURSE_COLOR } from "@/app/dashboard/study/data";
import { Dot } from "@/components/primitives";
import { UploadIntake } from "./upload-intake";

const FOCUS_ITEMS = [
  {
    label: "지금",
    title: "자료구조 과제 제출 조건 확인",
    meta: "오늘 자정 · 파일명 학번.txt · 실행 결과 캡처 필요",
    course: "자료구조",
    href: "/dashboard/today",
    urgent: true,
  },
  {
    label: "다음",
    title: "운영체제 시험 범위 정리",
    meta: "D-4 · 동기화와 데드락부터 보기",
    course: "운영체제",
    href: "/dashboard/study/%EC%9A%B4%EC%98%81%EC%B2%B4%EC%A0%9C",
    urgent: false,
  },
  {
    label: "대기",
    title: "데이터베이스 팀플 역할 빈자리",
    meta: "오늘 19:00 전 · 발표 흐름 1명 비어 있음",
    course: "데이터베이스",
    href: "/dashboard/tools/presentation",
    urgent: false,
  },
] as const;

export default function DashboardPage() {
  return (
    <div className="bg-[var(--color-apple-pearl)]">
      {/* ─── Hero ───────────────────────── */}
      <section className="px-6 pb-14 pt-14 sm:px-10 sm:pb-16 sm:pt-20 md:px-16 md:pb-20 md:pt-24">
        <div className="mx-auto w-full max-w-[1080px] fade-up">
          <p
            className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.12px" }}
          >
            내 캠퍼스
          </p>
          <h1
            className="mt-4 max-w-[820px] text-[34px] leading-[1.07] wght-620 text-[var(--color-apple-ink)] sm:text-[44px] md:text-[52px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            자료를 넣고, 오늘 할 일만 보세요.
          </h1>
          <p
            className="mt-5 max-w-[600px] text-[15px] leading-[1.55] wght-450 text-[var(--color-apple-muted)] sm:text-[17px] sm:leading-[1.5]"
            style={{ letterSpacing: "-0.022em" }}
          >
            강의계획서, 과제 안내, 공지를 올리면 마감과 제출 조건만 골라 정리합니다.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
            <a
              href="#upload-zone"
              className="group inline-flex h-[52px] items-center justify-center rounded-full bg-[var(--color-apple-action)] px-8 text-[17px] wght-560 text-white transition-all duration-150 hover:bg-[var(--color-apple-action-hover)] active:scale-[0.97]"
              style={{ letterSpacing: "-0.012em" }}
            >
              자료 올리기
              <span className="ml-1.5 transition-transform group-hover:translate-x-0.5">›</span>
            </a>
            <Link
              href="/dashboard/today"
              className="group inline-flex h-[52px] items-center text-[17px] wght-450 text-[var(--color-apple-action)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              <span className="border-b border-transparent group-hover:border-[var(--color-apple-action)]">
                오늘 할 일 보기
              </span>
              <span className="ml-1 transition-transform group-hover:translate-x-0.5">›</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Bento — 학기 한눈에 (Apple business 패턴) ─── */}
      <section className="px-6 pb-16 sm:px-10 sm:pb-20 md:px-16 md:pb-24">
        <div className="mx-auto w-full max-w-[1080px] fade-up fade-up-1">
          <div className="grid gap-4 md:grid-cols-3 md:gap-5">
            {/* 큰 타일 — 이번 주 마감 (액센트: 코랄) */}
            <Link
              href="/dashboard/calendar"
              className="group relative flex min-h-[260px] flex-col justify-between overflow-hidden rounded-[18px] bg-white p-7 transition-transform duration-300 hover:-translate-y-0.5 md:col-span-2 md:p-8"
            >
              <div>
                <p
                  className="text-[13px] wght-560 text-[var(--color-urgent)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  이번 주 마감
                </p>
                <h3
                  className="mt-3 text-[28px] leading-[1.1] wght-620 text-[var(--color-apple-ink)] sm:text-[34px]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  3개의 일이
                  <br />
                  당신을 기다리고 있어요.
                </h3>
                <p
                  className="mt-3 max-w-[440px] text-[14px] leading-[1.5] wght-450 text-[var(--color-apple-muted)]"
                  style={{ letterSpacing: "-0.022em" }}
                >
                  자료구조 · 운영체제 · 데이터베이스 — 가장 가까운 마감은 오늘 자정.
                </p>
              </div>

              {/* 시각 요소 — 코랄 그라데이션 띠 */}
              <div className="mt-6 flex items-end justify-between gap-4">
                <div className="flex gap-1.5">
                  {[...Array(7)].map((_, i) => (
                    <div
                      key={i}
                      className="h-8 w-2 rounded-full"
                      style={{
                        backgroundColor:
                          i === 0
                            ? "var(--color-urgent)"
                            : i === 1
                              ? "rgba(224, 68, 94, 0.55)"
                              : i === 2
                                ? "rgba(224, 68, 94, 0.3)"
                                : "var(--color-apple-hairline)",
                      }}
                    />
                  ))}
                </div>
                <span
                  className="text-[13px] wght-450 text-[var(--color-apple-action)] transition-transform group-hover:translate-x-0.5"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  전체 일정 보기 ›
                </span>
              </div>
            </Link>

            {/* 작은 타일 — 학기 진행 (액센트: 블루) */}
            <Link
              href="/dashboard/study"
              className="group relative flex min-h-[260px] flex-col justify-between overflow-hidden rounded-[18px] bg-white p-7 transition-transform duration-300 hover:-translate-y-0.5"
            >
              <div>
                <p
                  className="text-[13px] wght-560 text-[var(--color-apple-action)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  이번 학기
                </p>
                <h3
                  className="mt-3 text-[28px] leading-[1.05] wght-620 text-[var(--color-apple-ink)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  5<span className="text-[var(--color-apple-muted)]">/15</span>
                </h3>
                <p
                  className="mt-1 text-[14px] wght-450 text-[var(--color-apple-muted)]"
                  style={{ letterSpacing: "-0.022em" }}
                >
                  주차 · 4 강의
                </p>
              </div>

              {/* 진행률 게이지 */}
              <div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--color-apple-hairline)]">
                  <div
                    className="h-full rounded-full bg-[var(--color-apple-action)]"
                    style={{ width: "33%" }}
                  />
                </div>
                <p
                  className="mt-3 text-[12px] wght-450 text-[var(--color-apple-muted)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  강의 보기 ›
                </p>
              </div>
            </Link>
          </div>

          {/* 하단 — 작은 3-up */}
          <div className="mt-4 grid gap-4 sm:grid-cols-3 md:mt-5 md:gap-5">
            <MiniTile
              eyebrow="자료"
              eyebrowColor="var(--color-apple-ink)"
              big="7"
              meta="개 자료가 정리되어 있어요"
              href="/dashboard/study"
            />
            <MiniTile
              eyebrow="문제"
              eyebrowColor="var(--color-apple-success)"
              big="18"
              meta="개 풀이 · 78% 정답"
              href="/dashboard/history"
            />
            <MiniTile
              eyebrow="연속 학습"
              eyebrowColor="var(--color-apple-streak)"
              big="5일"
              meta="이번 주 5시간 30분"
              href="/dashboard/history"
            />
          </div>
        </div>
      </section>

      {/* ─── 업로드 (White) ─────────────── */}
      <section className="bg-white px-6 pb-20 pt-16 sm:px-10 sm:pb-24 sm:pt-20 md:px-16 md:pb-28 md:pt-24">
        <div className="mx-auto w-full max-w-[1080px] fade-up fade-up-2">
          <h2
            className="max-w-[720px] text-[26px] leading-[1.12] wght-620 text-[var(--color-apple-ink)] sm:text-[32px] sm:leading-[1.1]"
            style={{ letterSpacing: "-0.012em" }}
          >
            먼저 자료를 넣으면, 오늘 할 일이 살아납니다.
          </h2>

          <UploadIntake className="mt-12" />
        </div>
      </section>

      {/* ─── 자료에서 정리된 할 일 (Pearl) ───── */}
      <section className="bg-[var(--color-apple-pearl)] px-6 pb-24 pt-16 sm:px-10 sm:pb-28 sm:pt-20 md:px-16 md:pb-32 md:pt-24">
        <div className="mx-auto w-full max-w-[1080px] fade-up fade-up-3">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <h2
              className="max-w-[720px] text-[26px] leading-[1.12] wght-620 text-[var(--color-apple-ink)] sm:text-[32px] sm:leading-[1.1]"
              style={{ letterSpacing: "-0.012em" }}
            >
              자료에서 정리된 할 일.
            </h2>
            <Link
              href="/dashboard/calendar"
              className="group inline-flex items-center text-[14px] wght-450 text-[var(--color-apple-action)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              <span className="border-b border-transparent group-hover:border-[var(--color-apple-action)]">
                전체 일정
              </span>
              <span className="ml-1 transition-transform group-hover:translate-x-0.5">›</span>
            </Link>
          </div>

          <ul className="mt-10 overflow-hidden rounded-[12px] border border-[var(--color-apple-hairline)] bg-white">
            {FOCUS_ITEMS.map((item, idx) => (
              <li
                key={item.title}
                className={
                  idx !== FOCUS_ITEMS.length - 1
                    ? "border-b border-[var(--color-apple-hairline-soft)]"
                    : ""
                }
              >
                <Link
                  href={item.href}
                  className="group grid grid-cols-[64px_1fr_auto] items-center gap-4 px-5 py-[18px] transition-colors hover:bg-[var(--color-apple-pearl)] sm:grid-cols-[72px_1fr_auto] sm:gap-5 sm:px-7 sm:py-[20px]"
                >
                  <span
                    className={
                      item.urgent
                        ? "text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-urgent)]"
                        : "text-[11px] wght-450 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]"
                    }
                  >
                    {item.label}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <Dot color={COURSE_COLOR[item.course]} size={6} />
                      <span
                        className="truncate text-[15px] leading-[1.3] wght-560 text-[var(--color-apple-ink)]"
                        style={{ letterSpacing: "-0.012em" }}
                      >
                        {item.title}
                      </span>
                    </span>
                    <span
                      className="mt-[5px] block truncate text-[13px] leading-[1.4] wght-450 text-[var(--color-apple-muted)]"
                      style={{ letterSpacing: "-0.022em" }}
                    >
                      {item.meta}
                    </span>
                  </span>
                  <span className="text-[15px] text-[var(--color-apple-muted)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--color-apple-action)]">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function MiniTile({
  eyebrow,
  eyebrowColor,
  big,
  meta,
  href,
}: {
  eyebrow: string;
  eyebrowColor: string;
  big: string;
  meta: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-[140px] flex-col justify-between rounded-[18px] bg-white p-6 transition-transform duration-300 hover:-translate-y-0.5"
    >
      <p
        className="text-[12px] wght-560"
        style={{ letterSpacing: "-0.012em", color: eyebrowColor }}
      >
        {eyebrow}
      </p>
      <div>
        <p
          className="text-[34px] leading-[1.05] wght-620 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {big}
        </p>
        <p
          className="mt-1 text-[13px] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.022em" }}
        >
          {meta}
        </p>
      </div>
    </Link>
  );
}
