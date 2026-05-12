import { NextResponse, type NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getProfile } from "@/lib/data/profile";

/**
 * Google OAuth 콜백 — code를 세션으로 교환하고 온보딩 여부에 따라 라우팅.
 *
 * - 신규 사용자 (profile.university 비어있음) → /onboarding
 * - 기존 사용자 → /dashboard/today 또는 next 파라미터
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard/today";
  const errorParam = url.searchParams.get("error_description") ?? url.searchParams.get("error");

  if (errorParam) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(errorParam)}`, url.origin),
    );
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=인증+코드가+없어요", url.origin));
  }

  const supabase = await getServerSupabase();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent(error?.message ?? "로그인을 완료하지 못했어요")}`,
        url.origin,
      ),
    );
  }

  const profile = await getProfile(data.user.id);
  const target = profile?.onboarded ? next : "/onboarding";
  return NextResponse.redirect(new URL(target, url.origin));
}
