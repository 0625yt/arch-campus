import { KST_OFFSET_MS, kstParts } from "@/lib/kst";

export interface AiUsageAggregateRow {
  tool: string;
  call_count: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  cost_usd: number;
}

export interface AiUsageBreakdown {
  tool: string;
  label: string;
  calls: number;
  costUsd: number;
}

export interface MonthlyAiUsage {
  periodLabel: string;
  startsAt: string;
  resetsAt: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
  budgetUsd: number | null;
  usagePercent: number | null;
  limitReached: boolean;
  breakdown: AiUsageBreakdown[];
}

const TOOL_LABELS: Record<string, string> = {
  summarize: "자료 요약",
  quiz: "문제 생성",
  chat: "자료 질문",
  "chat-free": "자유 질문",
  timetable: "시간표 인식",
  syllabus: "강의계획서",
  "exam-extract": "기출 분석",
  "exam-solve": "기출 풀이",
  presentation: "발표 구성",
  "report-structure": "리포트 구성",
  "report-checklist": "리포트 점검",
  "exam-cram": "벼락치기",
  "book-review": "독후감",
  "event-parse": "일정 정리",
};

export function readMonthlyBudgetUsd(raw = process.env.AI_MONTHLY_BUDGET_USD): number | null {
  if (!raw?.trim()) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 10_000) return null;
  return parsed;
}

/** 요청 하나가 시작되기 전에 잡아두는 보수적 예상 비용. 실제 비용 기록 시 자동 정산된다. */
export function readAiRequestReserveUsd(raw = process.env.AI_REQUEST_RESERVE_USD): number {
  if (!raw?.trim()) return 0.1;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0.001 || parsed > 10) return 0.1;
  return parsed;
}

export function kstMonthWindow(now = new Date()): {
  label: string;
  startsAt: string;
  resetsAt: string;
} {
  const { year, month } = kstParts(now);
  const startsAt = new Date(Date.UTC(year, month - 1, 1) - KST_OFFSET_MS);
  const resetsAt = new Date(Date.UTC(year, month, 1) - KST_OFFSET_MS);
  return {
    label: `${year}년 ${month}월`,
    startsAt: startsAt.toISOString(),
    resetsAt: resetsAt.toISOString(),
  };
}

export function summarizeMonthlyAiUsage(
  rows: AiUsageAggregateRow[],
  options: { now?: Date; budgetUsd?: number | null } = {},
): MonthlyAiUsage {
  const window = kstMonthWindow(options.now);
  const budgetUsd = options.budgetUsd ?? null;
  const breakdown = rows
    .map((row) => ({
      tool: row.tool,
      label: TOOL_LABELS[row.tool] ?? "AI 도구",
      calls: Number(row.call_count) || 0,
      costUsd: Number(row.cost_usd) || 0,
    }))
    .sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls);
  const sum = (key: keyof AiUsageAggregateRow) =>
    rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
  const costUsd = sum("cost_usd");
  const usagePercent = budgetUsd ? Math.min(100, (costUsd / budgetUsd) * 100) : null;

  return {
    periodLabel: window.label,
    startsAt: window.startsAt,
    resetsAt: window.resetsAt,
    calls: sum("call_count"),
    inputTokens: sum("input_tokens"),
    outputTokens: sum("output_tokens"),
    cacheReadTokens: sum("cache_read_tokens"),
    cacheCreationTokens: sum("cache_creation_tokens"),
    costUsd,
    budgetUsd,
    usagePercent,
    limitReached: budgetUsd !== null && costUsd >= budgetUsd,
    breakdown,
  };
}

export function secondsUntilReset(resetsAt: string, now = new Date()): number {
  return Math.max(1, Math.ceil((new Date(resetsAt).getTime() - now.getTime()) / 1000));
}
