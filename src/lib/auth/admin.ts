/**
 * /admin/* 라우트와 admin API에서 사용하는 화이트리스트.
 *
 * env ADMIN_USER_IDS는 콤마 구분. 비어있거나 미설정이면 누구도 admin X.
 * 운영 변경: Vercel env에 본인 user_id 추가 후 재배포.
 */
export function isAdminUserId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const raw = process.env.ADMIN_USER_IDS?.trim();
  if (!raw) return false;
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return ids.includes(userId);
}
