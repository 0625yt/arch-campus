import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

/**
 * Upstash 기반 rate limit — 라우트별 limiter를 미리 정의해 한 곳에서 관리.
 *
 * 위협 (OWASP A07·LLM04):
 *   - 무한 AI 호출 → 사용자당 월 적자 (CLAUDE.md §1)
 *   - 로그인 brute force
 *   - 자료 일괄 다운 스크래핑
 *
 * 동작:
 *   - UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN env가 있으면 Upstash(분산) 활성
 *   - 없으면 인메모리 폴백 — 단일 인스턴스 내 sliding window로 "무제한 호출"만은 막는다.
 *     (Vercel Fluid Compute는 인스턴스를 재사용하므로 hot 상태에선 실효. 다만 인스턴스가
 *      여러 개로 스케일아웃되면 인스턴스 수만큼 한도가 곱해진다 — 완벽한 분산 제한은
 *      Upstash가 있어야 함. 폴백은 최후 방어선이지 정식 대체가 아니다.)
 *
 * 제한 저장소 오류 시 503을 반환한다. 비용이 발생하는 작업을 무제한 허용하지 않는다.
 *
 * 키:
 *   - 우선 user_id (인증된 케이스), 없으면 IP — 한국 통신사 NAT IP 충돌 줄이려고 user_id 우선
 *
 * 사용:
 *   const { success, headers } = await checkRateLimit("ai", ownerId)
 *   if (!success) return new Response("Too Many Requests", { status: 429, headers })
 */

interface LimiterConfig {
  /** Sliding window 토큰 수 */
  tokens: number;
  /** 윈도우 길이 — "10 s" / "1 m" / "1 h" 형식 */
  window: `${number} ${"s" | "m" | "h" | "d"}`;
}

/**
 * 라우트 카테고리별 정책. 값은 보수적 시작 — 운영 데이터 보고 조정.
 *
 *   - ai: 사용자당 분당 6회 (10초당 1회) → 한 학생이 분당 6개 자료 처리는 비정상
 *   - login: IP당 5분에 10회 → magic link 무한 발송 차단
 *   - upload: 사용자당 1시간 30회 → 50MB×30 = 1.5GB/시간 캡
 *   - default: 사용자당 분당 60회 (일반 GET)
 */
const POLICIES: Record<string, LimiterConfig> = {
  ai: { tokens: 6, window: "1 m" },
  login: { tokens: 10, window: "5 m" },
  upload: { tokens: 30, window: "1 h" },
  default: { tokens: 60, window: "1 m" },
};

let redis: Redis | null = null;
const limiters = new Map<string, Ratelimit>();

let warnedNoEnvInProd = false;
function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    // prod에서 env 누락 시 인메모리 폴백으로 동작 — 한 번만 큰 로그로 알린다.
    // Vercel logs 검색 시 즉시 잡히게 메시지 고정. (분산 제한이 필요하면 Upstash 연결.)
    if (process.env.NODE_ENV === "production" && !warnedNoEnvInProd) {
      warnedNoEnvInProd = true;
      console.error(
        "[ratelimit.CRITICAL] UPSTASH_REDIS_REST_URL/TOKEN not set in production. " +
          "Falling back to IN-MEMORY rate limit (single-instance only — abuse protection is " +
          "weaker across scaled instances). Set both env vars in Vercel for distributed limits.",
      );
    }
    return null;
  }
  redis = new Redis({ url, token });
  return redis;
}

/* ── 인메모리 폴백 — Upstash 없을 때 단일 인스턴스 sliding window ───────────────
 * key = `${kind}:${identifier}`. 값은 윈도우 안의 hit timestamp(ms) 배열.
 * 호출마다 윈도우 밖 항목을 잘라내고, 남은 수가 정책 토큰 이상이면 차단.
 * 메모리 무한 증식 방지: 비어버린 key는 즉시 삭제, 전체 key 수가 상한 넘으면 정리. */
const memHits = new Map<string, number[]>();
const memExpires = new Map<string, number>();
const MEM_KEY_CAP = 50_000;

function windowMs(window: LimiterConfig["window"]): number {
  const [n, unit] = window.split(" ") as [string, "s" | "m" | "h" | "d"];
  const mult = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  return Number(n) * mult;
}

function memLimit(kind: string, identifier: string): RateLimitResult {
  const policy = POLICIES[kind] ?? POLICIES.default;
  const span = windowMs(policy.window);
  const now = Date.now();
  const key = `${kind}:${identifier}`;
  if (!memHits.has(key) && memHits.size >= MEM_KEY_CAP) {
    for (const [entry, expiry] of memExpires) {
      if (expiry <= now) {
        memHits.delete(entry);
        memExpires.delete(entry);
      }
    }
    if (memHits.size >= MEM_KEY_CAP) return unavailableLimit();
  }
  const prior = memHits.get(key) ?? [];
  // 윈도우 밖(만료) 타임스탬프 제거
  const fresh = prior.filter((t) => now - t < span);

  if (fresh.length >= policy.tokens) {
    // 차단 — 가장 오래된 hit가 윈도우를 벗어나는 시점까지 기다려야 함
    memHits.set(key, fresh);
    const oldest = fresh[0];
    const resetMs = oldest + span;
    const retryAfterSec = Math.max(1, Math.ceil((resetMs - now) / 1000));
    return {
      success: false,
      headers: {
        "X-RateLimit-Limit": String(policy.tokens),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(resetMs),
        "Retry-After": String(retryAfterSec),
      },
    };
  }

  fresh.push(now);
  memHits.set(key, fresh);
  memExpires.set(key, now + span);
  return {
    success: true,
    headers: {
      "X-RateLimit-Limit": String(policy.tokens),
      "X-RateLimit-Remaining": String(policy.tokens - fresh.length),
      "X-RateLimit-Reset": String(now + span),
    },
  };
}

function getLimiter(kind: string): Ratelimit | null {
  const r = getRedis();
  if (!r) return null;
  if (limiters.has(kind)) return limiters.get(kind)!;
  const policy = POLICIES[kind] ?? POLICIES.default;
  const lim = new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(policy.tokens, policy.window),
    analytics: true,
    prefix: `arch-campus:rl:${kind}`,
  });
  limiters.set(kind, lim);
  return lim;
}

export interface RateLimitResult {
  success: boolean;
  unavailable?: boolean;
  /** 응답에 박을 headers — 429일 때 Retry-After 등 */
  headers: Record<string, string>;
}

/**
 * 라우트 진입 시 호출.
 *   - identifier: user_id 또는 IP (앱이 결정. 인증된 라우트는 ownerId)
 *   - kind: POLICIES 키
 *
 * Upstash env 미설정 시 인메모리 폴백(단일 인스턴스 sliding window)으로 동작.
 * 저장소 및 폴백 오류는 작업을 시작하지 않고 503으로 재시도를 안내한다.
 */
function unavailableLimit(): RateLimitResult {
  return { success: false, unavailable: true, headers: { "Retry-After": "30" } };
}

export async function checkRateLimit(
  kind: keyof typeof POLICIES | string,
  identifier: string,
): Promise<RateLimitResult> {
  try {
    const lim = getLimiter(kind);
    if (!lim) return memLimit(kind, identifier);
    const { success, limit, remaining, reset } = await lim.limit(identifier);
    const headers: Record<string, string> = {
      "X-RateLimit-Limit": String(limit),
      "X-RateLimit-Remaining": String(remaining),
      "X-RateLimit-Reset": String(reset),
    };
    if (!success) {
      const retryAfterSec = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
      headers["Retry-After"] = String(retryAfterSec);
    }
    return { success, headers };
  } catch {
    return unavailableLimit();
  }
}

/**
 * 인증 안 된 요청용 식별자 — 헤더에서 IP 뽑기.
 * Vercel은 x-forwarded-for 또는 x-real-ip를 박는다.
 * 프록시 체인이 길면 첫 IP가 진짜 클라이언트.
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Route handler 안에서 한 줄로 호출 — 초과 시 즉시 429 NextResponse 반환.
 *
 * 사용:
 *   const blocked = await guardRateLimit("ai", ownerId);
 *   if (blocked) return blocked;
 *
 * env 미설정·hit 안 됨이면 null 반환 → 호출자가 그대로 진행.
 *
 * Type: generic을 T로 두어 라우트의 좁힌 NextResponse 타입과 호환되게 한다.
 * 429 body는 `{ ok:false, error, retryAfterSec }`로 통일 — 라우트의 ErrResponse가
 * 이를 표현 못 해도 T로 캐스팅해 컴파일 통과 (런타임은 그대로).
 */
/**
 * 429 응답 body의 정확한 형태 — 클라이언트가 안전하게 타이핑 가능.
 * 라우트별 ErrResponse union에 이 타입을 추가해 사용.
 */
export interface RateLimitErrBody {
  ok: false;
  kind: string;
  error: string;
  retryAfterSec: number;
}

export async function guardRateLimit(
  kind: keyof typeof POLICIES | string,
  identifier: string,
): Promise<NextResponse<RateLimitErrBody> | null> {
  const { success, headers, unavailable } = await checkRateLimit(kind, identifier);
  if (success) return null;
  // kind를 error 메시지·body에 포함 — 클라이언트가 어떤 limit에 걸렸는지 분기 가능
  const friendlyKind =
    kind === "ai"
      ? "자료 처리"
      : kind === "upload"
        ? "파일 업로드"
        : kind === "login"
          ? "로그인 시도"
          : "요청";
  const body: RateLimitErrBody = {
    ok: false,
    kind: String(kind),
    error: unavailable
      ? "요청 제한을 확인하지 못했어요. 잠시 후 다시 시도해주세요."
      : `${friendlyKind} 횟수가 한도를 넘었어요. 잠시 후 다시 시도해주세요.`,
    retryAfterSec: Number(headers["Retry-After"] ?? 60),
  };
  return NextResponse.json(body, { status: unavailable ? 503 : 429, headers });
}
