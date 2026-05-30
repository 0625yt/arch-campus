import Link from "next/link";
import { ResendButton } from "./resend-button";

export const dynamic = "force-dynamic";

/**
 * "메일 확인해주세요" 화면 — Supabase가 이메일 confirmation 켜져있을 때.
 *
 * 사용자가 메일함의 링크를 누르면 /auth/callback?code=...&type=signup 으로 돌아옴.
 * 거기서 session 만들고 onboarding/dashboard로 분기.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  const masked = email ? maskEmail(email) : "방금 적은 이메일";

  return (
    <main
      className="relative min-h-screen overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse 90% 60% at 50% 0%, rgba(122, 166, 214, 0.45), transparent 65%), radial-gradient(ellipse 60% 40% at 100% 0%, rgba(243, 207, 138, 0.40), transparent 70%), radial-gradient(ellipse 80% 55% at 0% 100%, rgba(176, 156, 200, 0.42), transparent 70%), radial-gradient(ellipse 50% 30% at 100% 100%, rgba(122, 166, 214, 0.20), transparent 70%), #ffffff",
      }}
    >
      <div className="relative mx-auto flex min-h-screen w-full max-w-[460px] flex-col justify-center px-7 py-16">
        <header className="text-center">
          <div
            aria-hidden
            className="mx-auto mb-7 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-[0_2px_12px_rgba(0,113,227,0.18),0_0_0_1px_rgba(0,113,227,0.10)]"
          >
            <MailIcon />
          </div>

          <h1
            className="text-[28px] leading-[1.18] wght-620 text-[var(--color-apple-ink)] sm:text-[32px]"
            style={{ letterSpacing: "-0.016em" }}
          >
            메일함을 열어주세요
          </h1>

          <p
            className="mx-auto mt-5 max-w-[360px] text-[14px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            <span className="wght-560 text-[var(--color-apple-ink)]">{masked}</span>로<br />
            가입 확인 링크를 보냈습니다.
          </p>
          <p
            className="mt-3 text-[12.5px] leading-[1.55] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            메일이 안 보이면 스팸함도 확인해 주세요.
          </p>
        </header>

        <div className="mt-10 flex flex-col items-center gap-4">
          <ResendButton email={email ?? ""} />

          <Link
            href="/login"
            className="text-[13px] wght-450 text-[var(--color-apple-muted)] underline-offset-2 hover:text-[var(--color-apple-ink)] hover:underline"
            style={{ letterSpacing: "-0.012em" }}
          >
            로그인 화면으로
          </Link>
        </div>
      </div>
    </main>
  );
}

function maskEmail(raw: string): string {
  const at = raw.indexOf("@");
  if (at < 0) return raw;
  const local = raw.slice(0, at);
  const domain = raw.slice(at);
  if (local.length <= 2) return raw;
  return `${local[0]}${"*".repeat(Math.min(local.length - 2, 4))}${local[local.length - 1]}${domain}`;
}

function MailIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
      <title>메일</title>
      <rect
        x="2.5"
        y="5"
        width="19"
        height="14"
        rx="2.5"
        stroke="var(--color-apple-action)"
        strokeWidth="1.6"
      />
      <path
        d="m3 7 9 6 9-6"
        stroke="var(--color-apple-action)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
