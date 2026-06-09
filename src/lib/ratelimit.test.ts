import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "./ratelimit";

/**
 * Upstash env가 없을 때의 인메모리 폴백 검증 (2026-06-09).
 *
 * prod에 UPSTASH_REDIS_REST_* 가 없어 rate limit이 무음 비활성이던 것을,
 * 단일 인스턴스 sliding window 폴백으로 "무제한 호출"만은 막게 바꿨다.
 *
 * 검증 핵심:
 *   - Upstash env 없으면 폴백이 정책 한도까지 통과, 초과 시 차단
 *   - 윈도우 경과 후 복구
 *   - identifier가 다르면 독립 카운트
 *   - 정책별(ai=6/1m, login=10/5m 등) 한도가 다름
 *
 * 모듈 전역 memHits Map은 테스트 간 공유되므로, 각 테스트는 고유 identifier로 격리.
 */
describe("checkRateLimit — 인메모리 폴백 (Upstash 미설정)", () => {
  beforeEach(() => {
    // Upstash env 제거 → 폴백 경로 강제. NODE_ENV는 prod 경고를 피하려 test 유지.
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ai 정책: 6회까지 통과, 7회째 차단", async () => {
    const id = `test-ai-${Math.random()}`;
    for (let i = 0; i < 6; i++) {
      const r = await checkRateLimit("ai", id);
      expect(r.success, `${i + 1}번째 호출은 통과해야`).toBe(true);
    }
    const blocked = await checkRateLimit("ai", id);
    expect(blocked.success, "7번째는 차단되어야").toBe(false);
    expect(blocked.headers["Retry-After"]).toBeDefined();
    expect(Number(blocked.headers["X-RateLimit-Remaining"])).toBe(0);
  });

  it("identifier가 다르면 카운트 독립", async () => {
    const a = `test-indep-a-${Math.random()}`;
    const b = `test-indep-b-${Math.random()}`;
    for (let i = 0; i < 6; i++) await checkRateLimit("ai", a);
    // a는 소진됐어도 b는 멀쩡
    const rb = await checkRateLimit("ai", b);
    expect(rb.success).toBe(true);
  });

  it("login 정책은 ai보다 한도가 큼 (10회)", async () => {
    const id = `test-login-${Math.random()}`;
    for (let i = 0; i < 10; i++) {
      const r = await checkRateLimit("login", id);
      expect(r.success).toBe(true);
    }
    const blocked = await checkRateLimit("login", id);
    expect(blocked.success).toBe(false);
  });

  it("남은 토큰 수가 헤더에 정확히 반영", async () => {
    const id = `test-remaining-${Math.random()}`;
    const r1 = await checkRateLimit("ai", id);
    expect(Number(r1.headers["X-RateLimit-Remaining"])).toBe(5); // 6 - 1
    const r2 = await checkRateLimit("ai", id);
    expect(Number(r2.headers["X-RateLimit-Remaining"])).toBe(4); // 6 - 2
  });

  it("윈도우 경과 후 복구 — 만료된 hit는 카운트에서 빠짐", async () => {
    vi.useFakeTimers();
    try {
      const id = `test-window-${Math.random()}`;
      for (let i = 0; i < 6; i++) await checkRateLimit("ai", id);
      expect((await checkRateLimit("ai", id)).success).toBe(false);
      // ai 윈도우 = 1분. 61초 경과시키면 모든 hit 만료 → 다시 통과
      vi.advanceTimersByTime(61_000);
      expect((await checkRateLimit("ai", id)).success).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
