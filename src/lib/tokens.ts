import type { Tiktoken } from "tiktoken";

/**
 * 토큰 카운터.
 *
 * tiktoken은 wasm 의존성이라 Vercel/Turbopack 번들에서 빠지는 경우가 있음 → lazy import + fallback.
 * fallback은 글자수 기반 휴리스틱(한글 위주 자료 평균 ~1.7 char/token).
 */

let encoder: Tiktoken | null = null;
let encoderInit: Promise<Tiktoken | null> | null = null;

async function loadEncoder(): Promise<Tiktoken | null> {
  if (encoder) return encoder;
  if (!encoderInit) {
    encoderInit = (async () => {
      try {
        const mod = await import("tiktoken");
        try {
          encoder = mod.encoding_for_model("gpt-4o");
        } catch {
          encoder = mod.get_encoding("cl100k_base");
        }
        return encoder;
      } catch {
        encoder = null;
        return null;
      }
    })();
  }
  return encoderInit;
}

function approximateTokens(text: string): number {
  // 한글 문자 ~ 1 token, 공백·라틴은 ~ 4 chars/token
  let total = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0xac00 && code <= 0xd7af) {
      total += 1; // 한글 음절
    } else if (code >= 0x4e00 && code <= 0x9fff) {
      total += 1; // 한자
    } else {
      total += 0.25;
    }
  }
  return Math.ceil(total);
}

export function countTokens(text: string): number {
  if (!text) return 0;
  if (encoder) {
    try {
      return encoder.encode(text).length;
    } catch {
      // fall through
    }
  }
  return approximateTokens(text);
}

/** 비동기 경로 — tiktoken을 쓸 수 있으면 정확값, 아니면 휴리스틱. */
export async function countTokensAsync(text: string): Promise<number> {
  if (!text) return 0;
  const enc = await loadEncoder();
  if (enc) {
    try {
      return enc.encode(text).length;
    } catch {
      // fall through
    }
  }
  return approximateTokens(text);
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
