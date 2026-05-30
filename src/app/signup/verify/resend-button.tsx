"use client";

import { useState } from "react";
import { friendlyAuthError } from "@/lib/auth-errors";
import { getBrowserSupabase } from "@/lib/supabase/client";

/**
 * 인증 메일 재전송 버튼 — 60초 쿨다운.
 * Supabase가 자체적으로 rate limit을 걸기 때문에 클라이언트도 가드.
 */
export function ResendButton({ email }: { email: string }) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  async function handleResend() {
    if (status === "sending" || cooldown > 0) return;
    if (!email) {
      setStatus("error");
      setMessage("이메일 정보가 없어요. 회원가입을 다시 시작해 주세요.");
      return;
    }
    setStatus("sending");
    setMessage(null);
    const supabase = getBrowserSupabase();
    const emailRedirectTo = new URL("/auth/callback", window.location.origin).toString();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo },
    });
    if (error) {
      setStatus("error");
      setMessage(friendlyAuthError(error));
      return;
    }
    setStatus("sent");
    setMessage("메일을 다시 보냈어요.");
    setCooldown(60);
    const interval = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  const disabled = status === "sending" || cooldown > 0;

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleResend}
        disabled={disabled || !email}
        className="rounded-full bg-white px-5 py-2 text-[13px] wght-560 text-[var(--color-apple-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_0_0_1px_rgba(0,0,0,0.06)] transition-all hover:-translate-y-[1px] hover:shadow-[0_2px_4px_rgba(0,0,0,0.04),0_0_0_1px_rgba(0,0,0,0.08)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_0_0_1px_rgba(0,0,0,0.06)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {cooldown > 0
          ? `${cooldown}초 후 다시 보낼 수 있어요`
          : status === "sending"
            ? "보내는 중..."
            : "메일 다시 보내기"}
      </button>
      {message && (
        <p
          className={`text-[12px] wght-450 ${
            status === "error" ? "text-[var(--color-urgent)]" : "text-[var(--color-apple-action)]"
          }`}
          style={{ letterSpacing: "-0.012em" }}
        >
          {message}
        </p>
      )}
    </div>
  );
}
