"use client";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { safeAuthRedirect } from "@/lib/auth-redirect";
import { getBrowserSupabase } from "@/lib/supabase/client";

export function MfaChallenge({
  factors,
  next,
}: {
  factors: { id: string; name: string }[];
  next: string;
}) {
  const router = useRouter();
  const [factorId, setFactorId] = useState(factors[0]?.id ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !factorId || !/^\d{6}$/.test(code)) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = getBrowserSupabase();
      const result = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (result.error) {
        setError("코드를 확인하고 다시 입력해주세요. 만료되었다면 새 코드를 사용해주세요.");
        return;
      }
      const target = safeAuthRedirect(next);
      router.replace(target.startsWith("/auth/mfa") ? "/dashboard" : target);
      router.refresh();
    } catch {
      setError("연결을 확인하고 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    setBusy(true);
    setError(null);
    try {
      const { error } = await getBrowserSupabase().auth.signOut({ scope: "local" });
      if (error) throw error;
      router.replace("/login");
      router.refresh();
    } catch {
      setError("로그아웃하지 못했어요. 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <form onSubmit={submit} className="mt-8 space-y-4">
        {factors.length > 1 && (
          <label className="block text-sm">
            인증 수단
            <select
              value={factorId}
              onChange={(e) => setFactorId(e.target.value)}
              disabled={busy}
              className="mt-2 w-full rounded-xl border p-3"
            >
              {factors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block text-sm">
          인증 코드
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            required
            maxLength={6}
            disabled={busy || !factorId}
            className="mt-2 w-full rounded-xl border p-3 text-center text-xl tracking-widest"
          />
        </label>
        <button
          type="submit"
          disabled={busy || code.length !== 6 || !factorId}
          className="w-full rounded-xl bg-slate-900 p-3 text-white disabled:opacity-50"
        >
          {busy ? "확인 중…" : "인증하고 계속하기"}
        </button>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
      </form>
      <p className="mt-6 text-sm text-slate-600">
        인증 앱을 사용할 수 없다면 백업해 둔 인증 키를 다른 앱에 복원해주세요. 이 화면에서 인증을
        건너뛸 수는 없습니다.
      </p>
      <button type="button" onClick={signOut} disabled={busy} className="mt-4 text-sm underline">
        로그아웃하고 다른 계정 사용
      </button>
    </>
  );
}
