"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/modal";

/**
 * 개인 공부 주제 (자격증·시험·개인 공부) 직접 생성 트리거.
 *
 * 의도: 정규 강의는 시간표 한 번 올리면 자동 등록되니까 이 버튼이 필요 없고,
 * 학생이 자기 의지로 추가하는 건 정보처리기사·토익·공무원처럼 시간표에
 * 없는 주제뿐이다. 그래서 "주제 추가" 라벨로 통일.
 */
export function AddPersonalButton({ variant = "primary" }: { variant?: "primary" | "ghost" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), category: "personal" }),
      });
      const json = (await res.json()) as
        | { ok: true; course: { id: string; name: string } }
        | { ok: false; error: string };
      if (!json.ok) {
        setError(json.error);
        return;
      }
      setOpen(false);
      setName("");
      // 사이드바·페이지 새로고침
      router.refresh();
      router.push(`/dashboard/study/${encodeURIComponent(json.course.name)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = name.trim().length > 0 && !submitting;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === "primary"
            ? "inline-flex h-[40px] items-center gap-1 rounded-full bg-[var(--color-apple-ink)] px-4 text-[13px] wght-560 text-white transition-all hover:opacity-90 active:scale-[0.97]"
            : "inline-flex h-[36px] items-center gap-1 rounded-full border border-dashed border-[var(--color-apple-hairline)] px-4 text-[12.5px] wght-450 text-[var(--color-apple-muted)] transition-all hover:border-[var(--color-apple-ink)] hover:text-[var(--color-apple-ink)]"
        }
        style={{ letterSpacing: "-0.012em" }}
      >
        <span aria-hidden>+</span>
        주제 추가
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="개인 공부 주제 추가"
        description="시간표에 없는 자격증·시험·개인 공부 주제를 따로 관리해요. 자료 업로드·문제 생성·오답 복습은 정규 강의와 똑같이 동작합니다."
      >
        <label className="flex flex-col gap-2">
          <span className="text-[11.5px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
            주제 이름
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 정보처리기사 / TOEIC / 개인 사이드 프로젝트"
            maxLength={60}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSubmit) handleCreate();
            }}
            className="h-11 rounded-[10px] border border-[var(--color-apple-hairline)] bg-white px-3.5 text-[14px] wght-450 text-[var(--color-apple-ink)] transition-all focus:border-[var(--color-apple-action)] focus:outline-none"
          />
        </label>

        {error && (
          <p className="mt-3 text-[12.5px] wght-450 text-[var(--color-urgent)]">{error}</p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-[40px] rounded-full px-4 text-[13px] wght-450 text-[var(--color-apple-muted)] hover:text-[var(--color-apple-ink)]"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!canSubmit}
            className="inline-flex h-[40px] items-center justify-center rounded-full bg-[var(--color-apple-action)] px-5 text-[13px] wght-560 text-white transition-all hover:bg-[var(--color-apple-action-hover)] disabled:opacity-40"
            style={{ letterSpacing: "-0.012em" }}
          >
            {submitting ? "만드는 중…" : "주제 만들기 →"}
          </button>
        </div>
      </Modal>
    </>
  );
}
