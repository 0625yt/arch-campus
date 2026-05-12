"use client";

import { useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";

type Mode = "login" | "signup";

export function LoginPanel({
  initialMode,
  next,
  error,
}: {
  initialMode: Mode;
  next?: string;
  error?: string;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    const supabase = getBrowserSupabase();
    const redirectTo = new URL("/auth/callback", window.location.origin);
    if (next) redirectTo.searchParams.set("next", next);

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectTo.toString(),
        queryParams: mode === "signup" ? { prompt: "select_account" } : { prompt: "select_account" },
      },
    });
    if (oauthError) {
      setLoading(false);
      window.location.href = `/login?error=${encodeURIComponent(oauthError.message)}`;
    }
    // 성공이면 페이지가 구글로 떠나니까 loading 그대로 유지 (다시 안 돌아옴)
  }

  return (
    <div className="mt-12">
      <p
        className="text-center text-[14px] leading-[1.5] wght-450 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {mode === "login"
          ? "강의자료·강의계획서를 올리면 오늘 해야 할 공부가 자동으로 떠요."
          : "처음이세요? 학교·전공만 알려주면 바로 시작할 수 있어요."}
      </p>

      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="mt-7 flex h-[52px] w-full items-center justify-center gap-3 rounded-full bg-white text-[15px] wght-560 text-[var(--color-apple-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_0_0_1px_rgba(0,0,0,0.06)] transition-all hover:shadow-[0_2px_8px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.08)] active:scale-[0.98] disabled:opacity-60"
      >
        {loading ? (
          <Spinner />
        ) : (
          <>
            <GoogleIcon />
            {mode === "login" ? "구글로 로그인" : "구글로 회원가입"}
          </>
        )}
      </button>

      {error && (
        <p className="mt-4 text-center text-[13px] wght-450 text-[var(--color-urgent)]">
          {decodeURIComponent(error)}
        </p>
      )}

      <div className="mt-6 flex items-center justify-center gap-1.5 text-[13px]">
        <span className="wght-450 text-[var(--color-apple-muted)]">
          {mode === "login" ? "arch가 처음이세요?" : "이미 계정이 있으세요?"}
        </span>
        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="wght-560 text-[var(--color-apple-action)] underline-offset-2 hover:underline"
        >
          {mode === "login" ? "회원가입" : "로그인"}
        </button>
      </div>

      {mode === "signup" && (
        <p className="mt-8 text-center text-[12px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]">
          계속하면 <a className="underline" href="/terms">이용약관</a>과{" "}
          <a className="underline" href="/privacy">개인정보처리방침</a>에 동의하는 것으로 간주합니다.
        </p>
      )}
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

function Spinner() {
  return (
    <span
      aria-label="이동 중"
      className="inline-block h-4 w-4 animate-spin rounded-full border-[1.5px] border-[var(--color-apple-hairline)] border-t-[var(--color-apple-ink)]"
    />
  );
}
