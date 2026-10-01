import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { SEMESTER_TERMS } from "@/lib/academic";
import { tryGetOwnerId } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/supabase/admin";

const Body = z.object({
  year: z.number().int().min(2000).max(2100),
  term: z.enum(SEMESTER_TERMS),
  targetGpa: z.number().min(0).max(4.5).multipleOf(0.01).nullable(),
  targetCredits: z.number().min(0).max(30).multipleOf(0.5).nullable(),
  reflection: z.string().max(2000).nullable(),
});

export async function PATCH(req: Request) {
  const ownerId = await tryGetOwnerId();
  if (!ownerId)
    return NextResponse.json({ ok: false, error: "로그인이 필요해요." }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "목표 입력값을 확인해주세요." }, { status: 400 });
  }
  const admin = getAdminSupabase();
  const { error } = await admin.from("semester_goals").upsert(
    {
      owner_id: ownerId,
      semester_year: parsed.data.year,
      semester_term: parsed.data.term,
      target_gpa: parsed.data.targetGpa,
      target_credits: parsed.data.targetCredits,
      reflection: parsed.data.reflection?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,semester_year,semester_term" },
  );
  if (error)
    return NextResponse.json(
      { ok: false, error: "학기 목표를 저장하지 못했어요." },
      { status: 500 },
    );
  revalidatePath("/dashboard/grades");
  return NextResponse.json({ ok: true });
}
