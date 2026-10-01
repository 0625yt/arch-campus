import "server-only";
import { z } from "zod";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const REFLECTION_CAUSES = [
  "concept-gap",
  "confused",
  "careless",
  "time-pressure",
  "guessed",
  "memory",
] as const;

export const AttemptReflectionInput = z.object({
  readiness: z.number().int().min(1).max(5),
  satisfaction: z.number().int().min(1).max(5),
  causes: z.array(z.enum(REFLECTION_CAUSES)).max(6),
  nextAction: z.string().trim().max(500),
  notes: z.string().trim().max(2000),
});

export type AttemptReflectionCause = (typeof REFLECTION_CAUSES)[number];

export interface AttemptReflection {
  readiness: number;
  satisfaction: number;
  causes: AttemptReflectionCause[];
  nextAction: string;
  notes: string;
  updatedAt: string;
}

export async function getAttemptReflection(opts: {
  ownerId: string;
  attemptId: string;
}): Promise<AttemptReflection | null> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from("attempt_reflections")
    .select("readiness, satisfaction, causes, next_action, notes, updated_at")
    .eq("owner_id", opts.ownerId)
    .eq("attempt_id", opts.attemptId)
    .maybeSingle();

  if (error || !data) return null;
  const causes = z.array(z.enum(REFLECTION_CAUSES)).safeParse(data.causes);
  return {
    readiness: data.readiness,
    satisfaction: data.satisfaction,
    causes: causes.success ? causes.data : [],
    nextAction: data.next_action ?? "",
    notes: data.notes ?? "",
    updatedAt: data.updated_at,
  };
}

export async function saveAttemptReflection(opts: {
  ownerId: string;
  attemptId: string;
  input: z.infer<typeof AttemptReflectionInput>;
}): Promise<AttemptReflection | null> {
  const admin = getAdminSupabase();
  const { data: attempt } = await admin
    .from("quiz_attempts")
    .select("id")
    .eq("id", opts.attemptId)
    .eq("owner_id", opts.ownerId)
    .maybeSingle();
  if (!attempt) return null;

  const updatedAt = new Date().toISOString();
  const { data, error } = await admin
    .from("attempt_reflections")
    .upsert(
      {
        owner_id: opts.ownerId,
        attempt_id: opts.attemptId,
        readiness: opts.input.readiness,
        satisfaction: opts.input.satisfaction,
        causes: opts.input.causes,
        next_action: opts.input.nextAction || null,
        notes: opts.input.notes || null,
        updated_at: updatedAt,
      },
      { onConflict: "owner_id,attempt_id" },
    )
    .select("readiness, satisfaction, causes, next_action, notes, updated_at")
    .single();
  if (error || !data) return null;

  return {
    readiness: data.readiness,
    satisfaction: data.satisfaction,
    causes: opts.input.causes,
    nextAction: data.next_action ?? "",
    notes: data.notes ?? "",
    updatedAt: data.updated_at,
  };
}
