"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ContextMenu, type ContextMenuItem, useContextMenu } from "@/components/context-menu";
import { Modal } from "@/components/modal";

/**
 * 퀴즈 카드 우클릭/long-press/⋯ 버튼 → 컨텍스트 메뉴.
 *
 * 메뉴:
 *   - 추가 요청사항 — 그 퀴즈의 원본 자료로 새 퀴즈 생성(요청·개수 반영, 기존은 보존).
 *     materialId 없는(자료 없이 만든) 퀴즈는 비활성.
 *   - 문제 삭제 — DELETE /api/quiz/{id} (optimistic 숨김 + 실패 시 되돌림).
 *
 * children은 QuizCard 자체. 좌클릭은 그대로 라우팅, 우클릭·⋯·long-press만 메뉴.
 * ⋯ 버튼은 QuizCard가 렌더하고, openMenu 콜백으로 이 래퍼의 메뉴를 연다.
 *
 * "추가 요청"은 요청이 접수되면(jobId 발급) 모달을 즉시 닫고 onPending으로 부모 grid에 넘긴다.
 * 생성 감시는 grid의 placeholder 카드가 맡으므로 사용자는 다른 화면으로 자유롭게 이동할 수 있다.
 */
export function QuizContextWrapper({
  quizId,
  quizTitle,
  materialId,
  courseName,
  courseColor,
  onHide,
  onUnhide,
  onPending,
  children,
}: {
  quizId: string;
  quizTitle: string;
  /** 원본 자료 id — 추가 요청(새 퀴즈 생성)의 대상. null이면 추가 요청 비활성. */
  materialId: string | null;
  courseName: string | null;
  courseColor: string | null;
  /** optimistic 숨김 트리거. 부모 grid가 ids에서 빼고 즉시 카드 사라짐 */
  onHide?: (id: string) => void;
  /** 삭제 실패 시 되돌리기 */
  onUnhide?: (id: string) => void;
  /** 추가 요청 접수 → grid 상단에 "생성 중…" placeholder 띄우기 */
  onPending?: (job: {
    jobId: string;
    label: string;
    courseName: string | null;
    courseColor: string | null;
  }) => void;
  children: (api: { openMenu: (pos: { x: number; y: number }) => void }) => React.ReactNode;
}) {
  const router = useRouter();
  const ctx = useContextMenu();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);

  const items: ContextMenuItem[] = [
    ...(materialId ? [{ label: "추가 요청사항", onClick: () => setRequestOpen(true) }] : []),
    {
      label: "문제 삭제",
      destructive: true,
      onClick: () => setConfirmDelete(true),
    },
  ];

  async function handleDelete() {
    setConfirmDelete(false);
    // optimistic — 즉시 사라지면 UX 부드러움
    onHide?.(quizId);
    try {
      const res = await fetch(`/api/quiz/${quizId}`, { method: "DELETE" });
      const json = (await res.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; error: string }
        | null;
      if (!res.ok || !json || json.ok === false) {
        onUnhide?.(quizId);
        alert((json && json.ok === false && json.error) || "삭제 실패");
        return;
      }
      router.refresh();
    } catch (e) {
      onUnhide?.(quizId);
      alert(e instanceof Error ? e.message : "네트워크 오류");
    }
  }

  return (
    <div {...ctx.bind} className="contents">
      {children({ openMenu: ctx.openAt })}

      <ContextMenu state={ctx.state} onClose={ctx.close} items={items} />

      <ConfirmDialog
        open={confirmDelete}
        title="문제 삭제"
        description={`"${quizTitle}"\n\n이 문제 세트와 모든 풀이 기록을 지울까요? 되돌릴 수 없어요.`}
        confirmLabel="삭제"
        destructive
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />

      {materialId && (
        <RequestMoreDialog
          open={requestOpen}
          materialId={materialId}
          quizTitle={quizTitle}
          onClose={() => setRequestOpen(false)}
          onAccepted={(jobId) => {
            setRequestOpen(false);
            onPending?.({ jobId, label: quizTitle, courseName, courseColor });
          }}
        />
      )}
    </div>
  );
}

const COUNT_CHIPS = [5, 10, 20, 30] as const;

/**
 * "추가 요청사항" 다이얼로그 — 요청 한 줄 + 개수 칩 → 원본 자료로 새 퀴즈 생성.
 * /api/materials/{materialId}/quiz 를 그대로 재사용(intentNote·count).
 *
 * 접수되면(jobId 발급) onAccepted로 부모에게 넘기고 모달은 닫힌다. 생성 폴링은
 * 부모 grid의 placeholder가 맡으므로 이 다이얼로그는 job을 감시하지 않는다 —
 * 그래야 사용자가 "만드는 중" 모달에 갇히지 않는다.
 */
function RequestMoreDialog({
  open,
  materialId,
  quizTitle,
  onClose,
  onAccepted,
}: {
  open: boolean;
  materialId: string;
  quizTitle: string;
  onClose: () => void;
  onAccepted: (jobId: string) => void;
}) {
  const [note, setNote] = useState("");
  const [count, setCount] = useState<number>(10);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 다이얼로그가 닫혔다 다시 열릴 때 이전 상태 잔류 제거 (재오픈 시 깨끗하게).
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setError(null);
      setSubmitting(false);
      setNote("");
    }
    prevOpenRef.current = open;
  }, [open]);

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/materials/${materialId}/quiz`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count,
          // 추가 요청은 의도 조정 한 줄(intentNote)로 전달 — 난이도/형식/추가 생성 다 자유 텍스트.
          intentNote: note.trim().slice(0, 120),
        }),
      });
      const raw = await res.text();
      let json: { ok?: boolean; jobId?: string; error?: string } = {};
      if (raw.trim().length > 0) {
        try {
          json = JSON.parse(raw);
        } catch {
          /* HTML 에러 페이지 등 */
        }
      }
      if (!res.ok || !json.ok || !json.jobId) {
        setSubmitting(false);
        setError(
          res.status === 429
            ? "요청이 잠시 많아요. 1분 뒤 다시 시도해주세요."
            : res.status >= 500
              ? `서버 일시 오류 (${res.status}). 잠시 후 다시 시도해주세요.`
              : json.error || "요청을 시작하지 못했어요.",
        );
        return;
      }
      // 접수 완료 — 모달 닫고 부모가 placeholder로 이어받는다.
      onAccepted(json.jobId);
    } catch (e) {
      setSubmitting(false);
      setError(e instanceof Error ? e.message : "네트워크 오류");
    }
  }

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={submitting ? () => {} : onClose}
      title="문제 생성 추가 요청"
      chromeless
    >
      <div className="w-full max-w-[420px] rounded-t-[20px] bg-white p-5 shadow-[0_20px_60px_rgba(0,0,0,0.18)] sm:rounded-[20px]">
        <p className="text-[11px] wght-700 uppercase tracking-[0.06em] text-[var(--color-apple-action)]">
          추가 요청
        </p>
        <h2
          className="mt-1.5 line-clamp-1 text-[17px] wght-620 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {quizTitle}
        </h2>
        <p className="mt-1 text-[12.5px] wght-450 text-[var(--color-apple-muted)]">
          이 자료로 새 문제 세트를 만들어요. 기존 문제는 그대로 남아요.
        </p>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={submitting}
          maxLength={120}
          rows={3}
          placeholder="예: 단답형 위주로 / 3장만 / 더 어렵게 / 헷갈리는 개념 비교 위주"
          className="mt-4 w-full resize-none rounded-[12px] border border-[var(--color-apple-hairline)] bg-[var(--color-apple-pearl)]/40 px-3 py-2.5 text-[14px] text-[var(--color-apple-ink)] outline-none transition-colors focus:border-[var(--color-apple-action)] disabled:opacity-50"
          style={{ letterSpacing: "-0.012em" }}
        />

        <div className="mt-3 flex items-center gap-2">
          <span className="text-[12px] wght-560 text-[var(--color-apple-muted)]">개수</span>
          {COUNT_CHIPS.map((c) => (
            <button
              key={c}
              type="button"
              disabled={submitting}
              onClick={() => setCount(c)}
              className={`inline-flex h-8 min-w-[40px] items-center justify-center rounded-full px-3 text-[13px] wght-560 transition-colors disabled:opacity-50 ${
                count === c
                  ? "bg-[var(--color-apple-ink)] text-white"
                  : "bg-[var(--color-apple-pearl)] text-[var(--color-apple-muted)] hover:text-[var(--color-apple-ink)]"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {error && <p className="mt-3 text-[12.5px] wght-450 text-[var(--color-urgent)]">{error}</p>}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex h-[44px] items-center justify-center rounded-full bg-[var(--color-apple-pearl)] px-5 text-[13.5px] wght-560 text-[var(--color-apple-ink)] transition-colors hover:bg-white disabled:opacity-50"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex h-[44px] items-center justify-center rounded-full bg-[var(--color-apple-action)] px-6 text-[14px] wght-560 text-white transition-colors hover:bg-[var(--color-apple-action-hover)] disabled:opacity-60"
          >
            {submitting ? "요청 중…" : "만들기"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
