"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { friendlyAuthError } from "@/lib/auth-errors";
import { getBrowserSupabase } from "@/lib/supabase/client";

/**
 * 새 비밀번호 입력. Supabase가 메일 링크 처리 후 session을 만들어 두기 때문에
 * updateUser({ password })만 호출하면 완료.
 *
 * 세션이 없으면 (메일 링크가 만료/잘못된 상태) 안내 후 forgot로.
 */
export function ResetPanel() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState<"checking" | "ok" | "missing">("checking");

  useEffect(() => {
    const supabase = getBrowserSupabase();
    supabase.auth.getSession().then(({ data }) => {
      setSessionReady(data.session ? "ok" : "missing");
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setErrorMsg(null);

    if (password.length < 8) {
      setErrorMsg("비밀번호는 8자 이상으로 만들어 주세요.");
      return;
    }
    if (password !== confirm) {
      setErrorMsg("비밀번호 확인이 일치하지 않아요.");
      return;
    }

    setLoading(true);
    const supabase = getBrowserSupabase();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setErrorMsg(friendlyAuthError(error));
      setLoading(false);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  if (sessionReady === "checking") {
    return (
      <div className="mt-10 flex justify-center">
        <span className="inline-block h-5 w-5 animate-spin rounded-full border-[1.5px] border-[var(--color-apple-hairline)] border-t-[var(--color-apple-ink)]" />
      </div>
    );
  }

  if (sessionReady === "missing") {
    return (
      <div className="mt-10">
        <p
          className="rounded-[10px] bg-[var(--color-urgent-soft)] px-4 py-4 text-center text-[13px] leading-[1.6] wght-450 text-[var(--color-urgent)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          링크가 만료됐거나 잘못된 링크예요.
          <br />
          비밀번호 재설정을 다시 요청해 주세요.
        </p>
        <a
          href="/login/forgot"
          className="mt-5 flex h-[52px] w-full items-center justify-center rounded-full bg-[var(--color-apple-ink)] text-[15px] wght-560 text-white shadow-[0_2px_8px_rgba(15,23,42,0.12)] transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ letterSpacing: "-0.012em" }}
        >
          재설정 다시 요청하기
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-10 flex flex-col gap-3">
      <label className="block">
        <span className="sr-only">새 비밀번호</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="새 비밀번호 (8자 이상)"
          autoComplete="new-password"
          required
          minLength={8}
          disabled={loading}
          className="h-[52px] w-full rounded-[14px] border border-[var(--color-apple-hairline)] bg-white px-4 text-[15px] wght-450 text-[var(--color-apple-ink)] outline-none transition-colors placeholder:text-[var(--color-apple-muted)]/70 focus:border-[var(--color-apple-action)] disabled:opacity-60"
          style={{ letterSpacing: "-0.012em" }}
        />
      </label>
      <label className="block">
        <span className="sr-only">비밀번호 확인</span>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="비밀번호 확인"
          autoComplete="new-password"
          required
          minLength={8}
          disabled={loading}
          className="h-[52px] w-full rounded-[14px] border border-[var(--color-apple-hairline)] bg-white px-4 text-[15px] wght-450 text-[var(--color-apple-ink)] outline-none transition-colors placeholder:text-[var(--color-apple-muted)]/70 focus:border-[var(--color-apple-action)] disabled:opacity-60"
          style={{ letterSpacing: "-0.012em" }}
        />
      </label>

      <button
        type="submit"
        disabled={loading}
        className="mt-2 flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[var(--color-apple-ink)] text-[15px] wght-560 text-white shadow-[0_2px_8px_rgba(15,23,42,0.12)] transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
        style={{ letterSpacing: "-0.012em" }}
      >
        {loading ? (
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-[1.5px] border-white/30 border-t-white" />
        ) : (
          "비밀번호 바꾸고 들어가기"
        )}
      </button>

      {errorMsg && (
        <p
          className="mt-2 rounded-[10px] bg-[var(--color-urgent-soft)] px-4 py-3 text-center text-[13px] wght-450 text-[var(--color-urgent)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {errorMsg}
        </p>
      )}
    </form>
  );
}
