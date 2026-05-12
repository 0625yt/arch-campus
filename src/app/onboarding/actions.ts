"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getOwnerId } from "@/lib/auth";
import { updateProfile } from "@/lib/data/profile";

const Schema = z.object({
  displayName: z.string().max(40).optional().nullable(),
  university: z.string().min(1, "학교를 입력해주세요").max(60),
  department: z.string().min(1, "전공을 입력해주세요").max(60),
  year: z.coerce.number().int().min(1).max(6),
  semesterYear: z.coerce.number().int().min(2020).max(2099).optional().nullable(),
  semesterTerm: z.enum(["spring", "fall"]).optional().nullable(),
});

export type OnboardingState = { error?: string } | undefined;

export async function saveOnboarding(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  let ownerId: string;
  try {
    ownerId = await getOwnerId();
  } catch {
    redirect("/login");
  }

  const parsed = Schema.safeParse({
    displayName: formData.get("displayName") || null,
    university: formData.get("university"),
    department: formData.get("department"),
    year: formData.get("year"),
    semesterYear: formData.get("semesterYear") || null,
    semesterTerm: formData.get("semesterTerm") || null,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력을 확인해주세요" };
  }

  const ok = await updateProfile({
    ownerId,
    displayName: parsed.data.displayName ?? null,
    university: parsed.data.university,
    department: parsed.data.department,
    year: parsed.data.year,
    semesterYear: parsed.data.semesterYear ?? null,
    semesterTerm: parsed.data.semesterTerm ?? null,
  });

  if (!ok) {
    return { error: "저장에 실패했어요. 잠시 후 다시 시도해주세요." };
  }

  redirect("/dashboard/today");
}
