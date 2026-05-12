import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { LoginPanel } from "./login-panel";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; mode?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard/today");

  const { next, error, mode } = await searchParams;
  const initialMode = mode === "signup" ? "signup" : "login";

  return (
    <main
      className="relative min-h-screen overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse 90% 60% at 50% 0%, rgba(122, 166, 214, 0.45), transparent 65%), radial-gradient(ellipse 60% 40% at 100% 0%, rgba(243, 207, 138, 0.40), transparent 70%), radial-gradient(ellipse 80% 55% at 0% 100%, rgba(176, 156, 200, 0.42), transparent 70%), radial-gradient(ellipse 50% 30% at 100% 100%, rgba(122, 166, 214, 0.20), transparent 70%), #ffffff",
      }}
    >

      <div className="relative mx-auto flex min-h-screen w-full max-w-[420px] flex-col justify-center px-7 py-16">
        <header className="text-center">
          <div className="inline-flex items-center gap-2">
            <BrandMark />
            <span
              className="text-[13px] wght-560 text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              arch
            </span>
          </div>

          <h1
            className="mt-8 text-[34px] leading-[1.08] wght-620 text-[var(--color-apple-ink)] sm:text-[38px]"
            style={{ letterSpacing: "-0.016em" }}
          >
            한 학기,<br />흩어지지 않게.
          </h1>

          <p
            className="mx-auto mt-5 max-w-[300px] text-[14px] leading-[1.55] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            강의자료와 강의계획서를 올리면<br />오늘 할 공부가 자동으로 정리돼요.
          </p>
        </header>

        <LoginPanel initialMode={initialMode} next={next} error={error} />
      </div>
    </main>
  );
}

function BrandMark() {
  return (
    <div
      aria-hidden
      className="relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-[8px] bg-[var(--color-apple-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.08),inset_0_0.5px_0_rgba(255,255,255,0.12)]"
    >
      <div className="absolute inset-x-1 top-1 h-px rounded-full bg-white/35" />
      <span className="relative text-[12px] wght-620 text-white">a</span>
    </div>
  );
}

