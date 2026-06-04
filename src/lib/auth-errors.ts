/**
 * Supabase Auth 에러를 한국어 사용자 친화 메시지로.
 *
 * Supabase는 영어 에러 message + 상세 코드를 돌려준다. 그대로 노출하면
 * "Invalid login credentials" 같이 나와서 일반 사용자가 무서워한다.
 * 사용자가 어떻게 행동해야 할지 명확하게 적는다 — "다시 시도", "회원가입" 등.
 */
export function friendlyAuthError(err: unknown): string {
  if (!err) return "알 수 없는 오류가 발생했어요.";
  const message =
    typeof err === "object" && err !== null && "message" in err && typeof err.message === "string"
      ? err.message
      : String(err);
  const code =
    typeof err === "object" && err !== null && "code" in err && typeof err.code === "string"
      ? err.code
      : "";

  // Supabase Auth 표준 에러 매핑
  if (/invalid login credentials/i.test(message) || code === "invalid_credentials") {
    return "이메일 또는 비밀번호가 맞지 않아요.";
  }
  if (/email not confirmed/i.test(message) || code === "email_not_confirmed") {
    return "메일함을 확인해 가입을 마무리해 주세요.";
  }
  if (/user already registered/i.test(message) || code === "user_already_exists") {
    return "이미 가입된 이메일이에요. 로그인을 시도해 주세요.";
  }
  if (
    /weak password/i.test(message) ||
    code === "weak_password" ||
    /password should be/i.test(message)
  ) {
    return "비밀번호는 영문·숫자 포함 8자 이상으로 만들어 주세요.";
  }
  if (/rate limit/i.test(message) || /too many/i.test(message)) {
    return "잠시 후 다시 시도해 주세요. 너무 자주 요청했어요.";
  }
  if (/network/i.test(message) || /fetch/i.test(message)) {
    return "네트워크 연결을 확인해 주세요.";
  }
  if (/user not found/i.test(message)) {
    return "가입된 계정이 아니에요. 회원가입을 먼저 진행해 주세요.";
  }
  if (
    /error sending (confirmation|recovery|magic link|invite|otp) (email|sms)/i.test(message) ||
    /smtp/i.test(message) ||
    code === "email_send_failed" ||
    code === "sms_send_failed"
  ) {
    return "메일 발송에 실패했어요. 이메일 주소를 다시 확인하거나 잠시 후 시도해 주세요.";
  }
  // 모르는 에러는 그대로 — 디버깅 단서.
  return message || "오류가 발생했어요. 잠시 후 다시 시도해 주세요.";
}
