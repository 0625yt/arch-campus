import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

let cached: ReturnType<typeof createClient<Database>> | null = null;

/**
 * RLS를 우회하는 service-role 클라이언트.
 *
 * ⚠️ 안전 사용 규칙 (CLAUDE.md §1, §6 — 어기면 다른 사용자 데이터 노출):
 *
 *  1. **클라이언트 번들 import 금지**. 서버 코드(api 라우트, server actions, server components)에서만.
 *  2. **호출 직전에 `getOwnerId()` 또는 `tryGetOwnerId()`로 세션 검증**해 ownerId 확보.
 *  3. **모든 쿼리에 `.eq("owner_id", ownerId)`(또는 profiles는 `.eq("id", ownerId)`) 박기**.
 *     - select·update·delete 다 마찬가지. insert도 row.owner_id = ownerId.
 *     - Storage는 path prefix `<ownerId>/...`로 격리.
 *  4. **함수 인자로 `storagePath` 같은 path만 받는 헬퍼**는 호출부가 이미 owner 검증한 row의 값을
 *     넘기는지 직접 확인. 사용자 입력에서 직접 받은 path는 절대 X.
 *
 * 신규 라우트 작성 시 위 4개 중 하나라도 빠지면 PR 차단.
 * 참고 패턴: [src/app/api/materials/[id]/route.ts](../../app/api/materials/[id]/route.ts) DELETE 핸들러.
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
