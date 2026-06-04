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

  // 24h 중복 차단 — 같은 (owner, target)에 대해 24시간 내 1건
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: dupe } = await admin
    .from("feedback")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("target_type", input.targetType)
    .eq("target_id", input.targetId)
    .gte("created_at", since)
    .limit(1)
    .maybeSingle();

  if (dupe) {
    return NextResponse.json({ error: "최근에 이미 피드백을 남기셨어요" }, { status: 409 });
  }

  // quiz_item이면 body 앞에 [Q{n}] 자동 부착 — 어느 문항인지 식별
  let body = input.body ?? null;
  if (input.targetType === "quiz_item" && typeof input.quizQuestionIndex === "number") {
    const prefix = `[Q${input.quizQuestionIndex + 1}] `;
    body = body ? `${prefix}${body}` : prefix.trim();
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
