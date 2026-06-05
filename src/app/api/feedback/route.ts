import { NextResponse } from "next/server";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { FeedbackInsertBody, isValidCategoryFor } from "@/lib/schemas/feedback";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let ownerId: string;
  try {
    ownerId = await getOwnerId();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });
    }
    throw e;
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청 형식" }, { status: 400 });
  }

  const parsed = FeedbackInsertBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "입력 형식이 맞지 않아요", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;

  if (!isValidCategoryFor(input.targetType, input.category)) {
    return NextResponse.json({ error: "카테고리가 맞지 않아요" }, { status: 400 });
  }

  // feedback 테이블은 supabase types 재생성 전이라 any로 캐스팅
  const admin = getAdminSupabase() as unknown as {
    from: (table: string) => any;
  };

  // quiz_item이면 body 앞에 [Q{n}] 자동 부착 — 어느 문항인지 식별
  let body = input.body ?? null;
  if (input.targetType === "quiz_item" && typeof input.quizQuestionIndex === "number") {
    const prefix = `[Q${input.quizQuestionIndex + 1}] `;
    body = body ? `${prefix}${body}` : prefix.trim();
  }

  // 더블클릭·재시도로 인한 "진짜 중복"만 막는다 (10초 윈도우).
  // 예전엔 같은 (owner, target)에 24시간 1건만 허용해서, 같은 자료의 다른 문항·다른
  // 카테고리로 또 남기려 하면 "이미 남겼다"고 차단됐다. 사용자는 원할 때마다 남길 수 있어야
  // 하므로, 같은 owner·target·category·body(문항 프리픽스 포함)가 10초 내 또 들어올 때만 reject.
  const since = new Date(Date.now() - 10 * 1000).toISOString();
  let dupeQuery = admin
    .from("feedback")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("target_type", input.targetType)
    .eq("target_id", input.targetId)
    .eq("category", input.category)
    .gte("created_at", since);
  // body가 같은지까지 비교 — 문항 프리픽스([Q2])나 본문이 다르면 다른 피드백으로 본다.
  dupeQuery = body === null ? dupeQuery.is("body", null) : dupeQuery.eq("body", body);
  const { data: dupe } = await dupeQuery.limit(1).maybeSingle();

  if (dupe) {
    return NextResponse.json({ error: "방금 같은 피드백을 보냈어요" }, { status: 409 });
  }

  const { data, error } = await admin
    .from("feedback")
    .insert({
      owner_id: ownerId,
      target_type: input.targetType,
      target_id: input.targetId,
      generation_id: input.generationId ?? null,
      rating: input.rating,
      category: input.category,
      body,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "저장에 실패했어요", detail: error?.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ id: (data as { id: string }).id }, { status: 201 });
}
