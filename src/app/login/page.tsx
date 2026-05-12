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
    <main className="min-h-screen bg-[var(--color-apple-pearl)]">
      <div className="relative mx-auto flex min-h-screen w-full max-w-[420px] flex-col justify-center px-7 py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[60%]"
          style={{
            background:
              "radial-gradient(ellipse 60% 40% at 50% 10%, rgba(122, 166, 214, 0.10), transparent 70%)",
          }}
        />

        <header className="text-center">
          <p className="text-[12px] wght-560 uppercase tracking-[0.08em] text-[var(--color-apple-muted)]">
            arch campus
          </p>
          <h1
            className="mt-3 text-[32px] leading-[1.1] wght-620 text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            한 학기를 5분 안에<br />정리하는 AI.
          </h1>
        </header>

        <LoginPanel initialMode={initialMode} next={next} error={error} />
      </div>
    </main>
  );
}
