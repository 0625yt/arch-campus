import { encoding_for_model, get_encoding, type Tiktoken } from "tiktoken";

let encoder: Tiktoken | null = null;

function getEncoder(): Tiktoken {
  if (encoder) return encoder;
  try {
    encoder = encoding_for_model("gpt-4o");
  } catch {
    encoder = get_encoding("cl100k_base");
  }
  return encoder;
}

export function countTokens(text: string): number {
  if (!text) return 0;
  const enc = getEncoder();
  return enc.encode(text).length;
}

export interface TokenBreakdown {
  rule: number;
  dynamic: number;
  user: number;
  total: number;
  cacheableShare: number;
}

export function breakdown(parts: { rule: string; dynamic: string; user: string }): TokenBreakdown {
  const rule = countTokens(parts.rule);
  const dynamic = countTokens(parts.dynamic);
  const user = countTokens(parts.user);
  const total = rule + dynamic + user;
  return {
    rule,
    dynamic,
    user,
    total,
    cacheableShare: total === 0 ? 0 : rule / total,
  };
}

export interface BudgetCheck {
  ok: boolean;
  total: number;
  budget: number;
  message?: string;
}

export function checkBudget(text: string, budget: number): BudgetCheck {
  const total = countTokens(text);
  return {
    ok: total <= budget,
    total,
    budget,
    message: total > budget ? `토큰 ${total} > 예산 ${budget} — 단축 필요` : undefined,
  };
}
