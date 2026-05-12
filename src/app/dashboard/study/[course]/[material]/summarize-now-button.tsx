"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * "요약 만들기" — 자료에 summary_payload 없을 때만 노출.
 *
 * 흐름:
 *   1) /api/summarize에 form-data 보냄 (file 아닌 materialId만)
 *   2) 성공 → router.refresh() → server component가 다시 읽어 요약 노출
 *
 * 현재 /api/summarize는 file 필드를 요구하므로, 이 버튼은 다음 단계 (POST가
 * materialId만으로 동작하도록 수정)에서 활성화됨. 일단 placeholder 안내.
 */
export function SummarizeNowButton({ materialId }: { materialId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/materials/${materialId}/summarize`, {
        method: "POST",
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "요약 생성에 실패했어요.");
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handle}
        disabled={busy}
        className="inline-flex h-[44px] items-center rounded-full bg-[var(--color-apple-action)] px-6 text-[14px] wght-560 text-white transition-all hover:bg-[var(--color-apple-action-hover)] active:scale-[0.97] disabled:opacity-50"
        style={{ letterSpacing: "-0.012em" }}
      >
        {busy ? "요약 만드는 중…" : "요약 만들기"}
      </button>
      {error && (
        <p className="text-[12px] wght-450 text-[var(--color-urgent)]">
          {error}
        </p>
      )}
    </div>
  );
}
