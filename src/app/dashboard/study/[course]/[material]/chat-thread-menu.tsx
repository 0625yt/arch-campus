"use client";

import { useEffect, useRef, useState } from "react";

export interface ChatThreadSummary {
  id: string;
  title: string;
  last_message_at: string | null;
  created_at: string;
}

/**
 * ChatPanel 헤더의 thread selector — 드롭다운 안에 목록 + 새 스레드 + 각 스레드 rename·삭제.
 */
export function ChatThreadMenu({
  threads,
  currentId,
  onSelect,
  onCreateNew,
  onRename,
  onDelete,
}: {
  threads: ChatThreadSummary[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onCreateNew: () => void;
  onRename: (id: string, nextTitle: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // outside click → 닫기
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setRenamingId(null);
        setConfirmDeleteId(null);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const current = threads.find((t) => t.id === currentId);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="inline-flex h-7 items-center gap-1 rounded-full border border-[var(--color-apple-hairline)] bg-white px-2.5 text-[11px] wght-560 text-[var(--color-apple-muted)] hover:border-[var(--color-apple-action)] hover:text-[var(--color-apple-ink)]"
        style={{ letterSpacing: "-0.012em" }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {threads.length === 0 ? "새 대화" : `대화 ${threads.length}개${current ? "" : " (없음)"}`}
        <span className="text-[9px]">▾</span>
      </button>

      {open && (
        <div
          role="menu"
          className="elev-2 absolute top-full right-0 mt-1.5 w-[280px] overflow-hidden rounded-[12px] border border-[var(--color-apple-hairline)] bg-white"
        >
          <button
            type="button"
            onClick={() => {
              onCreateNew();
              setOpen(false);
            }}
            className="block w-full border-b border-[var(--color-apple-hairline)] px-3 py-2.5 text-left text-[12.5px] wght-560 text-[var(--color-apple-action)] hover:bg-[var(--color-apple-pearl)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            + 새 대화 시작
          </button>

          <div className="max-h-[280px] overflow-y-auto">
            {threads.length === 0 ? (
              <p
                className="px-3 py-4 text-center text-[11.5px] wght-450 text-[var(--color-apple-muted)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                아직 대화가 없어요
              </p>
            ) : (
              threads.map((t) => (
                <ThreadRow
                  key={t.id}
                  thread={t}
                  active={t.id === currentId}
                  renaming={renamingId === t.id}
                  renameText={renamingId === t.id ? renameText : ""}
                  confirmingDelete={confirmDeleteId === t.id}
                  onSelect={() => {
                    onSelect(t.id);
                    setOpen(false);
                  }}
                  onStartRename={() => {
                    setRenamingId(t.id);
                    setRenameText(t.title);
                    setConfirmDeleteId(null);
                  }}
                  onChangeRename={setRenameText}
                  onSubmitRename={async () => {
                    const next = renameText.trim();
                    if (next && next !== t.title) {
                      await onRename(t.id, next);
                    }
                    setRenamingId(null);
                  }}
                  onCancelRename={() => setRenamingId(null)}
                  onStartDelete={() => {
                    setConfirmDeleteId(t.id);
                    setRenamingId(null);
                  }}
                  onConfirmDelete={async () => {
                    await onDelete(t.id);
                    setConfirmDeleteId(null);
                  }}
                  onCancelDelete={() => setConfirmDeleteId(null)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ThreadRow({
  thread,
  active,
  renaming,
  renameText,
  confirmingDelete,
  onSelect,
  onStartRename,
  onChangeRename,
  onSubmitRename,
  onCancelRename,
  onStartDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  thread: ChatThreadSummary;
  active: boolean;
  renaming: boolean;
  renameText: string;
  confirmingDelete: boolean;
  onSelect: () => void;
  onStartRename: () => void;
  onChangeRename: (v: string) => void;
  onSubmitRename: () => Promise<void>;
  onCancelRename: () => void;
  onStartDelete: () => void;
  onConfirmDelete: () => Promise<void>;
  onCancelDelete: () => void;
}) {
  if (renaming) {
    return (
      <div className="border-b border-[var(--color-apple-hairline)] px-3 py-2">
        <input
          type="text"
          value={renameText}
          maxLength={100}
          onChange={(e) => onChangeRename(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") {
              e.preventDefault();
              void onSubmitRename();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancelRename();
            }
          }}
          className="w-full rounded-[6px] border border-[var(--color-apple-action)] bg-white px-2 py-1 text-[12.5px] text-[var(--color-apple-ink)] outline-none"
          style={{ letterSpacing: "-0.012em" }}
        />
        <div className="mt-1.5 flex justify-end gap-1">
          <button
            type="button"
            onClick={onCancelRename}
            className="rounded-[4px] px-1.5 py-0.5 text-[10.5px] wght-450 text-[var(--color-apple-muted)] hover:text-[var(--color-apple-ink)]"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void onSubmitRename()}
            className="rounded-[4px] bg-[var(--color-apple-ink)] px-1.5 py-0.5 text-[10.5px] wght-560 text-white"
          >
            저장
          </button>
        </div>
      </div>
    );
  }

  if (confirmingDelete) {
    return (
      <div className="border-b border-[var(--color-apple-hairline)] bg-[var(--color-urgent)]/5 px-3 py-2">
        <p
          className="text-[11.5px] leading-[1.45] wght-450 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          이 대화 삭제할까요? 메시지도 모두 사라져요.
        </p>
        <div className="mt-1.5 flex justify-end gap-1">
          <button
            type="button"
            onClick={onCancelDelete}
            className="rounded-[4px] px-1.5 py-0.5 text-[10.5px] wght-450 text-[var(--color-apple-muted)] hover:text-[var(--color-apple-ink)]"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void onConfirmDelete()}
            className="rounded-[4px] bg-[var(--color-urgent)] px-1.5 py-0.5 text-[10.5px] wght-560 text-white"
          >
            삭제
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group flex items-center gap-1.5 border-b border-[var(--color-apple-hairline)] px-3 py-2 ${active ? "bg-[var(--color-apple-pearl)]" : "hover:bg-[var(--color-apple-pearl)]"}`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 truncate text-left text-[12.5px] wght-450 text-[var(--color-apple-ink)]"
        style={{ letterSpacing: "-0.012em" }}
        title={thread.title}
      >
        {thread.title}
      </button>
      <button
        type="button"
        onClick={onStartRename}
        className="text-[10px] wght-450 text-[var(--color-apple-muted)] opacity-0 transition-opacity hover:text-[var(--color-apple-action)] group-hover:opacity-100"
        title="이름 바꾸기"
      >
        편집
      </button>
      <button
        type="button"
        onClick={onStartDelete}
        className="text-[10px] wght-450 text-[var(--color-apple-muted)] opacity-0 transition-opacity hover:text-[var(--color-urgent)] group-hover:opacity-100"
        title="삭제"
      >
        삭제
      </button>
    </div>
  );
}
