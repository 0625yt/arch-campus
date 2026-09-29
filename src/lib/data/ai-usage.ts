import "server-only";
import {
  type AiUsageAggregateRow,
  kstMonthWindow,
  type MonthlyAiUsage,
  readMonthlyBudgetUsd,
  summarizeMonthlyAiUsage,
} from "@/lib/ai-budget";
import { getAdminSupabase } from "@/lib/supabase/admin";

export async function getMonthlyAiUsage(options: {
  ownerId: string;
  now?: Date;
}): Promise<MonthlyAiUsage> {
  const now = options.now ?? new Date();
  const window = kstMonthWindow(now);
  const admin = getAdminSupabase();
  const { data, error } = await admin.rpc("get_monthly_ai_usage", {
    p_owner_id: options.ownerId,
    p_start: window.startsAt,
    p_end: window.resetsAt,
  });

  if (error) throw new Error(`월간 AI 사용량을 불러오지 못했어요: ${error.message}`);
  return summarizeMonthlyAiUsage((data ?? []) as AiUsageAggregateRow[], {
    now,
    budgetUsd: readMonthlyBudgetUsd(),
  });
}
