"use client";

import { useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";

/**
 * 활성 세션 강제 종료 — "내 다른 기기 모두 로그아웃".
 *
 * 한계: Supabase Auth는 클라이언트 SDK에서 세션 목록 listing을 제공하지 않는다.
 *   - 정밀 "기기별 강제 로그아웃" UI는 service-role admin API 라우트로 별도 sprint
 *   - 지금은 1Password Travel Mode 식 "모든 기기 한 번에 끊기" 한 버튼만
 *
 * scope='global': 현재 user의 모든 refresh token 폐기 → 다른 모든 기기 즉시 로그아웃 강제.
 * 현재 기기도 함께 로그아웃 → /login으로 이동.
 */
export function SessionsSection({ className }: { className?: string }) {
  const supabase = getBrowserSupabase();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function signOutEverywhere() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signOut({ scope: "global" });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    window.location.href = "/login";
  }

  return (
    <section className={className}>
      <div className="elev-1 rounded-[18px] bg-white px-7 py-8 sm:px-9">
        <h2
          className="text-[18px] wght-620 text-[var(--color-apple-ink)] sm:text-[20px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          활성 세션
        </h2>
        <p
          className="mt-3 text-[13.5px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.022em" }}
        >
          공용 PC·잃어버린 휴대폰처럼 의심 가는 기기가 있으면 한 번에 모두 끊을 수 있어요. 현재
          기기도 함께 로그아웃되니 다시 로그인 필요.
        </p>
        {!confirming && (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={busy}
              className="rounded-full border border-[var(--color-urgent)] bg-white px-4 py-2 text-[13.5px] wght-560 text-[var(--color-urgent)] hover:bg-[var(--color-urgent)]/5 disabled:opacity-50"
              style={{ letterSpacing: "-0.012em" }}
            >
              모든 기기에서 로그아웃
            </button>
          </div>
        )}

        {confirming && (
          <div className="mt-6 rounded-[12px] border border-[var(--color-apple-hairline)] bg-[var(--color-apple-surface,#f5f5f7)] px-5 py-4">
            <p
              className="text-[13.5px] leading-[1.55] wght-450 text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "-0.022em" }}
            >
              다른 모든 기기에서 로그아웃됩니다. 본인 기기도 함께 끊겨서 다시 로그인해야 합니다.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={signOutEverywhere}
                disabled={busy}
                className="inline-flex h-[36px] items-center rounded-full bg-[var(--color-urgent)] px-4 text-[13px] wght-560 text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ letterSpacing: "-0.012em" }}
              >
                {busy ? "처리 중…" : "모두 로그아웃"}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="rounded-full border border-[var(--color-apple-hairline)] bg-white px-4 text-[13px] wght-560 text-[var(--color-apple-muted)] hover:text-[var(--color-apple-ink)] disabled:opacity-50"
                style={{ letterSpacing: "-0.012em" }}
              >
                취소
              </button>
            </div>
          </div>
        )}
        {error && (
          <p
            className="mt-3 text-[12.5px] wght-450 text-[var(--color-urgent)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
