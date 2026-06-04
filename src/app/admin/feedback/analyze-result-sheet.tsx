"use client";

export interface Cluster {
  title: string;
  severity: "high" | "mid" | "low";
  feedbackIds: string[];
  suspectedPromptSection: string;
  suggestedFix: string;
}

export function AnalyzeResultSheet({
  clusters,
  onClose,
}: {
  clusters: Cluster[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">AI 분석 결과</h2>
          <button type="button" onClick={onClose} className="text-sm text-neutral-500">
            닫기
          </button>
        </div>
        <div className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          ⚠️ 참고용 제안 — 자동 적용 안 됨. 채택할 패턴은 직접 프롬프트 수정.
        </div>

        {clusters.length === 0 ? (
          <div className="mt-4 text-sm text-neutral-400">묶인 패턴이 없어요</div>
        ) : (
          <div className="mt-4 space-y-3">
            {clusters.map((c, i) => (
              <div key={i} className="rounded-lg border border-neutral-200 p-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      c.severity === "high"
                        ? "bg-red-100 text-red-700"
                        : c.severity === "mid"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {c.severity.toUpperCase()}
                  </span>
                  <span className="font-medium">{c.title}</span>
                </div>
                <div className="mt-2 text-xs text-neutral-500">
                  묶인 피드백 {c.feedbackIds.length}건
                </div>
                <div className="mt-2 text-xs">
                  <span className="font-medium text-neutral-700">의심 위치: </span>
                  <span className="text-neutral-600">{c.suspectedPromptSection}</span>
                </div>
                <div className="mt-2 text-sm text-neutral-700">{c.suggestedFix}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
