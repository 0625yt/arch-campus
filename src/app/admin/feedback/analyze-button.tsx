"use client";

import { useState } from "react";
import { AnalyzeResultSheet, type Cluster } from "./analyze-result-sheet";

export function AnalyzeButton({ selectedIds }: { selectedIds: string[] }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Cluster[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function analyze() {
    if (selectedIds.length === 0) {
      setErr("먼저 피드백을 선택해주세요");
      return;
    }
    setLoading(true);
    setErr(null);
    const res = await fetch("/api/admin/feedback/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? "분석 실패");
      setLoading(false);
      return;
    }
    const j = await res.json();
    setResult(j.clusters ?? []);
    setLoading(false);
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {err && <span className="text-xs text-red-600">{err}</span>}
        <button
          type="button"
          disabled={loading || selectedIds.length === 0}
          onClick={analyze}
          className="rounded-full bg-violet-600 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {loading ? "분석 중…" : `AI로 묶기 (${selectedIds.length})`}
        </button>
      </div>
      {result !== null && <AnalyzeResultSheet clusters={result} onClose={() => setResult(null)} />}
    </>
  );
}
