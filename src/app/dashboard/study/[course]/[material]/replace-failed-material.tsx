"use client";

import { CloudUpload, FileCheck2, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
import { pingSidebarCourses } from "@/components/sidebar";
import { pingActiveJobs } from "@/lib/hooks/use-active-jobs";
import { cn } from "@/lib/utils";

const MAX_FILE_BYTES = 60 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = new Set([
  "pdf",
  "docx",
  "pptx",
  "xlsx",
  "xlsm",
  "txt",
  "md",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "heic",
]);

const ACCEPT_ATTRIBUTE = [...ACCEPTED_EXTENSIONS].map((extension) => `.${extension}`).join(",");

type MaterialType = "lecture" | "assignment" | "exam" | "team" | "syllabus" | "notice";
type Phase = "idle" | "uploading" | "error";

interface Props {
  materialId: string;
  courseId: string | null;
  courseRouteKey: string;
  title: string;
  materialType: MaterialType;
}

interface UploadTarget {
  ok: true;
  signedUrl: string;
  storagePath: string;
  materialId: string;
  token: string;
}

interface ApiError {
  ok: false;
  error: string;
}

function extensionOf(filename: string): string {
  return filename.toLowerCase().split(".").pop() ?? "";
}

function validateFile(file: File): string | null {
  if (!ACCEPTED_EXTENSIONS.has(extensionOf(file.name))) {
    return "PDF, DOCX, PPTX, XLSX, TXT, MD 또는 이미지 파일을 선택해 주세요.";
  }
  if (file.size > MAX_FILE_BYTES) return "파일은 60MB까지 올릴 수 있어요.";
  if (file.size === 0) return "내용이 없는 파일은 올릴 수 없어요.";
  return null;
}

/**
 * 요약 실패 화면에서 파일을 바로 교체한다.
 * 새 자료 등록이 끝난 뒤에만 기존 실패 자료를 지워 업로드 실패 시 원본을 보존한다.
 */
export function ReplaceFailedMaterial({
  materialId,
  courseId,
  courseRouteKey,
  title,
  materialType,
}: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = phase === "uploading";

  function chooseFile(nextFile: File | null) {
    if (!nextFile) return;
    const invalidReason = validateFile(nextFile);
    if (invalidReason) {
      setFile(null);
      setPhase("error");
      setError(invalidReason);
      return;
    }
    setFile(nextFile);
    setPhase("idle");
    setError(null);
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    chooseFile(event.target.files?.[0] ?? null);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLFieldSetElement>) {
    event.preventDefault();
    setDragging(false);
    if (!busy) chooseFile(event.dataTransfer.files?.[0] ?? null);
  }

  async function replaceFile() {
    if (!file || busy) return;
    setPhase("uploading");
    setError(null);

    try {
      const targetResponse = await fetch("/api/materials/upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: file.name }),
      });
      const target = (await targetResponse.json().catch(() => null)) as
        | UploadTarget
        | ApiError
        | null;
      if (!targetResponse.ok || !target || target.ok === false) {
        throw new Error(
          (target && target.ok === false && target.error) || "업로드 준비에 실패했어요.",
        );
      }

      const storageResponse = await fetch(target.signedUrl, {
        method: "PUT",
        headers: {
          "content-type": file.type || "application/octet-stream",
          "x-upsert": "false",
        },
        body: file,
      });
      if (!storageResponse.ok) throw new Error("파일을 저장하지 못했어요. 다시 시도해 주세요.");

      const finalizeResponse = await fetch("/api/materials/finalize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          storagePath: target.storagePath,
          filename: file.name,
          mimeType: file.type || undefined,
          materialId: target.materialId,
          courseId: courseId ?? undefined,
          title,
          type: materialType,
        }),
      });
      const finalized = (await finalizeResponse.json().catch(() => null)) as
        | { ok: true; materialId: string }
        | ApiError
        | null;
      if (!finalizeResponse.ok || !finalized || finalized.ok === false) {
        throw new Error(
          (finalized && finalized.ok === false && finalized.error) || "새 자료 등록에 실패했어요.",
        );
      }

      // 새 자료가 안전하게 등록된 뒤에만 실패 자료를 정리한다. 정리 실패는 새 분석을 막지 않는다.
      await fetch(`/api/materials/${materialId}`, { method: "DELETE" }).catch(() => null);
      pingActiveJobs();
      pingSidebarCourses();
      router.push(`/dashboard/study/${encodeURIComponent(courseRouteKey)}/${finalized.materialId}`);
      router.refresh();
    } catch (caught) {
      setPhase("error");
      setError(caught instanceof Error ? caught.message : "파일을 교체하지 못했어요.");
    }
  }

  return (
    <div className="mt-7 border-t border-[var(--color-apple-hairline)] pt-6">
      <div className="flex flex-col gap-1">
        <p className="text-[13px] wght-620 text-[var(--color-apple-ink)]">
          원본 파일에 문제가 있다면
        </p>
        <p className="text-[12px] leading-[1.55] wght-450 text-[var(--color-apple-muted)]">
          이 화면에서 새 파일로 교체하면 같은 과목과 제목으로 다시 분석해요.
        </p>
      </div>

      <fieldset
        aria-label="새 파일 교체 영역"
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "mt-4 rounded-[12px] border border-dashed p-4 transition-colors sm:flex sm:items-center sm:justify-between sm:gap-4",
          dragging
            ? "border-[var(--color-apple-action)] bg-[#f0f7ff]"
            : "border-[var(--color-apple-hairline)] bg-[var(--color-apple-pearl)]",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          disabled={busy}
          className="sr-only"
          aria-label="교체할 파일 선택"
          onChange={onInputChange}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="flex min-w-0 items-center gap-3 text-left disabled:cursor-wait"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[var(--color-apple-action)] shadow-sm">
            {file ? <FileCheck2 size={17} /> : <CloudUpload size={17} />}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12.5px] wght-620 text-[var(--color-apple-ink)]">
              {file?.name ?? "끌어다 놓거나 새 파일 선택"}
            </span>
            <span className="mt-0.5 block text-[10.5px] wght-450 text-[var(--color-apple-muted)]">
              PDF · DOCX · PPTX · XLSX · 이미지 · 최대 60MB
            </span>
          </span>
        </button>

        <button
          type="button"
          disabled={!file || busy}
          onClick={replaceFile}
          className="mt-3 inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] bg-[var(--color-apple-ink)] px-3.5 text-[12px] wght-620 text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35 sm:mt-0"
        >
          {busy && <LoaderCircle size={14} className="animate-spin" />}
          {busy ? "교체하는 중" : "새 파일로 교체"}
        </button>
      </fieldset>

      {error && (
        <p role="alert" className="mt-2 text-[11.5px] wght-500 text-[var(--color-urgent)]">
          {error}
        </p>
      )}
      <p className="mt-2 text-[10.5px] wght-450 text-[var(--color-apple-muted)]">
        새 자료가 등록되기 전에는 기존 자료를 삭제하지 않아요.
      </p>
    </div>
  );
}
