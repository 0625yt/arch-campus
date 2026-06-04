"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { friendlyAuthError } from "@/lib/auth-errors";
import { getBrowserSupabase } from "@/lib/supabase/client";

/**
 * 로그인 패널 — 이메일+비밀번호 폼 + Google OAuth.
 *
 * 동작:
 *   1) 이메일+비밀번호 제출 → signInWithPassword → 성공 시 next 또는 /dashboard
 *   2) "구글로 로그인" → OAuth 흐름 (/auth/callback에서 마무리)
 *
 * 에러는 폼 안 inline 표시. 입력값은 유지 (실패 시 다시 안 적어도 됨).
 */
export function LoginPanel({ next, error }: { next?: string; error?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState<"none" | "email" | "google">("none");
  const [formError, setFormError] = useState<string | null>(error ?? null);

  async function handleEmailLogin(e: FormEvent) {
    e.preventDefault();
    if (loading !== "none") return;
    setFormError(null);
    setLoading("email");
    const supabase = getBrowserSupabase();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (authError) {
      setFormError(friendlyAuthError(authError));
      setLoading("none");
      return;
    }
    // 세션 쿠키가 박힘 — middleware가 next로 보내거나, 직접 push.
    router.push(next ?? "/dashboard");
    router.refresh();
  }

  async function handleGoogleLogin() {
    if (loading !== "none") return;
    setFormError(null);
    setLoading("google");
    const supabase = getBrowserSupabase();
    const redirectTo = new URL("/auth/callback", window.location.origin);
    if (next) redirectTo.searchParams.set("next", next);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo.toString() },
    });
    if (oauthError) {
      setFormError(friendlyAuthError(oauthError));
      setLoading("none");
    }
    // 성공이면 페이지가 Google로 떠나니까 loading 유지.
  }

  const busy = loading !== "none";

  return (
    <div className="mt-10">
      <form onSubmit={handleEmailLogin} className="flex flex-col gap-3">
        <label className="block">
          <span className="sr-only">이메일</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일"
            autoComplete="email"
            required
            disabled={busy}
            className="h-[52px] w-full rounded-[14px] border border-[var(--color-apple-hairline)] bg-white px-4 text-[15px] wght-450 text-[var(--color-apple-ink)] outline-none transition-colors placeholder:text-[var(--color-apple-muted)]/70 focus:border-[var(--color-apple-action)] disabled:opacity-60"
            style={{ letterSpacing: "-0.012em" }}
          />
        </label>
        <label className="block">
          <span className="sr-only">비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            autoComplete="current-password"
            required
            disabled={busy}
            className="h-[52px] w-full rounded-[14px] border border-[var(--color-apple-hairline)] bg-white px-4 text-[15px] wght-450 text-[var(--color-apple-ink)] outline-none transition-colors placeholder:text-[var(--color-apple-muted)]/70 focus:border-[var(--color-apple-action)] disabled:opacity-60"
            style={{ letterSpacing: "-0.012em" }}
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          className="mt-2 flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[var(--color-apple-ink)] text-[15px] wght-560 text-white shadow-[0_2px_8px_rgba(15,23,42,0.12)] transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
          style={{ letterSpacing: "-0.012em" }}
        >
          {loading === "email" ? <Spinner light /> : "로그인"}
        </button>
      </form>

      <div className="mt-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-[var(--color-apple-hairline)]" />
        <span
          className="text-[11.5px] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          또는
        </span>
        <span className="h-px flex-1 bg-[var(--color-apple-hairline)]" />
      </div>

      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={busy}
        className="mt-5 flex h-[52px] w-full items-center justify-center gap-3 rounded-full bg-white text-[15px] wght-560 text-[var(--color-apple-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_2px_12px_rgba(122,166,214,0.10),0_0_0_1px_rgba(0,0,0,0.06)] transition-all hover:-translate-y-[1px] hover:shadow-[0_2px_4px_rgba(0,0,0,0.04),0_6px_20px_rgba(122,166,214,0.18),0_0_0_1px_rgba(0,0,0,0.08)] active:translate-y-0 active:scale-[0.98] disabled:opacity-60"
        style={{ letterSpacing: "-0.012em" }}
      >
        {loading === "google" ? (
          <Spinner />
        ) : (
          <>
            <GoogleIcon />
            구글로 계속하기
          </>
        )}
      </button>

      {formError && (
        <p
          className="mt-5 rounded-[10px] bg-[var(--color-urgent-soft)] px-4 py-3 text-center text-[13px] wght-450 text-[var(--color-urgent)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {formError}
        </p>
      )}

      <div className="mt-7 flex items-center justify-between text-[13px]">
        <Link
          href="/login/forgot"
          className="wght-450 text-[var(--color-apple-muted)] underline-offset-2 hover:text-[var(--color-apple-ink)] hover:underline"
          style={{ letterSpacing: "-0.012em" }}
        >
          비밀번호를 잊으셨나요?
        </Link>
        <Link
          href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="wght-560 text-[var(--color-apple-action)] underline-offset-2 hover:underline"
          style={{ letterSpacing: "-0.012em" }}
        >
          회원가입 ›
        </Link>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.96H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.04l3.007-2.333z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

function Spinner({ light = false }: { light?: boolean }) {
  return (
    <span
      aria-label="처리 중"
      className={`inline-block h-4 w-4 animate-spin rounded-full border-[1.5px] ${
        light
          ? "border-white/30 border-t-white"
          : "border-[var(--color-apple-hairline)] border-t-[var(--color-apple-ink)]"
      }`}
    />
  );
}
