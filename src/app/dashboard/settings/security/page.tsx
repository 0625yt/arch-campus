import { redirect } from "next/navigation";
import { tryGetOwnerId } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { AccountSection } from "./account-section";
import { MfaSection } from "./mfa-section";
import { SessionsSection } from "./sessions-section";

/**
 * 보안 설정 — 2026-05 보안 리서치 단기 항목 (MFA·활성 세션).
 *
 * 두 섹션:
 *   1. MfaSection — TOTP 두 번째 인증 enroll·해제. 1Password·Authy 같은 앱이 필요함.
 *   2. SessionsSection — 다른 기기에 로그인된 세션 목록·강제 로그아웃. 1Password 식.
 *
 * Supabase 내장 API 사용:
 *   - supabase.auth.mfa.enroll / challenge / verify / unenroll
 *   - supabase.auth.admin.listSessions (server-only, service-role)
 *   - supabase.auth.signOut('global') (모든 세션 종료)
 *
 * RLS 우회 안 함. 세션 목록은 본인 user_id로 service-role 호출 후 owner_id 재검증.
 */
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
          매직링크 이메일이 탈취돼도 계정을 지키도록 두 번째 인증과 활성 세션 목록을 제공해요.
        </p>
      </header>

      <MfaSection className="mt-12" />
      <SessionsSection className="mt-8" />
      {userEmail && <AccountSection className="mt-8" userEmail={userEmail} />}
    </div>
  );
}
