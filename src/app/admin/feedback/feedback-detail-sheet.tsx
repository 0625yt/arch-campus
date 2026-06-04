"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FEEDBACK_STATUSES, type FeedbackStatus } from "@/lib/schemas/feedback";
import type { FeedbackItem } from "./feedback-list-client";

export function FeedbackDetailSheet({
  item,
  onClose,
}: {
  item: FeedbackItem;
  onClose: () => void;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<FeedbackStatus>(item.status as FeedbackStatus);
  const [adminNote, setAdminNote] = useState(item.admin_note ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErr(null);
    const res = await fetch(`/api/admin/feedback/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        adminNote: adminNote.trim() || undefined,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? "저장 실패");
      setSaving(false);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-sm">
          <span className="text-amber-500">{"★".repeat(item.rating)}</span>
          <span className="text-neutral-400">·</span>
          <span className="font-medium">{item.target_type}</span>
          <span className="text-neutral-400">·</span>
          <span className="text-neutral-500">{item.category}</span>
        </div>

        <div className="mt-3 rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">
          {item.body ?? "(본문 없음)"}
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-neutral-500">
          <div>
            <dt>작성자</dt>
            <dd className="font-mono text-neutral-700">{item.owner_id.slice(0, 8)}…</dd>
          </div>
          <div>
            <dt>대상 ID</dt>
            <dd className="font-mono text-neutral-700">{item.target_id.slice(0, 8)}…</dd>
          </div>
          <div>
            <dt>generation</dt>
            <dd className="font-mono text-neutral-700">
              {item.generation_id ? item.generation_id.slice(0, 8) + "…" : "—"}
            </dd>
          </div>
          <div>
            <dt>작성 시간</dt>
            <dd>{new Date(item.created_at).toLocaleString("ko-KR")}</dd>
          </div>
        </dl>

        <div className="mt-4">
          <div className="text-xs font-medium text-neutral-700">상태</div>
          <div className="mt-1 flex gap-1">
            {FEEDBACK_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`rounded-full px-3 py-1 text-xs ${
                  status === s
                    ? "bg-neutral-900 text-white"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <label className="text-xs font-medium text-neutral-700" htmlFor="admin-note">
            관리자 메모
          </label>
          <textarea
            id="admin-note"
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value.slice(0, 500))}
            rows={2}
            className="mt-1 w-full resize-none rounded-lg border border-neutral-200 px-3 py-2 text-sm"
          />
        </div>

        {err && <div className="mt-2 text-sm text-red-600">{err}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            닫기
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
