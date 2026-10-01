import type { SupabaseClient, User } from "@supabase/supabase-js";

export class MfaRequiredError extends Error {
  constructor() {
    super("2단계 인증을 완료해주세요");
    this.name = "MfaRequiredError";
  }
}

/** User must come from auth.getUser(), never user-controlled session metadata. */
export async function requiresMfa(supabase: SupabaseClient, user: User): Promise<boolean> {
  if (!user.factors?.some((factor) => factor.status === "verified")) return false;
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  // An unavailable assurance check cannot grant access to a protected account.
  return Boolean(error) || data?.currentLevel !== "aal2";
}
