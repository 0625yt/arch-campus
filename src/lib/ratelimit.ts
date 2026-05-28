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
 *   - UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN env가 있으면 활성
 *   - 없으면 always-allow no-op (dev·미설정 환경 동작 유지)
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
    // prod에서 env 누락은 rate limit이 무음 비활성 — 한 번만 큰 로그로 알린다.
    // Vercel logs 검색 시 즉시 잡히게 메시지 고정.
    if (process.env.NODE_ENV === "production" && !warnedNoEnvInProd) {
      warnedNoEnvInProd = true;
      console.error(
        "[ratelimit.CRITICAL] UPSTASH_REDIS_REST_URL/TOKEN not set in production. " +
          "Rate limit is DISABLED — AI/upload abuse not protected. " +
          "Set both env vars in Vercel project settings.",
      );
    }
    return null;
  }
  redis = new Redis({ url, token });
  return redis;
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
  /** 응답에 박을 headers — 429일 때 Retry-After 등 */
  headers: Record<string, string>;
}

/**
 * 라우트 진입 시 호출.
 *   - identifier: user_id 또는 IP (앱이 결정. 인증된 라우트는 ownerId)
 *   - kind: POLICIES 키
 *
 * Upstash env 미설정 시 무조건 success=true 반환 (no-op).
 */
export async function checkRateLimit(
  kind: keyof typeof POLICIES | string,
  identifier: string,
): Promise<RateLimitResult> {
  const lim = getLimiter(kind);
  if (!lim) return { success: true, headers: {} };
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
  const { success, headers } = await checkRateLimit(kind, identifier);
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
    error: `${friendlyKind} 횟수가 한도를 넘었어요. 잠시 후 다시 시도해주세요.`,
    retryAfterSec: Number(headers["Retry-After"] ?? 60),
  };
  return NextResponse.json(body, { status: 429, headers });
}
