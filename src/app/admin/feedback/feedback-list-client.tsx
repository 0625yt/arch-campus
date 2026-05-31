"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  FEEDBACK_STATUSES,
  type FeedbackStatus,
} from "@/lib/schemas/feedback";
import { FeedbackDetailSheet } from "./feedback-detail-sheet";
import { AnalyzeButton } from "./analyze-button";

export interface FeedbackItem {
  id: string;
  owner_id: string;
  target_type: string;
  target_id: string;
  generation_id: string | null;
  rating: number;
  category: string;
  body: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

export function FeedbackListClient({
  items,
  currentStatus,
}: {
  items: FeedbackItem[];
  currentStatus: FeedbackStatus;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<FeedbackItem | null>(null);

  function setStatus(s: FeedbackStatus) {
    const params = new URLSearchParams(sp.toString());
    params.set("status", s);
    router.push(`/admin/feedback?${params.toString()}`);
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-1">
          {FEEDBACK_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                currentStatus === s
                  ? "bg-neutral-900 text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <AnalyzeButton selectedIds={Array.from(selected)} />
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-200 p-8 text-center text-sm text-neutral-400">
          해당 상태의 피드백이 없어요
        </div>
      ) : (
        <div className="divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200">
          {items.map((it) => (
            <div
              key={it.id}
              className="flex items-start gap-3 bg-white p-3 hover:bg-neutral-50"
            >
              <input
                type="checkbox"
                checked={selected.has(it.id)}
                onChange={() => toggle(it.id)}
                className="mt-1"
              />
              <button
                type="button"
                onClick={() => setDetail(it)}
                className="flex-1 text-left"
              >
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-amber-500">{"★".repeat(it.rating)}</span>
                  <span className="text-neutral-400">·</span>
                  <span className="font-medium text-neutral-700">
                    {it.target_type}
                  </span>
                  <span className="text-neutral-400">·</span>
                  <span className="text-neutral-500">{it.category}</span>
                </div>
                <div className="mt-1 line-clamp-1 text-sm text-neutral-600">
                  {it.body ?? (
                    <span className="text-neutral-300">(본문 없음)</span>
                  )}
                </div>
                <div className="mt-1 text-xs text-neutral-400">
                  {new Date(it.created_at).toLocaleString("ko-KR")}
                </div>
              </button>
            </div>
          ))}
        </div>
      )}

      {detail && (
        <FeedbackDetailSheet item={detail} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}
