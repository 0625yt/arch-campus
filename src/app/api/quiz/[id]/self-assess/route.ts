import { NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { getAttemptResults, upsertAttemptResults } from "@/lib/data/attempts";
import { applySelfAssessment } from "@/lib/services/self-assessment";

export const runtime = "nodejs";
const Body = z.object({
  attemptId: z.string().uuid(),
  questionId: z.number().int().positive(),
  accepted: z.boolean(),
});
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  let ownerId: string;
  try {
    ownerId = await getOwnerId();
  } catch (error) {
    if (error instanceof UnauthorizedError)
      return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });
    throw error;
  }
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success)
    return NextResponse.json({ error: "요청 형식을 확인해주세요" }, { status: 400 });
  const { id: quizId } = await context.params;
  const scope = { ownerId, quizId, attemptId: body.data.attemptId };
  const results = await getAttemptResults(scope);
  const current = results?.find((r) => r.questionId === body.data.questionId);
  if (!current?.submitted)
    return NextResponse.json({ error: "채점된 답안을 찾지 못했어요" }, { status: 404 });
  const result = applySelfAssessment(current, body.data.accepted);
  const stored = await upsertAttemptResults({ ...scope, newResults: [result] });
  if (!stored)
    return NextResponse.json({ error: "채점 변경을 저장하지 못했어요" }, { status: 500 });
  return NextResponse.json({ ok: true, result, score: stored.score, total: stored.total });
}
