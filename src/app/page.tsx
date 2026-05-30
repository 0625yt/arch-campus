import Link from "next/link";
import { getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const FLOW = [
  {
    step: "01",
    title: "자료를 넣으면",
    body: "강의자료·강의계획서·시간표 종류별로 수신",
  },
  {
    step: "02",
    title: "해야 할 일이 보이고",
    body: "시험·과제·발표·복습이 오늘 기준으로 정리",
  },
  {
    step: "03",
    title: "공부로 이어져요",
    body: "요약·문제·오답·과제 체크가 한 흐름으로 연결",
  },
] as const;

const FEATURES = [
  {
    title: "오늘 해야 할 일만",
    body: "마감과 복습을 한꺼번에 보여주지 않고 지금 처리할 것부터 표시",
    label: "Today",
  },
  {
    title: "자료에서 일정 만들기",
    body: "강의계획서와 공지에서 날짜 후보를 뽑아 확인 후 캘린더에 등록",
    label: "Calendar",
  },
  {
    title: "과목별 공부 히스토리",
    body: "운영체제·자료구조처럼 과목별로 자료·요약·문제 기록 누적",
    label: "Study",
  },
  {
    title: "과제 제출 조건 체크",
    body: "파일명·제출 형식·감점 포인트 — 놓치면 손해보는 조건 먼저 점검",
    label: "Tools",
  },
] as const;

const TODAY_ITEMS = [
  { title: "자료구조 과제 제출", meta: "오늘 23:59", tone: "urgent" },
  { title: "운영체제 5주차 복습", meta: "오전 10:30", tone: "study" },
  { title: "DB 발표 자료 점검", meta: "수요일 15:00", tone: "presentation" },
] as const;

export default async function Home() {
  const user = await getCurrentUser();
  const startHref = user ? "/dashboard/today" : "/login?mode=signup";
  const startLabel = user ? "내 캠퍼스 열기" : "시작해보세요";

  return (
    <main className="min-h-screen bg-white text-[var(--color-apple-ink)]">
      <Hero startHref={startHref} startLabel={startLabel} isSignedIn={Boolean(user)} />
      <FlowSection />
      <FeatureSection />
      <TrustSection startHref={startHref} startLabel={startLabel} />
    </main>
  );
}

function Hero({
  startHref,
  startLabel,
  isSignedIn,
}: {
  startHref: string;
  startLabel: string;
  isSignedIn: boolean;
}) {
  return (
    <section className="relative isolate min-h-[92svh] overflow-hidden border-b border-[var(--color-apple-hairline-soft)] px-5 pb-10 pt-5 sm:px-8 lg:px-12">
      <HeroBackdrop />

      <header className="relative z-10 mx-auto flex max-w-[1180px] items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-75">
          <BrandMark />
          <span className="text-[15px] wght-700 text-[var(--color-apple-ink)]">arch</span>
        </Link>

        <nav className="flex items-center gap-1.5">
          <a
            href="#features"
            className="hidden rounded-[8px] px-3 py-2 text-[13px] wght-560 text-[var(--color-apple-muted)] transition-colors hover:bg-white/80 hover:text-[var(--color-apple-ink)] sm:inline-flex"
          >
            기능
          </a>
          <a
            href="#trust"
            className="hidden rounded-[8px] px-3 py-2 text-[13px] wght-560 text-[var(--color-apple-muted)] transition-colors hover:bg-white/80 hover:text-[var(--color-apple-ink)] sm:inline-flex"
          >
            신뢰
          </a>
          <Link
            href={isSignedIn ? "/dashboard" : "/login"}
            className="rounded-[8px] px-3 py-2 text-[13px] wght-560 text-[var(--color-apple-muted)] transition-colors hover:bg-white/80 hover:text-[var(--color-apple-ink)]"
          >
            {isSignedIn ? "대시보드" : "로그인"}
          </Link>
        </nav>
      </header>

      <div className="relative z-10 mx-auto flex max-w-[1180px] flex-col justify-end pt-[11svh] lg:min-h-[74svh] lg:pt-[14svh]">
        <div className="max-w-[650px]">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-apple-hairline-soft)] bg-white/72 px-3 py-1.5 text-[12px] wght-620 text-[var(--color-apple-muted)] backdrop-blur-xl">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-apple-action)]" />
            대학생을 위한 한 학기 안전망
          </div>

          <h1 className="mt-6 text-[42px] leading-[1.02] wght-700 text-[var(--color-apple-ink)] sm:text-[64px] lg:text-[78px]">
            강의자료를 넣으면,
            <br />
            오늘 할 일이 보입니다.
          </h1>

          <p className="mt-6 max-w-[560px] text-[16px] leading-[1.65] wght-450 text-[var(--color-apple-muted)] sm:text-[18px]">
            흩어진 PDF, 강의계획서, 시간표를 올리면 과제 마감, 시험 범위, 복습, 발표 준비가 한
            화면에서 이어집니다.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={startHref}
              className="inline-flex h-[50px] items-center justify-center rounded-[8px] bg-[var(--color-apple-ink)] px-6 text-[14px] wght-700 text-white shadow-[0_14px_34px_-18px_rgba(20,30,50,0.45)] transition-all hover:-translate-y-px hover:shadow-[0_18px_42px_-18px_rgba(20,30,50,0.52)] active:translate-y-0"
            >
              {startLabel}
            </Link>
            <a
              href="#flow"
              className="inline-flex h-[50px] items-center justify-center rounded-[8px] border border-[var(--color-apple-hairline)] bg-white/78 px-6 text-[14px] wght-620 text-[var(--color-apple-ink)] backdrop-blur-xl transition-all hover:-translate-y-px hover:bg-white active:translate-y-0"
            >
              어떻게 바뀌는지 보기
            </a>
          </div>

          <p className="mt-4 text-[12.5px] leading-[1.55] wght-450 text-[var(--color-apple-muted)]">
            구글 계정으로 10초 시작. LMS 연동 없이도 자료 업로드부터 바로 써볼 수 있어요.
          </p>

          {/* 모바일 전용 미리보기 — md 이상은 우측 BackdropPanel이 1급 자리.
              "뭐 하는 서비스인지" 시각 단서가 없어 모바일 CTA 동기가 약하다는 감사 결과 반영. */}
          <div className="mt-10 rounded-[10px] border border-[var(--color-apple-hairline-soft)] bg-white/86 p-4 shadow-[0_12px_36px_-24px_rgba(20,30,50,0.32)] backdrop-blur-xl md:hidden">
            <div className="flex items-center justify-between border-b border-[var(--color-apple-hairline-soft)] pb-2.5">
              <span className="text-[13px] wght-700 text-[var(--color-apple-ink)]">내 캠퍼스</span>
              <span className="text-[11px] wght-560 text-[var(--color-apple-muted)]">오늘</span>
            </div>
            <div className="mt-3 space-y-1.5">
              {TODAY_ITEMS.map((item) => (
                <div
                  key={item.title}
                  className="flex items-center justify-between gap-3 rounded-[8px] bg-[var(--color-surface-mist)] px-3 py-2"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${toneClass(item.tone)}`} />
                    <span className="truncate text-[12.5px] wght-620 text-[var(--color-apple-ink)]">
                      {item.title}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] wght-560 text-[var(--color-apple-muted)]">
                    {item.meta}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-5 gap-px overflow-hidden rounded-[8px] bg-[var(--color-apple-hairline-soft)]">
              {["월", "화", "수", "목", "금"].map((day, index) => (
                <div key={day} className="min-h-[52px] bg-white/95 p-1.5">
                  <div className="text-[10px] wght-700 text-[var(--color-apple-muted)]">{day}</div>
                  {index < TODAY_ITEMS.length && (
                    <div className="mt-1 rounded-[5px] bg-[var(--color-tint-prez)] px-1 py-0.5 text-[9.5px] leading-[1.2] wght-620 text-[var(--color-tint-prez-ink)]">
                      {TODAY_ITEMS[index].title.slice(0, 8)}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-[1.5] wght-450 text-[var(--color-apple-muted)]">
              실제 화면 예시 · 가입 후 자료 1개만 올리면 바로 같은 모양으로 나옵니다.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function FlowSection() {
  return (
    <section id="flow" className="bg-white px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
      <div className="mx-auto max-w-[1180px]">
        <div className="max-w-[560px]">
          <p className="text-[12px] wght-700 uppercase text-[var(--color-apple-action)]">
            from files to focus
          </p>
          <h2 className="mt-3 text-[30px] leading-[1.15] wght-700 text-[var(--color-apple-ink)] sm:text-[44px]">
            공부 앱이 아니라, 한 학기 흐름을 정리하는 시작점.
          </h2>
        </div>

        <div className="mt-10 grid gap-3 md:grid-cols-3">
          {FLOW.map((item) => (
            <article
              key={item.step}
              className="rounded-[8px] border border-[var(--color-apple-hairline-soft)] bg-[var(--color-surface-mist)]/60 p-5"
            >
              <span className="text-[12px] wght-700 tabular-nums text-[var(--color-apple-action)]">
                {item.step}
              </span>
              <h3 className="mt-5 text-[20px] wght-700 text-[var(--color-apple-ink)]">
                {item.title}
              </h3>
              <p className="mt-2 text-[13.5px] leading-[1.65] wght-450 text-[var(--color-apple-muted)]">
                {item.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureSection() {
  return (
    <section
      id="features"
      className="border-y border-[var(--color-apple-hairline-soft)] bg-[var(--color-apple-pearl)] px-5 py-16 sm:px-8 sm:py-20 lg:px-12"
    >
      <div className="mx-auto grid max-w-[1180px] gap-8 lg:grid-cols-[0.95fr_1.35fr] lg:items-start">
        <div className="lg:sticky lg:top-8">
          <p className="text-[12px] wght-700 uppercase text-[var(--color-apple-action)]">
            core experience
          </p>
          <h2 className="mt-3 text-[30px] leading-[1.15] wght-700 text-[var(--color-apple-ink)] sm:text-[44px]">
            대학생이 진짜 자주 보는 화면만 남겼습니다.
          </h2>
          <p className="mt-4 max-w-[460px] text-[15px] leading-[1.65] wght-450 text-[var(--color-apple-muted)]">
            캘린더, 과목 자료, 오늘 할 일, 과제 체크가 따로 놀지 않고 하나의 흐름으로 이어지게
            설계했어요.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="rounded-[8px] bg-white p-5 shadow-[var(--elev-1)]"
            >
              <span className="text-[12px] wght-700 text-[var(--color-apple-action)]">
                {feature.label}
              </span>
              <h3 className="mt-4 text-[20px] leading-[1.25] wght-700 text-[var(--color-apple-ink)]">
                {feature.title}
              </h3>
              <p className="mt-2 text-[13.5px] leading-[1.65] wght-450 text-[var(--color-apple-muted)]">
                {feature.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function TrustSection({ startHref, startLabel }: { startHref: string; startLabel: string }) {
  return (
    <section id="trust" className="bg-white px-5 py-16 sm:px-8 sm:py-20 lg:px-12">
      <div className="mx-auto grid max-w-[1180px] gap-8 lg:grid-cols-[1fr_0.9fr] lg:items-center">
        <div>
          <p className="text-[12px] wght-700 uppercase text-[var(--color-apple-action)]">
            reliable by design
          </p>
          <h2 className="mt-3 text-[30px] leading-[1.15] wght-700 text-[var(--color-apple-ink)] sm:text-[44px]">
            자료에서 찾고, 확인하고 저장합니다.
          </h2>
          <p className="mt-4 max-w-[560px] text-[15px] leading-[1.65] wght-450 text-[var(--color-apple-muted)]">
            일정 후보는 바로 확정하지 않고 사용자가 보고 추가합니다. 자료에서 나온 내용은 과목과
            날짜 맥락 안에서 다시 확인할 수 있게 만드는 것이 목표예요.
          </p>
        </div>

        <div className="rounded-[8px] border border-[var(--color-apple-hairline-soft)] bg-[var(--color-surface-cream)] p-5">
          <div className="space-y-3">
            {["자료 기반으로 시작", "확인 후 일정 추가", "과목별 기록 유지"].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-[8px] bg-white px-3 py-3">
                <span className="h-2 w-2 rounded-full bg-[var(--color-apple-success)]" />
                <span className="text-[14px] wght-620 text-[var(--color-apple-ink)]">{item}</span>
              </div>
            ))}
          </div>

          <Link
            href={startHref}
            className="mt-5 inline-flex h-[48px] w-full items-center justify-center rounded-[8px] bg-[var(--color-apple-action)] px-5 text-[14px] wght-700 text-white transition-colors hover:bg-[var(--color-apple-action-hover)]"
          >
            {startLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}

function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#f7fbff_0%,#ffffff_72%)]" />

      <div className="absolute left-[52%] top-[13%] hidden w-[720px] rotate-[-3deg] rounded-[8px] border border-white/80 bg-white/78 p-4 shadow-[0_30px_88px_-54px_rgba(20,30,50,0.48)] backdrop-blur-xl md:block">
        <div className="mb-4 flex items-center justify-between border-b border-[var(--color-apple-hairline-soft)] pb-3">
          <span className="text-[13px] wght-700 text-[var(--color-apple-ink)]">내 캠퍼스</span>
          <span className="text-[12px] wght-560 text-[var(--color-apple-muted)]">이번 주</span>
        </div>

        <div className="grid grid-cols-[1fr_1.2fr] gap-4">
          <div className="rounded-[8px] bg-[var(--color-apple-pearl)] p-4">
            <span className="text-[12px] wght-700 text-[var(--color-apple-action)]">지금 먼저</span>
            <h2 className="mt-3 text-[22px] leading-[1.16] wght-700 text-[var(--color-apple-ink)]">
              제출 조건 확인 후 과제 시작
            </h2>
            <div className="mt-4 space-y-2">
              {["파일명: 학번_이름.pdf", "코드 캡처 포함", "마감 전 23:59 제출"].map((item) => (
                <p
                  key={item}
                  className="rounded-[8px] bg-white px-3 py-2 text-[12px] wght-560 text-[var(--color-apple-muted)]"
                >
                  {item}
                </p>
              ))}
            </div>
          </div>

          <div className="rounded-[8px] border border-[var(--color-apple-hairline-soft)] bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[12px] wght-700 text-[var(--color-apple-ink)]">오늘</span>
              <span className="text-[12px] wght-560 text-[var(--color-apple-muted)]">3개</span>
            </div>
            <div className="space-y-2">
              {TODAY_ITEMS.map((item) => (
                <div
                  key={item.title}
                  className="flex items-center justify-between gap-3 rounded-[8px] bg-[var(--color-surface-mist)] px-3 py-2.5"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${toneClass(item.tone)}`} />
                    <span className="truncate text-[12px] wght-620 text-[var(--color-apple-ink)]">
                      {item.title}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] wght-560 text-[var(--color-apple-muted)]">
                    {item.meta}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-5 gap-px overflow-hidden rounded-[8px] bg-[var(--color-apple-hairline-soft)]">
          {["월", "화", "수", "목", "금"].map((day, index) => (
            <div key={day} className="min-h-[112px] bg-white/92 p-3">
              <div className="text-[12px] wght-700 text-[var(--color-apple-muted)]">{day}</div>
              {index < TODAY_ITEMS.length && (
                <div className="mt-4 rounded-[7px] bg-[var(--color-tint-prez)] px-2 py-1.5 text-[11px] wght-620 text-[var(--color-tint-prez-ink)]">
                  {TODAY_ITEMS[index].title}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-[8%] right-[6%] hidden w-[300px] rounded-[8px] border border-[var(--color-apple-hairline-soft)] bg-white/72 p-4 shadow-[0_18px_50px_-36px_rgba(20,30,50,0.4)] backdrop-blur-xl lg:block">
        <p className="text-[12px] wght-700 text-[var(--color-apple-muted)]">자료 투입</p>
        <div className="mt-3 space-y-2">
          {["운영체제 5주차.pdf", "강의계획서.pdf", "시간표 이미지"].map((file, index) => (
            <div
              key={file}
              className="flex items-center justify-between rounded-[8px] bg-white px-3 py-2 text-[12px] wght-560 text-[var(--color-apple-ink)] shadow-[var(--elev-1)]"
            >
              <span>{file}</span>
              <span className="text-[var(--color-apple-muted)]">
                {index === 0 ? "공부" : "일정"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <div
      aria-hidden
      className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-[8px] bg-[var(--color-apple-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.08),inset_0_0.5px_0_rgba(255,255,255,0.12)]"
    >
      <div className="absolute inset-x-1 top-1 h-px rounded-full bg-white/35" />
      <span className="relative text-[13px] wght-700 text-white">a</span>
    </div>
  );
}

function toneClass(tone: string) {
  if (tone === "urgent") return "bg-[var(--color-apple-coral)]";
  if (tone === "study") return "bg-[var(--color-apple-success)]";
  return "bg-[var(--color-apple-cobalt)]";
}
