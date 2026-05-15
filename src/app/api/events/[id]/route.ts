import { NextResponse } from "next/server";
import { z } from "zod";
import { tryGetOwnerId } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

type EventUpdate = Database["public"]["Tables"]["events"]["Update"];

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

    const origStart = new Date(original.starts_at);
    const origDow = origStart.getDay();
    const origH = origStart.getHours();
    const origM = origStart.getMinutes();
    const matchedIds = (candidates ?? [])
      .filter((row) => {
        const d = new Date(row.starts_at);
        return d.getDay() === origDow && d.getHours() === origH && d.getMinutes() === origM;
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
      // 행마다 starts_at·ends_at만 시·분으로 옮긴다
      const matchedRows = (candidates ?? []).filter((r) => matchedIds.includes(r.id));
      for (const row of matchedRows) {
        const cur = new Date(row.starts_at);
        const next: { id: string; starts_at?: string; ends_at?: string | null } = { id: row.id };
        if (newStart) {
          const adj = new Date(cur);
          adj.setHours(newStart.getHours(), newStart.getMinutes(), 0, 0);
          next.starts_at = adj.toISOString();
        }
        if (newEnd !== undefined) {
          if (newEnd === null) {
            next.ends_at = null;
          } else {
            const adj = new Date(cur);
            adj.setHours(newEnd.getHours(), newEnd.getMinutes(), 0, 0);
            next.ends_at = adj.toISOString();
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
    const origStart = new Date(original.starts_at);
    const origDow = origStart.getDay();
    const origH = origStart.getHours();
    const origM = origStart.getMinutes();
    const ids = (candidates ?? [])
      .filter((row) => {
        const d = new Date(row.starts_at);
        return d.getDay() === origDow && d.getHours() === origH && d.getMinutes() === origM;
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
  return NextResponse.json({ ok: true, affected: count });
}
