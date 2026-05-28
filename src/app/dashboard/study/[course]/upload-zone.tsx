"use client";

import { CloudUpload } from "lucide-react";
import Link from "next/link";
import { type DragEvent, useRef, useState } from "react";
import { Modal } from "@/components/modal";
import { pingSidebarCourses } from "@/components/sidebar";
import { addOptimisticJob, pingActiveJobs, removeOptimisticJob } from "@/lib/hooks/use-active-jobs";
import { cn } from "@/lib/utils";

type Phase = "idle" | "requesting" | "uploading" | "finalizing" | "done" | "error";
type MaterialType = "lecture" | "exam";

export function UploadZone({ courseId, courseName }: { courseId: string; courseName: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [doneMaterialId, setDoneMaterialId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // 파일 선택 후 자료 종류를 묻는 단계 — 모달이 떠 있는 동안엔 진짜 업로드 시작 X.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pickedType, setPickedType] = useState<MaterialType>("lecture");

  async function startUpload(file: File, type: MaterialType) {
    setFileName(file.name);
    setPhase("requesting");
    setErrorMsg(null);

    try {
      // 1) signed URL 발급
      const urlRes = await fetch("/api/materials/upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: file.name }),
      });
      const urlBody = (await urlRes.json().catch(() => null)) as
        | { ok: true; signedUrl: string; storagePath: string; materialId: string; token: string }
        | { ok: false; error: string }
        | null;
      if (!urlRes.ok || !urlBody || urlBody.ok === false) {
        const msg =
          (urlBody && urlBody.ok === false && urlBody.error) ||
          `URL 발급 실패 (HTTP ${urlRes.status})`;
        setErrorMsg(msg);
        setPhase("error");
        return;
      }

      // 2) Storage에 직접 PUT — Vercel 함수 본문 한도(4.5MB) 우회
      setPhase("uploading");
      // dock에 즉시 "올라가는 중" 표시 — 서버 잡 도착 전까지 임시로 박음
      const optimisticId = `optimistic-${urlBody.materialId}`;
      addOptimisticJob({
        id: optimisticId,
        tool: "upload",
        toolLabel: "올리는 중",
        status: "running",
        materialId: urlBody.materialId,
        materialTitle: file.name,
        courseId,
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
      });
      const putRes = await fetch(urlBody.signedUrl, {
        method: "PUT",
        headers: {
          "content-type": file.type || "application/octet-stream",
          "x-upsert": "false",
        },
        body: file,
      });
      if (!putRes.ok) {
        removeOptimisticJob(optimisticId);
        setErrorMsg(`파일 업로드 실패 (HTTP ${putRes.status})`);
        setPhase("error");
        return;
      }

      // 3) finalize — 파싱·INSERT·잡 큐잉
      setPhase("finalizing");
      const finRes = await fetch("/api/materials/finalize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          storagePath: urlBody.storagePath,
          filename: file.name,
          mimeType: file.type || undefined,
          materialId: urlBody.materialId,
          courseId,
          type,
        }),
      });
      const finBody = (await finRes.json().catch(() => null)) as
        | { ok: true; materialId: string }
        | { ok: false; error: string }
        | null;
      if (!finRes.ok || !finBody || finBody.ok === false) {
        removeOptimisticJob(optimisticId);
        const msg =
          (finBody && finBody.ok === false && finBody.error) ||
          `finalize 실패 (HTTP ${finRes.status})`;
        setErrorMsg(msg);
        setPhase("error");
        return;
      }

      // 서버에 잡이 이미 INSERT된 상태 — dock 즉시 갱신 trigger
      pingActiveJobs();
      // 사이드바 강의별 자료 수도 즉시 갱신
      pingSidebarCourses();

      // 자동 이동 X — zone 풀어주고 done 카드만 표시.
      setDoneMaterialId(finBody.materialId);
      setPhase("done");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "네트워크 오류");
      setPhase("error");
    }
  }

  const busy = phase === "requesting" || phase === "uploading" || phase === "finalizing";

  function onDragOver(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    if (busy) return;
    setOver(true);
  }
  function onDragLeave() {
    setOver(false);
  }
  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setOver(false);
    if (busy) return;
    const f = e.dataTransfer.files?.[0];
    if (f) askTypeThenUpload(f);
  }

  // 파일 선택 직후 자료 종류를 먼저 묻는다 — 기본은 강의자료, 기출문제 선택 시 type=exam으로 박힘.
  function askTypeThenUpload(file: File) {
    setPickedType("lecture");
    setPendingFile(file);
  }

  function confirmType() {
    if (!pendingFile) return;
    const file = pendingFile;
    const type = pickedType;
    setPendingFile(null);
    void startUpload(file, type);
  }

  function cancelType() {
    setPendingFile(null);
    // <input>의 value를 비워야 같은 파일을 다시 골랐을 때 onChange가 다시 발생함.
    if (inputRef.current) inputRef.current.value = "";
  }

  const phaseLabel: Record<Phase, string> = {
    idle: "",
    requesting: "업로드 준비 중…",
    uploading: "파일 올리는 중… 잠시만요",
    finalizing: "분석 큐에 넣는 중…",
    done: "",
    error: "",
  };

  function resetForNextUpload() {
    setPhase("idle");
    setFileName(null);
    setDoneMaterialId(null);
    setErrorMsg(null);
  }

  return (
    <>
    <label
      id="upload-zone"
      htmlFor="upload"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      aria-busy={busy}
      className={cn(
        "flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-[12px] border border-dashed px-8 py-10 text-center transition-colors",
        busy && "cursor-wait opacity-90",
        over
          ? "border-[var(--color-apple-action)] bg-[#f0f7ff]"
          : "border-[var(--color-apple-hairline)] bg-white hover:bg-[var(--color-apple-pearl)]",
      )}
    >
      <input
        ref={inputRef}
        id="upload"
        type="file"
        accept=".pdf,.hwp,.hwpx,.pptx,.docx,.txt,.md"
        disabled={busy}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) askTypeThenUpload(f);
        }}
      />

      {busy ? (
        <>
          <span
            aria-hidden
            className="h-9 w-9 animate-spin rounded-full border-2 border-[var(--color-apple-hairline)] border-t-[var(--color-apple-action)]"
          />
          <p
            className="mt-4 text-[15px] wght-560 text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {fileName}
          </p>
          <p
            className="mt-1.5 text-[13px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.022em" }}
          >
            {phaseLabel[phase]}
          </p>
        </>
      ) : phase === "done" ? (
        <>
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#e8f4ec] text-[var(--color-apple-action,#26a065)]">
            ✓
          </span>
          <p
            className="mt-4 text-[15px] wght-560 text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {fileName}
          </p>
          <p
            className="mt-1.5 max-w-[420px] text-[13px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.022em" }}
          >
            분석을 시작했어요. 끝나면 자료에서 요약·문제를 확인할 수 있어요.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {doneMaterialId && (
              <Link
                href={`/dashboard/study/${encodeURIComponent(courseName)}/${doneMaterialId}`}
                onClick={(e) => e.stopPropagation()}
                className="rounded-[8px] border border-[var(--color-apple-hairline)] bg-white px-3 py-1.5 text-[12px] wght-560 text-[var(--color-apple-ink)] hover:border-[var(--color-apple-action)] hover:text-[var(--color-apple-action)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                자료 보기 →
              </Link>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                resetForNextUpload();
                inputRef.current?.click();
              }}
              className="rounded-[8px] bg-[var(--color-apple-ink)] px-3 py-1.5 text-[12px] wght-560 text-white hover:opacity-90"
              style={{ letterSpacing: "-0.012em" }}
            >
              다른 자료 더 올리기
            </button>
          </div>
        </>
      ) : phase === "error" ? (
        <>
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#fde8eb] text-[var(--color-apple-danger,#c44)]">
            !
          </span>
          <p
            className="mt-4 text-[15px] wght-560 text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {fileName ?? "업로드 실패"}
          </p>
          <p
            className="mt-1.5 max-w-[420px] text-[13px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.022em" }}
          >
            {errorMsg ?? "다시 시도해 주세요"}
          </p>
          <p
            className="mt-3 text-[11px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            클릭하면 다시 선택할 수 있어요
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

    <Modal
      open={pendingFile !== null}
      onClose={cancelType}
      title="이 자료의 종류는?"
      description={pendingFile?.name}
      size="sm"
    >
      <div>
        <p
          className="text-[12.5px] wght-450 leading-[1.6] text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.022em" }}
        >
          기출문제로 표시하면 자료에 실린 문제·정답·해설을 그대로 추출해 풀이할 수 있어요. 기본은
          강의자료예요.
        </p>

        <ul className="mt-5 -mx-1 flex flex-wrap gap-x-1 gap-y-2">
          {(
            [
              { value: "lecture", label: "강의자료", subtitle: "요약·문제 만들기" },
              { value: "exam", label: "기출문제", subtitle: "문제·정답 그대로 추출" },
            ] as Array<{ value: MaterialType; label: string; subtitle: string }>
          ).map(({ value, label, subtitle }) => {
            const active = pickedType === value;
            return (
              <li key={value}>
                <button
                  type="button"
                  onClick={() => setPickedType(value)}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex items-baseline gap-1.5 rounded-full px-3.5 py-2 text-[13px] transition-colors",
                    active
                      ? "wght-560 bg-[var(--color-apple-ink)] text-white"
                      : "wght-450 text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]",
                  )}
                >
                  {label}
                  <span
                    className={cn(
                      "text-[11px] wght-450",
                      active ? "text-white/65" : "text-[var(--color-apple-muted)]/65",
                    )}
                  >
                    {subtitle}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-7 flex justify-end gap-2">
          <button
            type="button"
            onClick={cancelType}
            className="rounded-full px-4 py-2 text-[13px] wght-450 text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={confirmType}
            className="rounded-full bg-[var(--color-apple-ink)] px-4 py-2 text-[13px] wght-560 text-white transition-opacity hover:opacity-90"
            style={{ letterSpacing: "-0.012em" }}
          >
            올리기
          </button>
        </div>
      </div>
    </Modal>
    </>
  );
}
