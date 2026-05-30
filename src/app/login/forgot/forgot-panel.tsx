"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { friendlyAuthError } from "@/lib/auth-errors";
import { getBrowserSupabase } from "@/lib/supabase/client";

export function ForgotPanel() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (status === "sending") return;
    setErrorMsg(null);
    setStatus("sending");
    const supabase = getBrowserSupabase();
    const redirectTo = new URL("/auth/reset", window.location.origin).toString();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });
    if (error) {
      setErrorMsg(friendlyAuthError(error));
      setStatus("idle");
      return;
    }
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div className="mt-10 text-center">
        <div
          aria-hidden
          className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-[0_2px_12px_rgba(0,113,227,0.18),0_0_0_1px_rgba(0,113,227,0.10)]"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <title>완료</title>
            <path
              d="m5 13 4 4L19 7"
              stroke="var(--color-apple-action)"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p
          className="text-[15px] wght-560 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          링크를 보냈어요.
        </p>
        <p
          className="mt-2 text-[13px] leading-[1.55] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          메일함을 확인해 새 비밀번호를 만들어 주세요.
        </p>
        <Link
          href="/login"
          className="mt-7 inline-block text-[13px] wght-560 text-[var(--color-apple-action)] underline-offset-2 hover:underline"
          style={{ letterSpacing: "-0.012em" }}
        >
          로그인 화면으로 ›
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-10 flex flex-col gap-3">
      <label className="block">
        <span className="sr-only">이메일</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="이메일"
          autoComplete="email"
          required
          disabled={status === "sending"}
          className="h-[52px] w-full rounded-[14px] border border-[var(--color-apple-hairline)] bg-white px-4 text-[15px] wght-450 text-[var(--color-apple-ink)] outline-none transition-colors placeholder:text-[var(--color-apple-muted)]/70 focus:border-[var(--color-apple-action)] disabled:opacity-60"
          style={{ letterSpacing: "-0.012em" }}
        />
      </label>

      <button
        type="submit"
        disabled={status === "sending"}
        className="mt-2 flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[var(--color-apple-ink)] text-[15px] wght-560 text-white shadow-[0_2px_8px_rgba(15,23,42,0.12)] transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
        style={{ letterSpacing: "-0.012em" }}
      >
        {status === "sending" ? (
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-[1.5px] border-white/30 border-t-white" />
        ) : (
          "재설정 링크 보내기"
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

      <div className="mt-5 text-center">
        <Link
          href="/login"
          className="text-[13px] wght-450 text-[var(--color-apple-muted)] underline-offset-2 hover:text-[var(--color-apple-ink)] hover:underline"
          style={{ letterSpacing: "-0.012em" }}
        >
          돌아가기
        </Link>
      </div>
    </form>
  );
}
