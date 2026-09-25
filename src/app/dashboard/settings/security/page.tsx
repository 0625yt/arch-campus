import { redirect } from "next/navigation";
import { tryGetOwnerId } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { AccountSection } from "./account-section";
import { MfaSection } from "./mfa-section";
import { SessionsSection } from "./sessions-section";

/** TOTP enrollment, global sign-out, and account deletion. Per-device sessions are not implemented. */
export const dynamic = "force-dynamic";

export default async function SecuritySettingsPage() {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  const supabase = await getServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const userEmail = userData.user?.email ?? "";

  return (
    <div className="mx-auto w-full max-w-[820px] px-6 pb-24 pt-10 sm:px-10 sm:pt-14">
      <header>
        <p
          className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          설정
        </p>
        <h1
          className="mt-2 text-[32px] leading-[1.08] wght-620 text-[var(--color-apple-ink)] sm:text-[40px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          보안
        </h1>
        <p
          className="mt-4 max-w-[560px] text-[14px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.022em" }}
        >
          인증 앱 등록, 모든 기기 로그아웃, 계정 삭제를 관리해요.
        </p>
      </header>

      <MfaSection className="mt-12" />
      <SessionsSection className="mt-8" />
      {userEmail && <AccountSection className="mt-8" userEmail={userEmail} />}
    </div>
  );
}
