"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { StudyWorkspace } from "@/lib/study-plan";

export function StudyTaskCompletion({
  materialId,
  weakTopics,
}: {
  materialId: string | null;
  weakTopics: string[];
}) {
  const query = useSearchParams();
  const router = useRouter();
  const planId = query.get("studyPlan"),
    taskId = query.get("studyTask");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!planId || !taskId || !materialId || !uuid.test(planId) || !uuid.test(taskId)) return null;
  async function complete() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/study-plans", { cache: "no-store" });
      if (!response.ok) throw new Error("공부 계획을 불러오지 못했어요. 다시 시도해주세요.");
      const result: { ok: boolean; workspace: StudyWorkspace } = await response.json();
      if (!result.ok) throw new Error("공부 계획을 불러오지 못했어요. 다시 시도해주세요.");
      const plan = result.workspace.plans.find((item) => item.id === planId && !item.archived);
      if (
        !plan?.tasks.some(
          (task) =>
            task.id === taskId && task.materialId === materialId && task.kind === "practice",
        )
      )
        throw new Error("연결된 공부 작업을 찾지 못했어요. 오늘의 공부에서 확인해주세요.");
      const saved = await fetch("/api/study-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          revision: result.workspace.revision,
          planId,
          taskId,
          reflection: weakTopics.length
            ? `문제 점검 완료 · 다시 볼 개념: ${weakTopics.join(", ")}`.slice(0, 300)
            : "문제 점검 완료. 다른 문제에서도 설명할 수 있는지 다시 확인하세요.",
        }),
      });
      const outcome = await saved.json();
      if (!saved.ok || !outcome.ok)
        throw new Error(outcome.error || "공부 완료를 저장하지 못했어요.");
      router.push("/dashboard/today");
    } catch (e) {
      setError(
        e instanceof TypeError || e instanceof SyntaxError
          ? "연결을 확인한 뒤 다시 시도해주세요. 풀이 결과는 유지돼요."
          : e instanceof Error
            ? e.message
            : "공부 완료를 저장하지 못했어요.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-xl border border-[var(--color-apple-hairline)] p-5">
      <p className="mb-3 text-[13px] text-[var(--color-apple-muted)]">
        이번 문제 점검을 시험 준비 계획에 기록할 수 있어요.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void complete()}
        className="min-h-11 rounded-lg bg-[var(--color-apple-action)] px-5 text-[14px] text-[var(--color-on-accent)] disabled:opacity-50"
      >
        {busy ? "기록 중…" : "공부 완료하고 Today로"}
      </button>
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-[var(--color-urgent)]">
          {error}
        </p>
      )}
    </div>
  );
}
