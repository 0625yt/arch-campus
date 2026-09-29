import { NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { rateReviewCard } from "@/lib/data/reviews";

export const runtime = "nodejs";

const Body = z.object({
  quizId: z.string().uuid(),
  questionId: z.number().int().nonnegative(),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
});

export async function POST(req: Request) {
  let ownerId: string;
  try {
    ownerId = await getOwnerId();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 401 });
    }
    throw error;
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "복습 평가 형식이 올바르지 않아요." },
      { status: 400 },
    );
  }
  const card = await rateReviewCard({ ownerId, ...parsed.data });
  if (!card) {
    return NextResponse.json(
      { ok: false, error: "복습 일정을 저장하지 못했어요." },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, dueAt: card.dueAt });
}
