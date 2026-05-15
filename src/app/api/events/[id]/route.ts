import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { tryGetOwnerId } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

// mutation 후 서버 컴포넌트 캐시 무효화 — 새로고침 없이 다음 요청에 최신 데이터.
function bustCalendarCache() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard/study", "layout");
}

type EventUpdate = Database["public"]["Tables"]["events"]["Update"];

/**
 * KST(Asia/Seoul, UTC+9) 기준 요일/시/분 추출.
 *
 * 서버는 Vercel(UTC)에서 돌고, 사용자 데이터는 한국 시간 의도로 박혔다.
 * Date.getDay/getHours는 서버 로컬 = UTC 기준이라 한국 월요일 10:00이
 * UTC 일요일 01:00으로 보임 → scope=all 매칭이 다 빗나감.
 *
 * 해결: ISO 문자열을 UTC 그대로 받고 +9h shift한 뒤 UTC 메서드로 추출.
 * (toLocaleString으로 timezone 변환은 Vercel에서 timezone DB가 보장 안 됨)
 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function kstParts(iso: string): { dow: number; hour: number; minute: number } {
  const t = new Date(iso).getTime();
  const kst = new Date(t + KST_OFFSET_MS);
  return {
    dow: kst.getUTCDay(),
    hour: kst.getUTCHours(),
    minute: kst.getUTCMinutes(),
  };
}

/**
 * 어떤 ISO datetime의 시·분 부분만 newH:newM(KST 기준)으로 바꾼 새 ISO 반환.
 * 날짜·요일은 유지 — scope=all로 시간 변경 시 각 회차의 날짜는 그대로 둬야 한 날에 안 포개짐.
 */
function shiftHourMinuteKst(iso: string, newH: number, newM: number): string {
  const t = new Date(iso).getTime();
  const kst = new Date(t + KST_OFFSET_MS);
  // KST 기준 같은 날짜에 시/분만 교체
  kst.setUTCHours(newH, newM, 0, 0);
  return new Date(kst.getTime() - KST_OFFSET_MS).toISOString();
}

export const runtime = "nodejs";

interface OkResponse {
  ok: true;
  affected: number;
}

interface ErrResponse {
  ok: false;
  error: string;
}

/**
 * scope = "this" : 이 회차만 (행 1개)
 * scope = "all"  : 같은 강의·같은 요일·같은 시간(시·분)·같은 kind=class인 모든 회차
 *                  → 시간표 수업 패턴 일괄 적용
 *
 * class kind가 아닌 단발성 이벤트는 scope 무시하고 항상 "this".
 */
const PatchBody = z
  .object({
    title: z.string().min(1).max(120).optional(),
    notes: z.string().max(2000).nullable().optional(),
    starts_at: z.string().datetime().optional(),
    ends_at: z.string().datetime().nullable().optional(),
    all_day: z.boolean().optional(),
    weight_percent: z.number().min(0).max(100).nullable().optional(),
    confirmed: z.boolean().optional(),
    scope: z.enum(["this", "all"]).default("this"),
  })
  .strict();

const DeleteQuery = z.enum(["this", "all"]).default("this");

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<OkResponse | ErrResponse>> {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) {
    return NextResponse.json({ ok: false, error: "로그인이 필요해요" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "id 누락" }, { status: 400 });
  }

  let body: z.infer<typeof PatchBody>;
  try {
    body = PatchBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `입력 검증 실패: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 400 },
    );
  }

  const update: EventUpdate = {};
  if (body.title !== undefined) {
    const t = body.title.trim();
    if (!t) {
      return NextResponse.json({ ok: false, error: "제목은 비울 수 없어요" }, { status: 400 });
    }
    update.title = t;
  }
  if (body.notes !== undefined) update.notes = body.notes?.trim() ? body.notes.trim() : null;
  if (body.all_day !== undefined) update.all_day = body.all_day;
  if (body.weight_percent !== undefined) update.weight_percent = body.weight_percent;
  if (body.confirmed !== undefined) update.confirmed = body.confirmed;

  // 시간 변경: starts_at만 바꾸면 ends_at도 비례 이동시켜야 자연스러움
  // 단순화: 사용자가 시간 바꾸면 두 개 다 같이 보내라. 하나만 와도 받기는 함.
  if (body.starts_at !== undefined) update.starts_at = body.starts_at;
  if (body.ends_at !== undefined) update.ends_at = body.ends_at;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: false, error: "수정할 항목이 없어요" }, { status: 400 });
  }

  const admin = getAdminSupabase();

  // 원본 이벤트 조회 — scope=all 적용 시 매칭 패턴 만들기 위해
  const { data: original, error: fetchErr } = await admin
    .from("events")
    .select("id, owner_id, course_id, kind, starts_at, ends_at, title")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json(
      { ok: false, error: `조회 실패: ${fetchErr.message}` },
      { status: 500 },
    );
  }
  if (!original) {
    return NextResponse.json({ ok: false, error: "일정을 찾을 수 없어요" }, { status: 404 });
  }

  // scope=all 은 class kind이고 course_id 있을 때만 의미 있음
  const useAll =
    body.scope === "all" && original.kind === "class" && !!original.course_id;

  if (useAll) {
    // 같은 course + class + 같은 (요일, 시·분) 일치하는 행 모두
    // 시간 비교는 to_char로 패턴 만들기 — Supabase는 raw SQL이 까다로워서
    // 모든 후보 가져와 JS에서 필터한 다음 id 배열로 update 한 번.
    const { data: candidates, error: candErr } = await admin
      .from("events")
      .select("id, starts_at, ends_at")
      .eq("owner_id", ownerId)
      .eq("course_id", original.course_id as string)
      .eq("kind", "class");

    if (candErr) {
      return NextResponse.json(
        { ok: false, error: `대상 조회 실패: ${candErr.message}` },
        { status: 500 },
      );
    }

    // KST 기준 요일·시·분이 모두 같은 회차만 매칭 (수업 시간표 패턴)
    const origK = kstParts(original.starts_at);
    const matchedIds = (candidates ?? [])
      .filter((row) => {
        const k = kstParts(row.starts_at);
        return k.dow === origK.dow && k.hour === origK.hour && k.minute === origK.minute;
      })
      .map((row) => row.id);

    if (matchedIds.length === 0) {
      return NextResponse.json({ ok: true, affected: 0 });
    }

    // 시간 변경(starts_at/ends_at)은 "전체 적용" 시 시간 부분만 옮긴다.
    // 날짜는 각 행의 원래 날짜 유지. (그렇지 않으면 모든 회차가 한 날에 포개짐)
    const newStart = body.starts_at ? new Date(body.starts_at) : null;
    const newEnd = body.ends_at ? new Date(body.ends_at) : null;
    const updatedRows: Array<{ id: string; starts_at?: string; ends_at?: string | null }> = [];

    if (newStart || newEnd !== null) {
      // 행마다 starts_at·ends_at의 시·분 부분만 새 값으로 교체.
      // 클라가 보낸 newStart/newEnd는 사용자가 입력한 KST 시·분이 ISO로 직렬화된 것.
      // 각 회차의 날짜는 그대로 유지 (전체 회차가 한 날에 포개지지 않게).
      const matchedRows = (candidates ?? []).filter((r) => matchedIds.includes(r.id));
      const newStartK = newStart ? kstParts(newStart.toISOString()) : null;
      const newEndK = newEnd ? kstParts(newEnd.toISOString()) : null;
      for (const row of matchedRows) {
        const next: { id: string; starts_at?: string; ends_at?: string | null } = { id: row.id };
        if (newStartK) {
          next.starts_at = shiftHourMinuteKst(row.starts_at, newStartK.hour, newStartK.minute);
        }
        if (newEnd !== undefined) {
          if (newEnd === null) {
            next.ends_at = null;
          } else if (newEndK) {
            // 종료 시간 기준 — starts_at의 ISO 그대로에서 시·분만 변경
            // (대부분 시작과 같은 날이라 안전. 새벽 자정 넘기는 수업은 드문 케이스)
            next.ends_at = shiftHourMinuteKst(row.starts_at, newEndK.hour, newEndK.minute);
          }
        }
        updatedRows.push(next);
      }
    }

    // 시간 외 항목(제목·메모 등)은 한 번에 update
    const otherUpdate: EventUpdate = { ...update };
    delete otherUpdate.starts_at;
    delete otherUpdate.ends_at;
    if (Object.keys(otherUpdate).length > 0) {
      const { error: upErr } = await admin
        .from("events")
        .update(otherUpdate)
        .in("id", matchedIds)
        .eq("owner_id", ownerId);
      if (upErr) {
        return NextResponse.json(
          { ok: false, error: `일괄 수정 실패: ${upErr.message}` },
          { status: 500 },
        );
      }
    }

    // 시간 변경 — 행마다 다른 값이라 순차 update
    for (const r of updatedRows) {
      const upd: EventUpdate = {};
      if (r.starts_at !== undefined) upd.starts_at = r.starts_at;
      if (r.ends_at !== undefined) upd.ends_at = r.ends_at;
      if (Object.keys(upd).length === 0) continue;
      const { error: upErr } = await admin
        .from("events")
        .update(upd)
        .eq("id", r.id)
        .eq("owner_id", ownerId);
      if (upErr) {
        return NextResponse.json(
          { ok: false, error: `시간 변경 실패: ${upErr.message}` },
          { status: 500 },
        );
      }
    }

    bustCalendarCache();
    return NextResponse.json({ ok: true, affected: matchedIds.length });
  }

  // scope=this — 단건 update
  const { error: upErr, count } = await admin
    .from("events")
    .update(update, { count: "exact" })
    .eq("id", id)
    .eq("owner_id", ownerId);

  if (upErr) {
    return NextResponse.json(
      { ok: false, error: `수정 실패: ${upErr.message}` },
      { status: 500 },
    );
  }
  bustCalendarCache();
  return NextResponse.json({ ok: true, affected: count ?? 0 });
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<OkResponse | ErrResponse>> {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) {
    return NextResponse.json({ ok: false, error: "로그인이 필요해요" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "id 누락" }, { status: 400 });
  }

  const url = new URL(req.url);
  let scope: z.infer<typeof DeleteQuery>;
  try {
    scope = DeleteQuery.parse(url.searchParams.get("scope") ?? "this");
  } catch {
    return NextResponse.json({ ok: false, error: "scope 잘못됨" }, { status: 400 });
  }

  const admin = getAdminSupabase();

  const { data: original, error: fetchErr } = await admin
    .from("events")
    .select("id, course_id, kind, starts_at")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json(
      { ok: false, error: `조회 실패: ${fetchErr.message}` },
      { status: 500 },
    );
  }
  if (!original) {
    return NextResponse.json({ ok: false, error: "일정을 찾을 수 없어요" }, { status: 404 });
  }

  const useAll = scope === "all" && original.kind === "class" && !!original.course_id;

  if (useAll) {
    const { data: candidates, error: candErr } = await admin
      .from("events")
      .select("id, starts_at")
      .eq("owner_id", ownerId)
      .eq("course_id", original.course_id as string)
      .eq("kind", "class");
    if (candErr) {
      return NextResponse.json(
        { ok: false, error: `대상 조회 실패: ${candErr.message}` },
        { status: 500 },
      );
    }
    const origK = kstParts(original.starts_at);
    const ids = (candidates ?? [])
      .filter((row) => {
        const k = kstParts(row.starts_at);
        return k.dow === origK.dow && k.hour === origK.hour && k.minute === origK.minute;
      })
      .map((row) => row.id);

    if (ids.length === 0) return NextResponse.json({ ok: true, affected: 0 });

    const { error, count } = await admin
      .from("events")
      .delete({ count: "exact" })
      .in("id", ids)
      .eq("owner_id", ownerId);
    if (error) {
      return NextResponse.json(
        { ok: false, error: `삭제 실패: ${error.message}` },
        { status: 500 },
      );
    }
    bustCalendarCache();
    return NextResponse.json({ ok: true, affected: count ?? ids.length });
  }

  const { error, count } = await admin
    .from("events")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("owner_id", ownerId);
  if (error) {
    return NextResponse.json(
      { ok: false, error: `삭제 실패: ${error.message}` },
      { status: 500 },
    );
  }
  if (!count) {
    return NextResponse.json({ ok: false, error: "일정을 찾을 수 없어요" }, { status: 404 });
  }
  bustCalendarCache();
  return NextResponse.json({ ok: true, affected: count });
}
