"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Modal } from "@/components/modal";

// /api/courses POST의 PALETTE와 동일 — 신규 추가 시 자동 색이 이 안에서 도는 것과 맞춤
const COLOR_PALETTE = [
  "#7aa6d6",
  "#cca06b",
  "#7fb38c",
  "#a08bc4",
  "#e0445e",
  "#5b8a8a",
] as const;

/**
 * 강의 카드 우상단 ⋯ — 이름·교수·색상 수정, 삭제.
 *
 * MaterialActionsMenu와 같은 패턴. 부모 <Link> 안 click 라우팅 막기.
 * 강의 삭제 정책(사용자 합의): 자료·일정은 미분류로 남김 (cascade=set null).
 */
export function CourseActionsMenu({
  courseId,
  initialName,
  initialProfessor,
  initialColor,
  isPersonal,
}: {
  courseId: string;
  initialName: string;
  initialProfessor: string | null;
  initialColor?: string | null;
  isPersonal?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState(initialName);
  const [professor, setProfessor] = useState(initialProfessor ?? "");
  const [color, setColor] = useState<string>(initialColor ?? COLOR_PALETTE[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const trimmedName = name.trim();
    const trimmedProf = professor.trim();
    if (!trimmedName) {
      setError("이름을 비울 수 없어요");
      return;
    }
    const body: Record<string, unknown> = {};
    if (trimmedName !== initialName) body.name = trimmedName;
    if (trimmedProf !== (initialProfessor ?? "")) {
      body.professor = trimmedProf || null;
    }
    if (color !== (initialColor ?? COLOR_PALETTE[0])) {
      body.color = color;
    }
    if (Object.keys(body).length === 0) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/courses/${courseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "수정 실패");
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    const res = await fetch(`/api/courses/${courseId}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      alert(json.error ?? "삭제 실패");
      return;
    }
    setConfirmDelete(false);
    router.refresh();
  }

  return (
    <div ref={wrapRef} className="relative" onClick={stop} onPointerDown={stop}>
      <button
        type="button"
        aria-label="강의 메뉴"
        onClick={(e) => {
          stop(e);
          setOpen((v) => !v);
        }}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/70 text-[14px] text-[var(--color-apple-muted)] backdrop-blur-sm transition-colors hover:bg-white hover:text-[var(--color-apple-ink)]"
      >
        ⋯
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-30 min-w-[150px] rounded-[10px] border border-[var(--color-apple-hairline)] bg-white py-1 shadow-[var(--shadow-lift)]">
          <MenuItem
            label={isPersonal ? "이름·색상 수정" : "이름·교수·색상 수정"}
            onClick={() => {
              setOpen(false);
              setName(initialName);
              setProfessor(initialProfessor ?? "");
              setColor(initialColor ?? COLOR_PALETTE[0]);
              setEditing(true);
            }}
          />
          <MenuItem
            label={isPersonal ? "주제 삭제" : "강의 삭제"}
            destructive
            onClick={() => {
              setOpen(false);
              setConfirmDelete(true);
            }}
          />
        </div>
      )}

      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title={isPersonal ? "주제 수정" : "강의 수정"}
      >
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span
              className="text-[10px] wght-620 uppercase text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "0.08em" }}
            >
              이름
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              autoFocus
              className="w-full rounded-[8px] border border-[var(--color-apple-hairline)] bg-white px-3 py-2 text-[14px] wght-560 text-[var(--color-apple-ink)] focus:border-[var(--color-apple-action)] focus:outline-none"
            />
          </label>

          {!isPersonal && (
            <label className="flex flex-col gap-1.5">
              <span
                className="text-[10px] wght-620 uppercase text-[var(--color-apple-muted)]"
                style={{ letterSpacing: "0.08em" }}
              >
                교수 (선택)
              </span>
              <input
                type="text"
                value={professor}
                onChange={(e) => setProfessor(e.target.value)}
                maxLength={60}
                placeholder="비워두면 '교수 미정'"
                className="w-full rounded-[8px] border border-[var(--color-apple-hairline)] bg-white px-3 py-2 text-[14px] wght-450 text-[var(--color-apple-ink)] focus:border-[var(--color-apple-action)] focus:outline-none"
              />
            </label>
          )}

          <fieldset className="flex flex-col gap-1.5">
            <legend
              className="text-[10px] wght-620 uppercase text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "0.08em" }}
            >
              색상
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`색상 ${c}`}
                  aria-pressed={color === c}
                  className={
                    color === c
                      ? "h-7 w-7 rounded-full ring-2 ring-[var(--color-apple-ink)] ring-offset-2 ring-offset-white"
                      : "h-7 w-7 rounded-full transition-transform hover:scale-110"
                  }
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </fieldset>

          {error && (
            <p className="rounded-[8px] bg-[var(--color-urgent)]/10 px-3 py-2 text-[12px] wght-560 text-[var(--color-urgent)]">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
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

      <ConfirmDialog
        open={confirmDelete}
        title={isPersonal ? "주제 삭제" : "강의 삭제"}
        description={`"${initialName}"\n\n${
          isPersonal ? "주제를" : "강의를"
        } 지울까요? 이 ${
          isPersonal ? "주제" : "강의"
        }에 묶여 있던 자료·일정은 '미분류'로 남아요.`}
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
