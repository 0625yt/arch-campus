import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { LandingHero } from "./landing/hero";
import styles from "./landing/landing.module.css";
import { MaterialWorkspaceSection } from "./landing/material-workspace-section";
import { ProductShowcase } from "./landing/product-showcase";
import { TodaySection } from "./landing/today-section";
import { TrustSection } from "./landing/trust-section";

export const dynamic = "force-static";

export default function Home() {
  const startHref = "/signup";
  const startLabel = "무료로 시작하기";

  return (
    <div className={`min-h-screen overflow-x-clip ${styles.page}`}>
      <TopNav startHref={startHref} />
      <main id="main-content">
        <LandingHero startHref={startHref} startLabel={startLabel} />
        <ProductShowcase startHref={startHref} startLabel={startLabel} />
        <MaterialWorkspaceSection startHref={startHref} startLabel={startLabel} />
        <TodaySection />
        <TrustSection startHref={startHref} startLabel={startLabel} />
      </main>
      <Footer />
    </div>
  );
}

function TopNav({ startHref }: { startHref: string }) {
  return (
    <header className={`sticky top-0 z-50 backdrop-blur-xl ${styles.nav}`}>
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3 px-5 py-2.5 sm:px-8 lg:px-12">
        <Link
          href="/"
          className="group inline-flex min-h-11 items-center transition-opacity hover:opacity-80"
          aria-label="arch 홈"
        >
          <span className={styles.brand}>arch</span>
          <span className={styles.brandNote} aria-hidden>
            MADE FOR
            <br />
            YOUR SEMESTER
          </span>
        </Link>

        <nav className="flex items-center gap-1.5" aria-label="주요 메뉴">
          <a
            href="#product"
            className="hidden min-h-11 items-center px-3 text-[13px] wght-560 transition-colors hover:opacity-75 sm:inline-flex"
            style={{ color: "var(--color-landing-text-muted)" }}
          >
            실제 화면
          </a>
          <a
            href="#material"
            className="hidden min-h-11 items-center px-3 text-[13px] wght-560 transition-colors hover:opacity-75 sm:inline-flex"
            style={{ color: "var(--color-landing-text-muted)" }}
          >
            자료 정리
          </a>
          <a
            href="#trust"
            className="hidden min-h-11 items-center px-3 text-[13px] wght-560 transition-colors hover:opacity-75 sm:inline-flex"
            style={{ color: "var(--color-landing-text-muted)" }}
          >
            안심하고 시작
          </a>
          <ThemeToggle className="sm:ml-1 !h-11 !w-11" />
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center px-2 text-[13px] wght-560 transition-colors hover:opacity-75 sm:px-3"
            style={{ color: "var(--color-landing-text-muted)" }}
          >
            로그인
          </Link>
          <Link
            href={startHref}
            className="spring-press inline-flex min-h-11 items-center rounded-[10px] bg-[var(--color-landing-text-strong)] px-3 text-[12px] wght-700 transition-opacity hover:opacity-85 sm:px-4 sm:text-[13px]"
            style={{ color: "var(--color-landing-bg)", letterSpacing: "-0.012em" }}
          >
            무료 시작
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
            일정부터 복습까지 한곳에
          </span>
        </div>
        <div className="flex items-center gap-4 text-[12px] wght-450">
          <Link
            href="/terms"
            style={{ color: "var(--color-landing-text-muted)" }}
            className="inline-flex min-h-11 items-center hover:opacity-80"
          >
            이용약관
          </Link>
          <Link
            href="/privacy"
            style={{ color: "var(--color-landing-text-muted)" }}
            className="inline-flex min-h-11 items-center hover:opacity-80"
          >
            개인정보
          </Link>
        </div>
      </div>
    </footer>
  );
}
