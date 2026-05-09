import { getCurrentUser } from "./supabase/server";

/**
 * 인증 미도입 상태에서 server action·route handler가 owner_id를 안정적으로 잡는 통로.
 *
 * 정책:
 * 1) 진짜 세션이 있으면 그 user.id 사용
 * 2) 없고 NODE_ENV !== "production"이면 DEV_FALLBACK_USER_ID
 * 3) 프로덕션이고 세션도 없으면 401 throw — UI 라우트에서 catch
 *
 * 이 함수는 서버에서만 호출. CLAUDE.md §1·§4 정책 위반 시 보안 사고 가능.
 */

export const DEV_FALLBACK_USER_ID = "00000000-0000-0000-0000-000000000001";

export class UnauthorizedError extends Error {
  constructor(message = "로그인이 필요해요") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function getOwnerId(): Promise<string> {
  const user = await getCurrentUser();
  if (user?.id) return user.id;
  if (process.env.NODE_ENV !== "production") return DEV_FALLBACK_USER_ID;
  throw new UnauthorizedError();
}

export async function tryGetOwnerId(): Promise<string | null> {
  try {
    return await getOwnerId();
  } catch {
    return null;
  }
}
