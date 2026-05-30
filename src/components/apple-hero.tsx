import Link from "next/link";

/**
 * Apple 톤 페이지 헤더 — eyebrow + h1 + sub.
 *
 * 7+개 페이지가 같은 패턴(uppercase tracking-[0.06em] eyebrow → 34~52px h1 → muted sub)을 손으로
 * 재구현하던 걸 단일 컴포넌트로 묶음. 마침표·어시스턴트체 차단을 props 레벨에서 함.
 *
 * 구조:
 *   ┌─ AppleHeroTopBar(선택)  ─ "‹ 도구" 같은 back link + 우측 chip
 *   ├─ eyebrow (uppercase, 컬러 prop)
 *   ├─ h1 (34→52px, 가운데에 <span muted>)
 *   └─ sub (선택, 14.5~17px muted)
 *
 * 사용:
 *   <AppleHeroTopBar back={{href:"/dashboard/tools", label:"도구"}} chip="발표 · 5단계" />
 *   <AppleHero
 *     eyebrow="발표자료 구조화"
 *     eyebrowColor="var(--color-apple-cobalt)"
 *     title={<>5단계로 답하면 <muted>발표 한 세트</muted></>}
 *     sub="슬라이드 구조·스피커 노트·예상 질문 5개"
 *   />
 *
 * AI 티 가드 (DESIGN.md §10):
 *  - title/sub 끝에 마침표 들어가면 dev에서 콘솔 warn (헤더는 이름표지 문장 X)
 *  - 「~드릴게요」「~만들어져요」 같은 어시스턴트체 props에서도 warn
 */

export function AppleHeroTopBar({
  back,
  chip,
}: {
  back?: { href: string; label: string };
  chip?: string;
}) {
  return (
    <header className="fade-up flex items-baseline justify-between gap-3">
      {back ? (
        <Link
          href={back.href}
          className="group inline-flex items-baseline gap-1 text-[12px] wght-450 text-[var(--color-apple-muted)] hover:text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          <span className="transition-transform group-hover:-translate-x-0.5">‹</span>
          {back.label}
        </Link>
      ) : (
        <span />
      )}
      {chip && (
        <span className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
          {chip}
        </span>
      )}
    </header>
  );
}

export interface AppleHeroProps {
  eyebrow: string;
  eyebrowColor?: string;
  title: React.ReactNode;
  /** 같은 라인에 머문 채 muted 색으로 보일 라벨. title이 string이면 이쪽으로 빼는 게 깔끔. */
  titleMuted?: string;
  sub?: string;
  /** title이 string이고 끝에 마침표 있으면 dev에서 warn. JSX면 검사 못함. */
  className?: string;
}

export function AppleHero({
  eyebrow,
  eyebrowColor = "var(--color-apple-action)",
  title,
  titleMuted,
  sub,
  className = "",
}: AppleHeroProps) {
  if (process.env.NODE_ENV !== "production") {
    const titleStr = typeof title === "string" ? title : "";
    if (titleStr.endsWith(".") || titleStr.endsWith("。")) {
      // biome-ignore lint/suspicious/noConsole: dev-only AI-tone guard
      console.warn(
        `[AppleHero] 헤더는 이름표이지 문장이 아니에요. 마침표 제거 권장: "${titleStr}"`,
      );
    }
    if (sub?.endsWith("드릴게요.") || sub?.endsWith("만들어져요.")) {
      // biome-ignore lint/suspicious/noConsole: dev-only AI-tone guard
      console.warn(`[AppleHero] 어시스턴트체 카피 감지: "${sub}" — 명사구·평서체로 교체 권장.`);
    }
  }

  return (
    <section className={`mt-6 fade-up fade-up-1 sm:mt-8 ${className}`}>
      <p
        className="text-[11px] wght-700 uppercase tracking-[0.08em]"
        style={{ color: eyebrowColor }}
      >
        {eyebrow}
      </p>
      <h1
        className="mt-2 text-[28px] leading-[1.08] wght-700 text-[var(--color-apple-ink)] sm:text-[36px] md:text-[42px]"
        style={{ letterSpacing: "-0.022em" }}
      >
        {title}
        {titleMuted && (
          <>
            {" "}
            <span className="text-[var(--color-apple-muted)]">{titleMuted}</span>
          </>
        )}
      </h1>
      {sub && (
        <p
          className="mt-2.5 max-w-[600px] text-[13.5px] leading-[1.55] wght-450 text-[var(--color-apple-muted)] sm:text-[14.5px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {sub}
        </p>
      )}
    </section>
  );
}
