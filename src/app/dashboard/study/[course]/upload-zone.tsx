"use client";

import { useState, type DragEvent } from "react";
import { cn } from "@/lib/utils";
import { Divider } from "@/components/primitives";

export function UploadZone() {
  const [over, setOver] = useState(false);
  const [name, setName] = useState<string | null>(null);

  function onDragOver(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setOver(true);
  }
  function onDragLeave() {
    setOver(false);
  }
  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setName(f.name);
  }

  return (
    <label
      htmlFor="upload"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "group block cursor-pointer rounded-2xl border border-dashed p-5 transition-colors duration-[var(--duration-base)] sm:p-6",
        over
          ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
          : "border-[var(--color-line-strong)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-strong)]"
      )}
    >
      <input
        id="upload"
        type="file"
        accept=".pdf,.hwpx,.pptx,.docx,.txt,.md"
        className="sr-only"
        onChange={(e) => setName(e.target.files?.[0]?.name ?? null)}
      />

      {name ? (
        <>
          <p className="text-[14px] wght-560 kerning-tight text-[var(--color-fg-strong)] sm:text-[15px]">
            ✓ {name}
          </p>
          <p className="mt-1 text-[12px] wght-450 kerning-tight text-[var(--color-fg-muted)]">
            요약과 첫 문제를 만들고 있어요…
          </p>
        </>
      ) : (
        <>
          <p className="text-[14px] wght-560 kerning-tight text-[var(--color-fg-strong)] sm:text-[15px]">
            끌어다 놓거나 클릭해서 선택
          </p>
          <p className="mt-1 text-[12px] wght-450 kerning-tight text-[var(--color-fg-muted)]">
            PDF · HWPX · PPTX · DOCX · TXT · MD
          </p>
          <Divider className="my-4" />
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
            <span>HWP는 변환 안내</span>
            <span className="text-[var(--color-line-strong)]">·</span>
            <span>본인만 볼 수 있어요</span>
            <span className="text-[var(--color-line-strong)]">·</span>
            <span>60초 안에 첫 결과</span>
          </div>
        </>
      )}
    </label>
  );
}
