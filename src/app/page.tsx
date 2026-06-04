import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentUser } from "@/lib/supabase/server";
import { CalendarSection } from "./landing/calendar-section";
import { CategoryMarquee } from "./landing/category-marquee";
import { LandingHero } from "./landing/hero";
import { StudySection } from "./landing/study-section";
import { TodaySection } from "./landing/today-section";
import { TrustSection } from "./landing/trust-section";
import { WizardSection } from "./landing/wizard-section";

export const dynamic = "force-dynamic";

/**
 * 랜딩 — 7섹션, 다크/라이트 토글, 라이브 데모.
 *
 *   ┌─ TopNav (brand + nav + theme toggle + CTA)
 *   ├─ Hero (좌측 카피 + 우측 라이브 미니 시간표 카드)
 *   ├─ CategoryMarquee (강의명 chip 무한 가로 스크롤)
 *   ├─ TodaySection (Today 데모 — 카운트다운 + 일정 리스트)
 *   ├─ CalendarSection (자료→일정 시퀀스 데모)
 *   ├─ StudySection (PDF→요약→문제 흐름)
 *   ├─ WizardSection (위저드 미니 결과)
 *   ├─ TrustSection (신뢰 + CTA)
 *   └─ Footer
 *
 * 다크 모드 토큰 (globals.css html[data-theme="dark"]):
 *   --color-landing-bg, --color-landing-text-*, --color-landing-card-*, --color-landing-hairline
 */
export default async function Home() {
  const user = await getCurrentUser();
  const startHref = user ? "/dashboard" : "/login?mode=signup";
  const startLabel = user ? "내 캠퍼스 열기" : "시작해보세요";
  const isSignedIn = Boolean(user);

  return (
    <main
      className="min-h-screen overflow-x-hidden"
      style={{
        background: "var(--color-landing-bg)",
        color: "var(--color-landing-text-strong)",
      }}
    >
      <TopNav isSignedIn={isSignedIn} startHref={startHref} startLabel={startLabel} />
      <LandingHero startHref={startHref} startLabel={startLabel} />
      <CategoryMarquee />
      <TodaySection />
      <CalendarSection />
      <StudySection />
      <WizardSection />
      <TrustSection startHref={startHref} startLabel={startLabel} />
      <Footer />
    </main>
  );
}

function TopNav({
  isSignedIn,
  startHref,
  startLabel,
}: {
  isSignedIn: boolean;
  startHref: string;
  startLabel: string;
}) {
  return (
    <header
      className="sticky top-0 z-50 backdrop-blur-xl"
      style={{
        background: "color-mix(in oklab, var(--color-landing-bg) 78%, transparent)",
        borderBottom: "1px solid var(--color-landing-hairline)",
      }}
    >
      <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-5 py-3 sm:px-8">
        <Link
          href="/"
          className="group inline-flex items-center gap-2 transition-opacity hover:opacity-80"
        >
          <BrandMark />
          <span
            className="text-[15px] wght-700"
            style={{ color: "var(--color-landing-text-strong)" }}
          >
            arch
          </span>
        </Link>

        <nav className="flex items-center gap-1.5">
          <a
            href="#flow"
            className="hidden rounded-full px-3 py-1.5 text-[13px] wght-560 transition-colors sm:inline-flex"
            style={{ color: "var(--color-landing-text-muted)" }}
          >
            흐름
          </a>
          <a
            href="#features"
            className="hidden rounded-full px-3 py-1.5 text-[13px] wght-560 transition-colors sm:inline-flex"
            style={{ color: "var(--color-landing-text-muted)" }}
          >
            기능
          </a>
          <a
            href="#trust"
            className="hidden rounded-full px-3 py-1.5 text-[13px] wght-560 transition-colors sm:inline-flex"
            style={{ color: "var(--color-landing-text-muted)" }}
          >
            신뢰
          </a>
          <ThemeToggle className="ml-1" />
          <Link
            href={isSignedIn ? "/dashboard" : "/login"}
            className="rounded-full px-3 py-1.5 text-[13px] wght-560 transition-colors"
            style={{ color: "var(--color-landing-text-muted)" }}
          >
            {isSignedIn ? "대시보드" : "로그인"}
          </Link>
          <Link
            href={startHref}
            className="spring-press inline-flex h-9 items-center rounded-full bg-[var(--color-apple-action)] px-4 text-[13px] wght-620 text-white shadow-[0_10px_24px_-12px_rgba(0,113,227,0.6)] transition-all hover:bg-[var(--color-apple-action-hover)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {startLabel}
          </Link>
        </nav>
      </div>
    </header>
  );
}

function BrandMark() {
  return (
    <div
      aria-hidden
      className="relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-[8px] bg-[var(--color-apple-action)] shadow-[0_1px_2px_rgba(0,0,0,0.08),inset_0_0.5px_0_rgba(255,255,255,0.12)]"
    >
      <div className="absolute inset-x-1 top-1 h-px rounded-full bg-white/35" />
      <span className="relative text-[12px] wght-700 text-white">a</span>
    </div>
  );
}

function Footer() {
  return (
    <footer
      className="border-t px-5 py-10 sm:px-8 lg:px-12"
      style={{ borderColor: "var(--color-landing-hairline)" }}
    >
      <div className="mx-auto flex max-w-[1180px] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <BrandMark />
          <span
            className="text-[13px] wght-620"
            style={{ color: "var(--color-landing-text-strong)" }}
          >
            arch
          </span>
          <span className="text-[12px]" style={{ color: "var(--color-landing-text-muted)" }}>
            공부·일정·AI 한 화면.
          </span>
        </div>
        <div className="flex items-center gap-4 text-[12px] wght-450">
          <Link
            href="/terms"
            style={{ color: "var(--color-landing-text-muted)" }}
            className="hover:opacity-80"
          >
            이용약관
          </Link>
          <Link
            href="/privacy"
            style={{ color: "var(--color-landing-text-muted)" }}
            className="hover:opacity-80"
          >
            개인정보
          </Link>
        </div>
      </div>
    </footer>
  );
}
