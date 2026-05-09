import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

let cached: ReturnType<typeof createClient<Database>> | null = null;

/**
 * RLS를 우회하는 service-role 클라이언트.
 * 절대 클라이언트 번들에 import 금지 — 서버 코드(api 라우트, server actions)에서만.
 * 호출부에서 userId를 세션과 재검증해야 안전 (CLAUDE.md §1).
 */
export function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY 또는 NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았어요");
  }
  if (cached) return cached;
  cached = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
