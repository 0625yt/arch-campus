import { NextResponse } from "next/server";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { recordAudit, pickRequestContext } from "@/lib/audit";
import { guardRateLimit, type RateLimitErrBody } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "materials";

interface DeleteOk {
  ok: true;
  deleted: {
    materials: number;
    courses: number;
    events: number;
    quizzes: number;
    storageObjects: number;
  };
}

interface DeleteErr {
  ok: false;
  error: string;
}

/**
 * GDPR/PIPA 계정 삭제 — 본인 모든 데이터 cascade 삭제 + Storage 객체 + auth.user.
 *
 * 흐름:
 *   1) 인증 + rate limit (login bucket — 무차별 삭제 시도 봉인)
 *   2) Storage `<ownerId>/...` 전체 list → remove
 *   3) public.* 테이블 owner_id = ownerId 행 모두 DELETE
 *      - jobs, generations, quiz_attempts, quizzes, events, materials, courses, profiles
 *      - audit_log은 ownerId set null 처리 (FK on delete set null) → 감사 무결성
 *   4) auth.admin.deleteUser → 세션·refresh token 폐기
 *   5) audit_log 기록 (ownerId=null로 남음 — 위 set null 때문)
 *
 * 비가역. 30일 soft delete grace는 별도 sprint (지금은 즉시 삭제).
 *
 * 클라이언트는 응답 200 받으면 세션 끊기 + /login.
 */
export async function DELETE(req: Request): Promise<NextResponse<DeleteOk | DeleteErr | RateLimitErrBody>> {
  let ownerId: string;
  try {
    ownerId = await getOwnerId();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    throw e;
  }

  // login bucket으로 캡 — 분당 무한 삭제 시도 차단
  const block = await guardRateLimit("login", ownerId);
  if (block) return block;

  const admin = getAdminSupabase();
  const ctx = pickRequestContext(req);

  // 1) Storage 객체 — list는 한 번에 최대 100개. 자료 많으면 페이지네이션.
  let storageDeleted = 0;
  try {
    const prefix = `${ownerId}`;
    // recursive list
    const allPaths: string[] = [];
    let offset = 0;
    const PAGE = 100;
    for (;;) {
      const { data, error } = await admin.storage
        .from(BUCKET)
        .list(prefix, { limit: PAGE, offset });
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const f of data) {
        allPaths.push(`${prefix}/${f.name}`);
      }
      if (data.length < PAGE) break;
      offset += PAGE;
    }
    if (allPaths.length > 0) {
      // remove는 한 번에 1000개까지 — 그 이상이면 chunk
      const CHUNK = 1000;
      for (let i = 0; i < allPaths.length; i += CHUNK) {
        const slice = allPaths.slice(i, i + CHUNK);
        const { error } = await admin.storage.from(BUCKET).remove(slice);
        if (error) {
          console.error("[account.delete] storage remove failed", { error: error.message });
        } else {
          storageDeleted += slice.length;
        }
      }
    }
  } catch (e) {
    console.error("[account.delete] storage cleanup failed", e);
    // 진행은 계속 — DB 삭제가 우선
  }

  // 2) DB cascade — 자식 → 부모 순서. FK on delete cascade가 모두 박혀있으면
  //    materials만 지워도 되지만 schema에 cascade 빠진 곳 있을 수 있어 보수적으로 명시.
  type OwnerTable =
    | "quiz_attempts"
    | "generations"
    | "jobs"
    | "quizzes"
    | "events"
    | "materials"
    | "courses";
  async function deleteTable(name: OwnerTable): Promise<number> {
    const { error, count } = await admin
      .from(name)
      // count: exact는 큰 테이블에서 비싼데 사용자 1명 row는 작아서 OK
      .delete({ count: "exact" })
      .eq("owner_id", ownerId);
    if (error) {
      console.error(`[account.delete] ${name} delete failed`, { error: error.message });
      return 0;
    }
    return count ?? 0;
  }

  // 순서: 깊은 자식부터.
  await deleteTable("quiz_attempts");
  await deleteTable("generations");
  await deleteTable("jobs");
  const quizzesCount = await deleteTable("quizzes");
  const eventsCount = await deleteTable("events");
  const materialsCount = await deleteTable("materials");
  const coursesCount = await deleteTable("courses");
  // profiles는 PK가 id (ownerId 그 자체), 아래 auth.deleteUser cascade로 같이 사라짐.
  // 명시 삭제는 race 방지 차원에서만.
  await admin.from("profiles").delete().eq("id", ownerId);

  // 3) auth.user 삭제 — 세션·refresh token 즉시 폐기
  const { error: authErr } = await admin.auth.admin.deleteUser(ownerId);
  if (authErr) {
    console.error("[account.delete] auth deleteUser failed", { error: authErr.message });
    // user row가 남으면 다시 로그인 가능 → 위 데이터는 비어 있지만 계정은 유지됨.
    // 사용자에게는 retry 안내.
    return NextResponse.json(
      { ok: false, error: `계정 삭제 마무리 실패: ${authErr.message}. 다시 시도해 주세요.` },
      { status: 500 },
    );
  }

  // 4) audit — ownerId는 위 deleteUser로 사라졌으니 set null 들어감.
  //    targetId만 ownerId 박아서 추후 신고 대응 시 추적 가능.
  void recordAudit({
    ownerId: null,
    action: "account.delete",
    targetType: "user",
    targetId: ownerId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    metadata: {
      materials: materialsCount,
      courses: coursesCount,
      events: eventsCount,
      quizzes: quizzesCount,
      storageObjects: storageDeleted,
    },
  });

  return NextResponse.json({
    ok: true,
    deleted: {
      materials: materialsCount,
      courses: coursesCount,
      events: eventsCount,
      quizzes: quizzesCount,
      storageObjects: storageDeleted,
    },
  });
}
