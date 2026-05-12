import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { LoginButton } from "./login-button";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard/today");

  const { next, error } = await searchParams;

  return (
    <main className="min-h-screen bg-[var(--color-apple-pearl)]">
      <div className="relative mx-auto flex min-h-screen w-full max-w-[420px] flex-col justify-center px-7 py-16">
        {/* 옅은 색 글로우 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[60%]"
          style={{
            background:
              "radial-gradient(ellipse 60% 40% at 50% 10%, rgba(122, 166, 214, 0.10), transparent 70%)",
          }}
        />

        <header className="text-center">
          <p
            className="text-[12px] wght-560 uppercase tracking-[0.08em] text-[var(--color-apple-muted)]"
          >
            arch campus
          </p>
          <h1
            className="mt-3 text-[32px] leading-[1.1] wght-620 text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            한 학기를 5분 안에<br />정리하는 AI.
          </h1>
          <p className="mt-4 text-[14px] leading-[1.5] wght-450 text-[var(--color-apple-muted)]">
            강의자료·강의계획서를 올리면<br />오늘 해야 할 공부가 자동으로 떠요.
          </p>
        </header>

        <div className="mt-12">
          <LoginButton next={next} />
          {error && (
            <p className="mt-4 text-center text-[13px] wght-450 text-[var(--color-urgent)]">
              {decodeURIComponent(error)}
            </p>
          )}
        </div>

        <p className="mt-10 text-center text-[12px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]">
          계속 진행하면 <a className="underline" href="/terms">이용약관</a>과{" "}
          <a className="underline" href="/privacy">개인정보처리방침</a>에 동의하는 것으로 간주합니다.
        </p>
      </div>
    </main>
  );
}
