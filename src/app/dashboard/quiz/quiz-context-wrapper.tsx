"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ContextMenu, type ContextMenuItem, useContextMenu } from "@/components/context-menu";

/**
 * 퀴즈 카드 우클릭/long-press → 컨텍스트 메뉴 (삭제).
 *
 * course-context-wrapper와 같은 패턴. children은 QuizCard 자체 — 좌클릭은
 * 그대로 라우팅, 우클릭만 메뉴.
 *
 * 삭제 동작:
 *   - optimistic: 메뉴 클릭 즉시 카드 숨김 (onHide 콜백)
 *   - 실제 DELETE 성공 시 router.refresh() — server component가 다시 fetch
 *   - 실패 시 onHide 되돌리고 alert
 */
export function QuizContextWrapper({
  quizId,
  quizTitle,
  onHide,
  onUnhide,
  children,
}: {
  quizId: string;
  quizTitle: string;
  /** optimistic 숨김 트리거. 부모 grid가 ids에서 빼고 즉시 카드 사라짐 */
  onHide?: (id: string) => void;
  /** 삭제 실패 시 되돌리기 */
  onUnhide?: (id: string) => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const ctx = useContextMenu();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const items: ContextMenuItem[] = [
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
      {children}

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
    </div>
  );
}
