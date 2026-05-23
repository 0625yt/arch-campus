"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";

/**
 * TOTP MFA enroll·verify·unenroll — Supabase Auth 내장 API 활용.
 *
 * 흐름:
 *   1. enroll() → factorId + QR(svg)·secret 반환
 *   2. 사용자가 1Password/Authy/Google Authenticator 등록
 *   3. challenge(factorId) → challengeId
 *   4. verify(challengeId, code 6자리) → assurance level aal2로 승격
 *   5. unenroll(factorId)로 해제
 *
 * 보안:
 *   - 1차 로그인은 여전히 매직링크. MFA는 2nd factor (선택).
 *   - 강제 정책은 별도 sprint — 일반 학생에겐 옵트인.
 */
export function MfaSection({ className }: { className?: string }) {
  const supabase = getBrowserSupabase();
  const [status, setStatus] = useState<"loading" | "off" | "enrolling" | "on" | "verifying">(
    "loading",
  );
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  // 현재 등록된 TOTP factor 조회
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) {
        setError(error.message);
        setStatus("off");
        return;
      }
      const totp = data.totp?.[0];
      if (totp && totp.status === "verified") {
        setFactorId(totp.id);
        setStatus("on");
      } else {
        setStatus("off");
      }
    })();
  }, [supabase]);

  async function startEnroll() {
    setError(null);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    if (error) {
      setError(error.message);
      return;
    }
    setFactorId(data.id);
    // SVG 안에 <script> 포함되면 거부 — Supabase가 정상 반환할 일 없지만 supply chain 가드.
    // 정상 SVG는 <svg ...><rect/></svg> 형태만 포함.
    const rawSvg = data.totp.qr_code;
    if (/<\s*script/i.test(rawSvg) || /on\w+\s*=/i.test(rawSvg)) {
      setError("QR 응답이 신뢰할 수 없는 형식이에요. Supabase 측 점검 필요.");
      return;
    }
    setQrSvg(rawSvg);
    setSecret(data.totp.secret);
    setStatus("enrolling");
  }

  async function verifyCode() {
    if (!factorId) return;
    setError(null);
    setStatus("verifying");
    const ch = await supabase.auth.mfa.challenge({ factorId });
    if (ch.error) {
      setError(ch.error.message);
      setStatus("enrolling");
      return;
    }
    setChallengeId(ch.data.id);
    const v = await supabase.auth.mfa.verify({
      factorId,
      challengeId: ch.data.id,
      code: code.trim(),
    });
    if (v.error) {
      setError(v.error.message);
      setStatus("enrolling");
      return;
    }
    setStatus("on");
    setCode("");
    setQrSvg(null);
    setSecret(null);
  }

  async function disableMfa() {
    if (!factorId) return;
    if (!confirm("MFA를 해제하면 매직링크만으로 로그인 가능해져요. 계속할까요?")) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) {
      setError(error.message);
      return;
    }
    setFactorId(null);
    setStatus("off");
  }

  return (
    <section className={className}>
      <div className="elev-1 rounded-[18px] bg-white px-7 py-8 sm:px-9">
        <div className="flex items-baseline justify-between gap-3">
          <h2
            className="text-[18px] wght-620 text-[var(--color-apple-ink)] sm:text-[20px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            2단계 인증 (TOTP)
          </h2>
          <p
            className="text-[11px] wght-560 uppercase tracking-[0.06em]"
            style={{
              letterSpacing: "0.06em",
              color:
                status === "on"
                  ? "var(--color-apple-success)"
                  : "var(--color-apple-muted)",
            }}
          >
            {status === "on" ? "켜짐" : status === "loading" ? "조회 중" : "꺼짐"}
          </p>
        </div>
        <p
          className="mt-3 text-[13.5px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.022em" }}
        >
          1Password·Authy·Google Authenticator 같은 앱이 6자리 코드를 만들어줘요.
          매직링크 이메일이 탈취돼도 이 코드 없이는 로그인 불가.
        </p>

        {status === "off" && (
          <div className="mt-6">
            <button
              type="button"
              onClick={startEnroll}
              className="inline-flex h-[40px] items-center rounded-full bg-[var(--color-apple-ink)] px-5 text-[13.5px] wght-560 text-white transition-opacity hover:opacity-90"
              style={{ letterSpacing: "-0.012em" }}
            >
              2단계 인증 켜기
            </button>
          </div>
        )}

        {(status === "enrolling" || status === "verifying") && (
          <div className="mt-6 flex flex-col gap-5">
            {qrSvg && (
              <div className="flex flex-col items-center gap-3 rounded-[12px] border border-[var(--color-apple-hairline)] bg-white p-5">
                <div
                  className="h-[180px] w-[180px]"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
                {secret && (
                  <div className="text-center">
                    <p
                      className="text-[11px] wght-450 text-[var(--color-apple-muted)]"
                      style={{ letterSpacing: "-0.012em" }}
                    >
                      QR 안 되면 수동 입력 키
                    </p>
                    <code className="mt-1 block break-all text-[12px] wght-560 text-[var(--color-apple-ink)]">
                      {secret}
                    </code>
                  </div>
                )}
              </div>
            )}
            <div>
              <label
                className="block text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]"
                style={{ letterSpacing: "0.06em" }}
              >
                앱이 보여주는 6자리 코드
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="mt-2 w-full rounded-[10px] border border-[var(--color-apple-hairline)] bg-white px-4 py-2.5 text-center text-[18px] wght-560 tracking-[0.3em] tabular-nums text-[var(--color-apple-ink)] outline-none focus:border-[var(--color-apple-action)]"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={verifyCode}
                disabled={code.length !== 6 || status === "verifying"}
                className="inline-flex h-[40px] items-center rounded-full bg-[var(--color-apple-ink)] px-5 text-[13.5px] wght-560 text-white transition-opacity hover:opacity-90 disabled:opacity-30"
                style={{ letterSpacing: "-0.012em" }}
              >
                {status === "verifying" ? "검증 중…" : "확인하고 활성화"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStatus("off");
                  setQrSvg(null);
                  setSecret(null);
                  setCode("");
                }}
                className="rounded-full border border-[var(--color-apple-hairline)] px-4 text-[13px] wght-560 text-[var(--color-apple-muted)] hover:text-[var(--color-apple-ink)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                취소
              </button>
            </div>
          </div>
        )}

        {status === "on" && (
          <div className="mt-6">
            <button
              type="button"
              onClick={disableMfa}
              className="rounded-full border border-[var(--color-apple-hairline)] px-4 py-2 text-[13px] wght-560 text-[var(--color-urgent)] hover:bg-[var(--color-urgent)]/5"
              style={{ letterSpacing: "-0.012em" }}
            >
              MFA 해제
            </button>
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

      <div className="mt-4 px-2 text-[11.5px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]">
        ⚠ 휴대폰 분실 대비 백업 코드는 별도 sprint에서 추가 예정. 지금은 MFA 켰는데 휴대폰
        잃어버리면 가입한 이메일로 문의해 주세요.
      </div>
    </section>
  );
}
