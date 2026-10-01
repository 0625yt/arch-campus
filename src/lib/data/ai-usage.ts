import "server-only";
import {
  type AiUsageAggregateRow,
  kstMonthWindow,
  type MonthlyAiUsage,
  readAiRequestReserveUsd,
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

export interface AiBudgetReservation {
  allowed: boolean;
  spentUsd: number;
  reservedUsd: number;
  resetsAt: string;
}

/**
 * 월 상한 검사와 요청 예상 비용 예약을 DB 트랜잭션 하나에서 처리한다.
 * 사용자별 advisory lock으로 여러 서버 인스턴스의 동시 요청도 직렬화된다.
 */
export async function reserveMonthlyAiBudget(options: {
  ownerId: string;
  now?: Date;
}): Promise<AiBudgetReservation> {
  const budgetUsd = readMonthlyBudgetUsd();
  const now = options.now ?? new Date();
  const window = kstMonthWindow(now);
  if (budgetUsd === null) {
    return { allowed: true, spentUsd: 0, reservedUsd: 0, resetsAt: window.resetsAt };
  }

  const reserveUsd = readAiRequestReserveUsd();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
  const admin = getAdminSupabase();
  const { data, error } = await admin.rpc("reserve_monthly_ai_budget", {
    p_owner_id: options.ownerId,
    p_start: window.startsAt,
    p_end: window.resetsAt,
    p_budget_usd: budgetUsd,
    p_reserve_usd: reserveUsd,
    p_expires_at: expiresAt,
  });

  if (error) throw new Error(`월간 AI 비용을 예약하지 못했어요: ${error.message}`);
  const row = data?.[0];
  if (!row) throw new Error("월간 AI 비용 예약 결과가 비어 있어요.");
  return {
    allowed: row.allowed,
    spentUsd: Number(row.spent_usd) || 0,
    reservedUsd: Number(row.reserved_usd) || 0,
    resetsAt: window.resetsAt,
  };
}
