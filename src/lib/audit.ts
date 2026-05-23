import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getClientIp } from "@/lib/ratelimit";

/**
 * 민감 액션 감사 로그 — `audit_log` 테이블 (0016 migration).
 *
 * 사용 위치 (우선순위):
 *   - 로그인 콜백 (성공·실패) — 무차별 시도 추적
 *   - MFA enroll/verify/unenroll — 변경 시점 알리바이
 *   - 자료 업로드·삭제 — PIPA 신고 24시간 대응
 *   - 계정 삭제 — GDPR/PIPA 처리 증거
 *
 * 호출은 **fire-and-forget**. 감사 실패가 본 기능을 막으면 안 됨.
 *   - 실패는 console.error로만, 사용자 응답 차단 X
 *   - service-role로 박음 — RLS bypass (사용자가 자기 감사 로그 INSERT 못 함)
 *
 * 보안 가드:
 *   - actor null 허용 (로그인 전 액션도 기록 — brute force 추적)
 *   - target_id는 사용자 입력에서 직접 받지 마라. 검증된 row의 값을 넘겨라.
 *   - metadata에 secret·token·full body 넣지 마라 (감사 로그가 또다른 유출구)
 */

export type AuditAction =
  // 인증
  | "login.success"
  | "login.fail"
  | "signout.global"
  // MFA
  | "mfa.enroll"
  | "mfa.verify"
  | "mfa.unenroll"
  // 자료
  | "material.upload"
  | "material.delete"
  | "material.download"
  // 계정
  | "account.delete";

interface AuditEntry {
  ownerId: string | null;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const admin = getAdminSupabase();
    // types.ts regen 전이라 from을 typed 경로 우회 — service-role에서만 호출되니 RLS 무관.
    const { error } = await (admin as unknown as {
      from: (t: string) => {
        insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
      };
    })
      .from("audit_log")
      .insert({
        owner_id: entry.ownerId,
        action: entry.action,
        target_type: entry.targetType ?? null,
        target_id: entry.targetId ?? null,
        ip: entry.ip ?? null,
        user_agent: entry.userAgent ?? null,
        metadata: entry.metadata ?? {},
      });
    if (error) {
      console.error("[audit] insert failed", { action: entry.action, error });
    }
  } catch (e) {
    // 감사 실패가 본 요청 막으면 안 됨 — 본 액션의 사용자 응답을 우선
    console.error("[audit] exception", { action: entry.action, e });
  }
}

/**
 * Request 객체에서 ip·user-agent 뽑는 헬퍼 — 라우트 핸들러에서 호출 직전 한 줄.
 */
export function pickRequestContext(req: Request): { ip: string | null; userAgent: string | null } {
  return {
    ip: getClientIp(req) || null,
    userAgent: req.headers.get("user-agent"),
  };
}
