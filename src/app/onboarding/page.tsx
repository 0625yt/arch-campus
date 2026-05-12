import { redirect } from "next/navigation";
import { getOwnerId } from "@/lib/auth";
import { getProfile } from "@/lib/data/profile";
import { OnboardingForm } from "./onboarding-form";
import { saveOnboarding } from "./actions";
import { inferSemester } from "@/lib/semester";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  let ownerId: string;
  try {
    ownerId = await getOwnerId();
  } catch {
    redirect("/login");
  }

  const profile = await getProfile(ownerId);
  if (profile?.onboarded) redirect("/dashboard/today");

  const defaultSemester = inferSemester(new Date());

  return (
    <main className="min-h-screen bg-[var(--color-apple-pearl)]">
      <div className="relative mx-auto w-full max-w-[560px] px-7 py-14 sm:py-20">
        {/* 옅은 색 글로우 */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[40%]"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(122, 166, 214, 0.10), transparent 70%)",
          }}
        />

        <header>
          <p
            className="text-[12px] wght-560 uppercase tracking-[0.08em] text-[var(--color-apple-muted)]"
          >
            첫 설정
          </p>
          <h1
            className="mt-3 text-[30px] leading-[1.15] wght-620 text-[var(--color-apple-ink)] sm:text-[36px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            안녕하세요.<br />어디서 공부하나요?
          </h1>
          <p className="mt-4 text-[14px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]">
            학교·전공을 알려주면 다른 학생들 데이터로 더 잘 도와드릴 수 있어요.
          </p>
        </header>

        <OnboardingForm
          action={saveOnboarding}
          defaultEmail={profile?.email ?? ""}
          defaultDisplayName={profile?.displayName ?? ""}
          defaultSemesterYear={defaultSemester.year}
          defaultSemesterTerm={defaultSemester.term}
        />
      </div>
    </main>
  );
}
