"use client";

import { useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";

/**
 * 계정 영구 삭제 — GDPR/PIPA 권리.
 *
 * 흐름:
 *   1. 1단계 confirm 인라인 패널 → 사용자 이메일 input으로 "정말 삭제" 확인
 *   2. DELETE /api/account 호출 (service-role로 모든 데이터·storage·auth.user cascade)
 *   3. 200이면 supabase.signOut + /login redirect
 *
 * 비가역. 30일 grace 없음 — 즉시 cascade.
 */
export function AccountSection({ className, userEmail }: { className?: string; userEmail: string }) {
  const supabase = getBrowserSupabase();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = typed.trim().toLowerCase() === userEmail.trim().toLowerCase();

  async function performDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? "계정 삭제에 실패했어요");
      }
      // 세션 종료 후 redirect
      await supabase.auth.signOut();
      window.location.href = "/login";
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
      setBusy(false);
    }
  }

  return (
    <section className={className}>
      <div className="elev-1 rounded-[18px] bg-white px-7 py-8 sm:px-9">
        <h2
          className="text-[18px] wght-620 text-[var(--color-urgent)] sm:text-[20px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          계정 삭제
        </h2>
        <p
          className="mt-3 text-[13.5px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.022em" }}
        >
          지금까지 올린 자료, 강의, 일정, 퀴즈 풀이 기록이 즉시 모두 사라져요. 되돌릴 수 없어요.
        </p>

        {!confirming && (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded-full border border-[var(--color-urgent)] bg-white px-4 py-2 text-[13.5px] wght-560 text-[var(--color-urgent)] hover:bg-[var(--color-urgent)]/5"
              style={{ letterSpacing: "-0.012em" }}
            >
              계정 영구 삭제
            </button>
          </div>
        )}

        {confirming && (
          <div className="mt-6 rounded-[12px] border border-[var(--color-urgent)]/40 bg-[var(--color-urgent)]/5 px-5 py-4">
            <p
              className="text-[13.5px] leading-[1.55] wght-560 text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "-0.022em" }}
            >
              확인을 위해 본인 이메일을 그대로 입력해 주세요.
            </p>
            <p
              className="mt-1 text-[12px] wght-450 text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              {userEmail}
            </p>
            <input
              type="email"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={userEmail}
              autoComplete="off"
              className="mt-3 w-full rounded-[10px] border border-[var(--color-apple-hairline)] bg-white px-4 py-2.5 text-[14px] wght-450 text-[var(--color-apple-ink)] outline-none focus:border-[var(--color-urgent)]"
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={performDelete}
                disabled={!canDelete || busy}
                className="inline-flex h-[36px] items-center rounded-full bg-[var(--color-urgent)] px-4 text-[13px] wght-560 text-white transition-opacity hover:opacity-90 disabled:opacity-30"
                style={{ letterSpacing: "-0.012em" }}
              >
                {busy ? "삭제 중…" : "영구 삭제"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  setTyped("");
                  setError(null);
                }}
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
            className="mt-4 text-[12.5px] wght-450 text-[var(--color-urgent)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
