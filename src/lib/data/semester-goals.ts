import "server-only";
import type { SemesterTerm } from "@/lib/academic";
import { getAdminSupabase } from "@/lib/supabase/admin";

export interface SemesterGoal {
  targetGpa: number | null;
  targetCredits: number | null;
  reflection: string | null;
}

export async function getSemesterGoal(opts: {
  ownerId: string;
  year: number;
  term: SemesterTerm;
}): Promise<SemesterGoal> {
  const admin = getAdminSupabase();
  const { data } = await admin
    .from("semester_goals")
    .select("target_gpa, target_credits, reflection")
    .eq("owner_id", opts.ownerId)
    .eq("semester_year", opts.year)
    .eq("semester_term", opts.term)
    .maybeSingle();
  return {
    targetGpa: data?.target_gpa ?? null,
    targetCredits: data?.target_credits ?? null,
    reflection: data?.reflection ?? null,
  };
}
