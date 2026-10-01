"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { friendlyAuthError } from "@/lib/auth-errors";
import { safeAuthRedirect } from "@/lib/auth-redirect";
import { getBrowserSupabase } from "@/lib/supabase/client";

/**
 * 회원가입 패널 — 이메일+비밀번호+비밀번호 확인 + Google OAuth.
 *
 * 동작:
 *   1) 폼 제출 → signUp → 이메일 인증 메일 발송 → /signup/verify로 이동
 *   2) 구글로 가입 → OAuth → /auth/callback에서 신규/기존 분기
 *
 * 비밀번호 정책: 8자 이상. 영문·숫자 권장(Supabase 측 정책은 dashboard에서).
 */
export function SignupPanel({ next, error }: { next?: string; error?: string }) {
  const router = useRouter();
  const targetPath = safeAuthRedirect(next);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState<"none" | "email" | "google">("none");
  const [formError, setFormError] = useState<string | null>(error ?? null);

  function validate(): string | null {
    if (password.length < 8) return "비밀번호는 8자 이상으로 만들어 주세요.";
    if (password !== passwordConfirm) return "비밀번호 확인이 일치하지 않아요.";
    return null;
  }

  async function handleEmailSignup(e: FormEvent) {
    e.preventDefault();
    if (loading !== "none") return;
    setFormError(null);
    const validation = validate();
    if (validation) {
      setFormError(validation);
      return;
    }
    setLoading("email");

    const trimmedEmail = email.trim();

    // Supabase signUp. 이메일 확인 정책 ON일 때 session=null이고 user만 옴.
    // 이미 가입된 이메일은 보안상 "가짜 성공" 응답을 주는데, 그 경우 user.identities가 빈 배열로 옴 —
    // 이걸로 중복을 판별해 "메일 확인하세요" 안내 대신 명확한 안내를 띄움.
    const supabase = getBrowserSupabase();
    const emailRedirectTo = new URL("/auth/callback", window.location.origin);
    if (next) emailRedirectTo.searchParams.set("next", targetPath);
    const { data, error: authError } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: { emailRedirectTo: emailRedirectTo.toString() },
    });
    if (authError) {
      setFormError(friendlyAuthError(authError));
      setLoading("none");
      return;
    }
    if (data.user?.identities?.length === 0) {
      setFormError("이미 가입된 이메일이에요. 로그인을 진행해 주세요.");
      setLoading("none");
      return;
    }
    if (data.session) {
      router.push(targetPath);
      router.refresh();
    } else {
      router.push(`/signup/verify?email=${encodeURIComponent(trimmedEmail)}`);
    }
  }

  async function handleGoogleSignup() {
    if (loading !== "none") return;
    setFormError(null);
    setLoading("google");
    const supabase = getBrowserSupabase();
    const redirectTo = new URL("/auth/callback", window.location.origin);
    if (next) redirectTo.searchParams.set("next", targetPath);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo.toString() },
    });
    if (oauthError) {
      setFormError(friendlyAuthError(oauthError));
      setLoading("none");
    }
  }

  const busy = loading !== "none";

  return (
    <div className="mt-10">
      <form onSubmit={handleEmailSignup} className="flex flex-col gap-3">
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
            placeholder="비밀번호 (8자 이상)"
            autoComplete="new-password"
            required
            minLength={8}
            disabled={busy}
            className="h-[52px] w-full rounded-[14px] border border-[var(--color-apple-hairline)] bg-white px-4 text-[15px] wght-450 text-[var(--color-apple-ink)] outline-none transition-colors placeholder:text-[var(--color-apple-muted)]/70 focus:border-[var(--color-apple-action)] disabled:opacity-60"
            style={{ letterSpacing: "-0.012em" }}
          />
        </label>
        <label className="block">
          <span className="sr-only">비밀번호 확인</span>
          <input
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            placeholder="비밀번호 확인"
            autoComplete="new-password"
            required
            minLength={8}
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
          {loading === "email" ? <Spinner light /> : "가입하기"}
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
        onClick={handleGoogleSignup}
        disabled={busy}
        className="mt-5 flex h-[52px] w-full items-center justify-center gap-3 rounded-full bg-white text-[15px] wght-560 text-[var(--color-apple-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_2px_12px_rgba(122,166,214,0.10),0_0_0_1px_rgba(0,0,0,0.06)] transition-all hover:-translate-y-[1px] hover:shadow-[0_2px_4px_rgba(0,0,0,0.04),0_6px_20px_rgba(122,166,214,0.18),0_0_0_1px_rgba(0,0,0,0.08)] active:translate-y-0 active:scale-[0.98] disabled:opacity-60"
        style={{ letterSpacing: "-0.012em" }}
      >
        {loading === "google" ? (
          <Spinner />
        ) : (
          <>
            <GoogleIcon />
            구글로 가입하기
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

      <div className="mt-7 text-center text-[13px]">
        <span
          className="wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          이미 가입하셨나요?{" "}
        </span>
        <Link
          href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="wght-560 text-[var(--color-apple-action)] underline-offset-2 hover:underline"
          style={{ letterSpacing: "-0.012em" }}
        >
          로그인 ›
        </Link>
      </div>

      <p
        className="mt-8 text-center text-[11.5px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        계속하면{" "}
        <a className="underline underline-offset-2" href="/terms">
          이용약관
        </a>{" "}
        ·{" "}
        <a className="underline underline-offset-2" href="/privacy">
          개인정보처리방침
        </a>
        에 동의해요.
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <title>Google</title>
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
      role="status"
      aria-label="처리 중"
      className={`inline-block h-4 w-4 animate-spin rounded-full border-[1.5px] ${
        light
          ? "border-white/30 border-t-white"
          : "border-[var(--color-apple-hairline)] border-t-[var(--color-apple-ink)]"
      }`}
    />
  );
}
