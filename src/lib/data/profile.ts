import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export interface ProfileView {
  id: string;
  email: string | null;
  displayName: string | null;
  university: string | null;
  department: string | null;
  year: number | null;
  semesterYear: number | null;
  semesterTerm: "spring" | "fall" | null;
  onboarded: boolean;
}

function mapProfile(row: ProfileRow): ProfileView {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    university: row.university,
    department: row.department,
    year: row.year,
    semesterYear: row.semester_year,
    semesterTerm: row.semester_term,
    onboarded: Boolean(row.university && row.department && row.year),
  };
}

export async function getProfile(ownerId: string): Promise<ProfileView | null> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from("profiles")
    .select("*")
    .eq("id", ownerId)
    .maybeSingle();
  if (error || !data) return null;
  return mapProfile(data);
}

export async function updateProfile(opts: {
  ownerId: string;
  displayName?: string | null;
  university: string;
  department: string;
  year: number;
  semesterYear?: number | null;
  semesterTerm?: "spring" | "fall" | null;
}): Promise<boolean> {
  const admin = getAdminSupabase();
  const { error } = await admin
    .from("profiles")
    .upsert({
      id: opts.ownerId,
      display_name: opts.displayName ?? null,
      university: opts.university,
      department: opts.department,
      year: opts.year,
      semester_year: opts.semesterYear ?? null,
      semester_term: opts.semesterTerm ?? null,
    });
  return !error;
}
