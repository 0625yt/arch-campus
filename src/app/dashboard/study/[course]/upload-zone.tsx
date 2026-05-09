"use client";

import { CloudUpload } from "lucide-react";
import { type DragEvent, useState } from "react";
import { cn } from "@/lib/utils";

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
        "flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-[12px] border border-dashed px-8 py-10 text-center transition-colors",
        over
          ? "border-[var(--color-apple-action)] bg-[#f0f7ff]"
          : "border-[var(--color-apple-hairline)] bg-white hover:bg-[var(--color-apple-pearl)]",
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
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-apple-pearl)] text-[var(--color-apple-success)]">
            ✓
          </span>
          <p
            className="mt-4 text-[15px] wght-560 text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {name}
          </p>
          <p
            className="mt-1.5 text-[13px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.022em" }}
          >
            요약과 첫 문제를 만들고 있어요…
          </p>
        </>
      ) : (
        <>
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-apple-pearl)] text-[var(--color-apple-ink)]">
            <CloudUpload size={20} strokeWidth={1.6} />
          </span>
          <p
            className="mt-4 text-[15px] wght-560 text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            끌어다 놓거나 클릭해서 선택
          </p>
          <p
            className="mt-1.5 text-[13px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.022em" }}
          >
            PDF · HWPX · PPTX · DOCX · TXT · MD
          </p>
          <p
            className="mt-3 text-[11px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            HWP 변환 안내 · 본인만 볼 수 있어요 · 60초 안에 첫 결과
          </p>
        </>
      )}
    </label>
  );
}
