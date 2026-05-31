import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { ForgotPanel } from "./forgot-panel";

export const dynamic = "force-dynamic";

export default async function ForgotPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard/today");

  return (
    <main
      className="auth-light relative min-h-screen overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse 90% 60% at 50% 0%, rgba(122, 166, 214, 0.45), transparent 65%), radial-gradient(ellipse 60% 40% at 100% 0%, rgba(243, 207, 138, 0.40), transparent 70%), radial-gradient(ellipse 80% 55% at 0% 100%, rgba(176, 156, 200, 0.42), transparent 70%), radial-gradient(ellipse 50% 30% at 100% 100%, rgba(122, 166, 214, 0.20), transparent 70%), #ffffff",
      }}
    >
      <div className="relative mx-auto flex min-h-screen w-full max-w-[420px] flex-col justify-center px-7 py-16">
        <header>
          <h1
            className="text-[28px] leading-[1.18] wght-620 text-[var(--color-apple-ink)] sm:text-[32px]"
            style={{ letterSpacing: "-0.016em" }}
          >
            비밀번호를 잊으셨군요.
          </h1>
          <p
            className="mt-4 text-[14px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            가입한 이메일을 적어주시면
            <br />
            재설정 링크를 보내드려요.
          </p>
        </header>

        <ForgotPanel />
      </div>
    </main>
  );
}
