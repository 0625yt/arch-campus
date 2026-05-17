"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Modal } from "@/components/modal";
import { pingSidebarCourses } from "@/components/sidebar";

interface CoursePick {
  id: string;
  name: string;
}

/**
 * 자료 카드 우측 ⋯ 버튼 — 이름 변경·강의 이동·삭제. 클릭 시 카드 Link 네비 막아야 함.
 *
 * 부모 카드가 <Link>로 감싸져 있어 모든 click이 라우팅으로 가버린다.
 * 메뉴/모달 열기 click은 stopPropagation + preventDefault.
 */
export function MaterialActionsMenu({
  materialId,
  initialTitle,
  currentCourseId,
  courses,
  onDeleteOptimistic,
  onDeleteFailed,
}: {
  materialId: string;
  initialTitle: string;
  currentCourseId?: string | null;
  courses?: CoursePick[];
  /** 호출하면 grid에서 즉시 숨김 — 서버 응답 기다리지 않음 */
  onDeleteOptimistic?: (id: string) => void;
  /** 서버 삭제 실패 시 다시 보이게 복구 */
  onDeleteFailed?: (id: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [moving, setMoving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [targetCourse, setTargetCourse] = useState<string>(currentCourseId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 메뉴 닫기 (모달은 자체 ESC/backdrop)
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function stop(e: React.MouseEvent | React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const trimmed = title.trim();
    if (!trimmed) {
      setError("제목을 비울 수 없어요");
      return;
    }
    if (trimmed === initialTitle) {
      setRenaming(false);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/materials/${materialId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "수정 실패");
        return;
      }
      setRenaming(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    // 모달 즉시 닫고 grid에서 숨김 — 서버 응답은 백그라운드
    setConfirmDelete(false);
    onDeleteOptimistic?.(materialId);
    try {
      const res = await fetch(`/api/materials/${materialId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        onDeleteFailed?.(materialId);
        alert(json.error ?? "삭제 실패");
        return;
      }
      pingSidebarCourses();
      router.refresh();
    } catch (e) {
      onDeleteFailed?.(materialId);
      alert(e instanceof Error ? e.message : "네트워크 오류");
    }
  }

  async function handleMove(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const newCourseId = targetCourse || null;
    if (newCourseId === (currentCourseId ?? null)) {
      setMoving(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/materials/${materialId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course_id: newCourseId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "이동 실패");
        return;
      }
      setMoving(false);
      pingSidebarCourses();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const canMove = (courses?.length ?? 0) > 0;

  return (
    <div ref={wrapRef} className="relative" onClick={stop} onPointerDown={stop}>
      <button
        type="button"
        aria-label="자료 메뉴"
        onClick={(e) => {
          stop(e);
          setOpen((v) => !v);
        }}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[14px] text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]"
      >
        ⋯
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-30 min-w-[140px] rounded-[10px] border border-[var(--color-apple-hairline)] bg-white py-1 shadow-[var(--shadow-lift)]">
          <MenuItem
            label="이름 변경"
            onClick={() => {
              setOpen(false);
              setTitle(initialTitle);
              setRenaming(true);
            }}
          />
          {canMove && (
            <MenuItem
              label="강의 변경"
              onClick={() => {
                setOpen(false);
                setTargetCourse(currentCourseId ?? "");
                setMoving(true);
              }}
            />
          )}
          <MenuItem
            label="삭제"
            destructive
            onClick={() => {
              setOpen(false);
              setConfirmDelete(true);
            }}
          />
        </div>
      )}

      <Modal open={renaming} onClose={() => setRenaming(false)} title="자료 이름 변경">
        <form onSubmit={handleRename} className="flex flex-col gap-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={160}
            autoFocus
            className="w-full rounded-[8px] border border-[var(--color-apple-hairline)] bg-white px-3 py-2 text-[14px] wght-560 text-[var(--color-apple-ink)] focus:border-[var(--color-apple-action)] focus:outline-none"
          />
          {error && (
            <p className="rounded-[8px] bg-[var(--color-urgent)]/10 px-3 py-2 text-[12px] wght-560 text-[var(--color-urgent)]">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRenaming(false)}
              disabled={busy}
              className="rounded-[8px] px-3.5 py-2 text-[13px] wght-560 text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)] disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-[8px] bg-[var(--color-apple-ink)] px-3.5 py-2 text-[13px] wght-620 text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "저장 중…" : "저장"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={moving}
        onClose={() => setMoving(false)}
        title="강의 변경"
        description="이 자료를 다른 강의로 옮겨요. '미분류'로도 옮길 수 있어요."
      >
        <form onSubmit={handleMove} className="flex flex-col gap-4">
          <select
            value={targetCourse}
            onChange={(e) => setTargetCourse(e.target.value)}
            autoFocus
            className="w-full rounded-[8px] border border-[var(--color-apple-hairline)] bg-white px-3 py-2 text-[14px] wght-450 text-[var(--color-apple-ink)] focus:border-[var(--color-apple-action)] focus:outline-none"
          >
            <option value="">미분류 (강의 없음)</option>
            {(courses ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {error && (
            <p className="rounded-[8px] bg-[var(--color-urgent)]/10 px-3 py-2 text-[12px] wght-560 text-[var(--color-urgent)]">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setMoving(false)}
              disabled={busy}
              className="rounded-[8px] px-3.5 py-2 text-[13px] wght-560 text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)] disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-[8px] bg-[var(--color-apple-ink)] px-3.5 py-2 text-[13px] wght-620 text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "이동 중…" : "이동"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="자료 삭제"
        description={`"${initialTitle}"\n\n자료와 원본 파일이 같이 사라져요. 되돌릴 수 없어요.`}
        confirmLabel="삭제"
        destructive
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function MenuItem({
  label,
  destructive,
  onClick,
}: {
  label: string;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        destructive
          ? "block w-full px-3.5 py-1.5 text-left text-[12.5px] wght-560 text-[var(--color-urgent)] hover:bg-[var(--color-urgent)]/10"
          : "block w-full px-3.5 py-1.5 text-left text-[12.5px] wght-560 text-[var(--color-apple-ink)] hover:bg-[var(--color-apple-pearl)]"
      }
    >
      {label}
    </button>
  );
}
