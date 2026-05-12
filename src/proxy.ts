import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./lib/supabase/types";

const PUBLIC_PREFIXES = ["/login", "/auth"];

/**
 * 모든 요청마다 Supabase 세션 쿠키 갱신 + 보호 라우트 게이트.
 *
 * 정책:
 * - /login, /auth/*, 정적 자원은 통과
 * - 그 외 라우트는 user 없으면 /login으로 (production만)
 * - DEV (NODE_ENV !== production)에서는 auth.ts의 DEV_FALLBACK_USER_ID 사용
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

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

  const pathname = request.nextUrl.pathname;
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!user && !isPublic && process.env.NODE_ENV === "production") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard/today";
    return NextResponse.redirect(url);
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
