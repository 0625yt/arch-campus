import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { AttemptReflectionInput, saveAttemptReflection } from "@/lib/data/attempt-reflections";

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let ownerId: string;
  try {
    ownerId = await getOwnerId();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 401 });
    }
    throw error;
  }

  const { id } = await ctx.params;
  const parsed = AttemptReflectionInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "회고 입력값을 다시 확인해주세요." },
      { status: 400 },
    );
  }

  const reflection = await saveAttemptReflection({
    ownerId,
    attemptId: id,
    input: parsed.data,
  });
  if (!reflection) {
    return NextResponse.json(
      { ok: false, error: "풀이 기록을 찾지 못했거나 회고를 저장하지 못했어요." },
      { status: 404 },
    );
  }

  revalidatePath("/dashboard/quiz", "layout");
  return NextResponse.json({ ok: true, reflection });
}
