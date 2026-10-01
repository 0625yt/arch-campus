import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { safeAuthRedirect } from "./lib/auth-redirect";
import { requiresMfa } from "./lib/mfa";
import type { Database } from "./lib/supabase/types";

const PUBLIC_PREFIXES = ["/", "/login", "/signup", "/auth", "/terms", "/privacy"];

/**
 * 모든 요청마다 Supabase 세션 쿠키 갱신 + 보호 라우트 게이트.
 *
 * 정책:
 * - PUBLIC_PREFIXES 안 라우트는 통과 (로그인·회원가입·인증 콜백·약관)
 * - 그 외 라우트는 user 없으면 /login으로 (production만)
 * - DEV (NODE_ENV !== production)에서는 auth.ts의 DEV_FALLBACK_USER_ID 사용
 * - 로그인 상태에서 /login·/signup 접근 시 /dashboard로 (UX 마찰 제거)
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;

  // 순수 공개 콘텐츠는 세션에 따라 달라지지 않는다. Proxy에서 원격 auth 조회를
  // 기다리지 않아야 정적 랜딩의 캐시·TTFB 이점을 그대로 얻는다.
  const isAuthFreePublicPage =
    pathname === "/" ||
    pathname === "/terms" ||
    pathname.startsWith("/terms/") ||
    pathname === "/privacy" ||
    pathname.startsWith("/privacy/");
  if (isAuthFreePublicPage) return response;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return response;

  const supabase = createServerClient<Database>(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  function redirectWithCookies(path: string) {
    const redirected = NextResponse.redirect(new URL(path, request.url));
    for (const cookie of response.cookies.getAll()) redirected.cookies.set(cookie);
    return redirected;
  }
  if (user && !pathname.startsWith("/auth/") && (await requiresMfa(supabase, user))) {
    const next = safeAuthRedirect(
      pathname === "/login" || pathname === "/signup"
        ? request.nextUrl.searchParams.get("next")
        : pathname + request.nextUrl.search,
    );
    return redirectWithCookies(`/auth/mfa?next=${encodeURIComponent(next)}`);
  }

  const isPublic = PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!user && !isPublic && process.env.NODE_ENV === "production") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname + request.nextUrl.search);
    return redirectWithCookies(url.pathname + url.search);
  }

  // 로그인 상태에서 인증 페이지 진입 → 대시보드로. /login/forgot, /signup/verify, /auth/reset은
  // 중간 상태이거나 외부 콜백이라 양쪽 모두 허용 (verify는 메일 클릭 전, reset은 메일 클릭 직후).
  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return redirectWithCookies(url.pathname + url.search);
  }

  return response;
}

export const config = {
  // /api/*는 자체 getCurrentUser()를 호출하니 proxy에서 제외.
  // multipart 업로드 요청을 proxy가 거치면 본문이 buffer되며 boundary 손상돼 formData() 실패.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
