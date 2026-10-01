"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/modal";
import type { QuizSourceMaterial } from "@/lib/data/materials";
import { GenerateForm } from "../study/[course]/[material]/generate-form";

export function NewQuizLauncher({
  sources,
  initialMaterialId,
}: {
  sources: QuizSourceMaterial[];
  initialMaterialId?: string;
}) {
  const requestedSource = sources.find(
    (source) => source.id === initialMaterialId && source.canGenerate,
  );
  const firstAvailable =
    requestedSource ?? sources.find((source) => source.canGenerate) ?? sources[0];
  const [open, setOpen] = useState(Boolean(requestedSource));
  const [selectedId, setSelectedId] = useState(firstAvailable?.id ?? "");
  const selected = sources.find((source) => source.id === selectedId) ?? firstAvailable;
  const siblings = selected?.courseId
    ? sources
        .filter((source) => source.courseId === selected.courseId && source.id !== selected.id)
        .map((source) => ({ id: source.id, title: source.title, type: source.type }))
    : [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={sources.length === 0}
        className="spring-press inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-[var(--color-apple-ink)] px-4 text-[13px] wght-620 text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35 sm:w-auto"
      >
        <Plus aria-hidden size={15} strokeWidth={2} />새 문제
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="새 문제 만들기"
        description={selected?.title ?? "문제로 바꿀 자료를 선택하세요"}
        size="md"
      >
        {selected ? (
          <div>
            <label
              htmlFor="quiz-source-material"
              className="text-[12px] wght-620 text-[var(--color-apple-ink)]"
            >
              자료
            </label>
            <select
              id="quiz-source-material"
              value={selected.id}
              onChange={(event) => setSelectedId(event.target.value)}
              className="mt-2 h-11 w-full rounded-[12px] border border-[var(--color-apple-hairline)] bg-white px-3 text-[13px] wght-560 text-[var(--color-apple-ink)] outline-none focus:border-[var(--color-apple-action)]"
            >
              {sources.map((source) => (
                <option key={source.id} value={source.id} disabled={!source.canGenerate}>
                  {source.courseName ? `${source.courseName} · ` : ""}
                  {source.title}
                  {!source.canGenerate ? " · 다시 업로드 필요" : ""}
                </option>
              ))}
            </select>
            {!selected.canGenerate ? (
              <p className="mt-4 rounded-[12px] bg-[var(--color-urgent-soft)] px-3.5 py-3 text-[12.5px] leading-[1.55] text-[var(--color-urgent-strong)]">
                이 자료는 본문을 충분히 읽지 못했어요. 원본을 다시 올리면 근거가 확인된 문제만 만들
                수 있어요.
              </p>
            ) : (
              <div className="mt-7 border-t border-[var(--color-apple-hairline)] pt-6">
                <GenerateForm
                  key={selected.id}
                  courseSlug={selected.courseName ?? "개인 공부"}
                  materialId={selected.id}
                  materialType={selected.type}
                  siblingMaterials={siblings}
                />
              </div>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-[var(--color-apple-muted)]">
            먼저 공부 화면에서 자료를 하나 올려 주세요.
          </p>
        )}
      </Modal>
    </>
  );
}
