"use client";

import { useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";

export function LoginButton({ next }: { next?: string }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    const supabase = getBrowserSupabase();
    const redirectTo = new URL("/auth/callback", window.location.origin);
    if (next) redirectTo.searchParams.set("next", next);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectTo.toString(),
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      setLoading(false);
      window.location.href = `/login?error=${encodeURIComponent(error.message)}`;
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="flex h-[52px] w-full items-center justify-center gap-3 rounded-full bg-white text-[15px] wght-560 text-[var(--color-apple-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_0_0_1px_rgba(0,0,0,0.06)] transition-all hover:shadow-[0_2px_8px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.08)] active:scale-[0.98] disabled:opacity-60"
    >
      <GoogleIcon />
      {loading ? "이동 중…" : "구글로 계속"}
    </button>
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
