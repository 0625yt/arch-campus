"use client";

import { CloudUpload } from "lucide-react";
import Link from "next/link";
import { type DragEvent, useRef, useState } from "react";
import { Modal } from "@/components/modal";
import { pingSidebarCourses } from "@/components/sidebar";
import { addOptimisticJob, pingActiveJobs, removeOptimisticJob } from "@/lib/hooks/use-active-jobs";
import { cn } from "@/lib/utils";

type Phase = "idle" | "uploading" | "done" | "error";
type MaterialType = "lecture" | "exam";
/** 파일 2개 이상일 때 사용자가 고름. 1개면 항상 separate(=N=1). */
type MergeMode = "separate" | "merge";

interface UploadedItem {
  filename: string;
  materialId: string;
}

interface FailedItem {
  filename: string;
  reason: string;
}

/**
 * 형식 동질성 — 모두 PDF면 진짜 PDF merge, 모두 비-PDF면 텍스트 concat, 섞이면 불가.
 * 서버의 detectMergeMode와 같은 규칙. UI 가드 + 서버 422 fallback 양쪽 작동.
 */
function detectCompatibility(files: File[]): "pdf" | "text-concat" | "incompatible" {
  if (files.length === 0) return "incompatible";
  const mimes = files.map((f) => f.type || guessMimeFromName(f.name));
  if (mimes.every((m) => m === "application/pdf")) return "pdf";
  if (mimes.some((m) => m === "application/pdf")) return "incompatible";
  return "text-concat";
}

/** 브라우저가 file.type 비워 보내는 경우(특히 .hwpx·.md) 확장자로 추정. */
function guessMimeFromName(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "docx")
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "pptx")
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (ext === "txt") return "text/plain";
  if (ext === "md") return "text/markdown";
  if (ext === "hwpx" || ext === "hwp") return "application/x-hwp";
  return "application/octet-stream";
}

/**
 * 자료 업로드 zone — 다중 파일 지원.
 *
 * 동작:
 *   1) 드래그·클릭으로 1개 이상 파일 선택
 *   2) 모달 1회로 모든 파일의 자료 종류 일괄 결정 (기본 강의자료)
 *   3) 순차 업로드 (병렬은 Storage·rate limit 부담)
 *      - 각 파일마다: signed URL → PUT → finalize → optimistic job
 *   4) 진행 상황: "N개 중 K번째 / 파일명"
 *   5) 끝나면 성공 N건 + 실패 M건 카드. 성공 1건이면 "자료 보기", N건이면 강의로 이동.
 *
 * 안전:
 *   - 한 파일 실패해도 나머지 진행
 *   - optimistic job dock에 파일마다 별개 카드 (사용자가 어느게 끝났는지 인지)
 *   - 모달 취소 = 전부 취소
 */
export function UploadZone({ courseId, courseName }: { courseId: string; courseName: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [currentName, setCurrentName] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<UploadedItem[]>([]);
  const [failed, setFailed] = useState<FailedItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // 파일 선택 후 자료 종류를 묻는 단계. N개 파일이 함께 같은 종류로.
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pickedType, setPickedType] = useState<MaterialType>("lecture");
  // 2개 이상 선택 시 사용자가 고름. 기본 "각각 등록" — 안전한 기본값.
  const [mergeMode, setMergeMode] = useState<MergeMode>("separate");
  // 첫 요약 한 줄 요청 — 자료 안에서 무엇을 강조할지. 자료 밖 생성은 서버 가드(120자 + 프롬프트)가 거부.
  // 모달에서 입력 → finalize/finalize-merged의 intentNote로 전달 → 첫 요약부터 반영.
  const [intentNote, setIntentNote] = useState("");

  /**
   * 한 파일 업로드 — 성공이면 materialId 반환, 실패면 throw.
   * 호출자(uploadAll)가 try/catch로 한 파일 실패를 batch에 기록.
   */
  async function uploadOne(file: File, type: MaterialType, note: string): Promise<string> {
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
      throw new Error(msg);
    }

    // 2) Storage에 직접 PUT — Vercel 함수 본문 한도(4.5MB) 우회.
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
      throw new Error(`파일 업로드 실패 (HTTP ${putRes.status})`);
    }

    // 3) finalize — 파싱·INSERT·잡 큐잉
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
        intentNote: note || undefined,
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
      throw new Error(msg);
    }
    return finBody.materialId;
  }

  /**
   * 멀티 파일을 하나의 자료로 합쳐 등록.
   *
   * 흐름:
   *   1) 모든 파일을 Storage에 PUT (upload-url + PUT N번)
   *   2) /api/materials/finalize-merged 한 번 호출 (sources 배열)
   *   3) 서버가 다운로드·merge·잡 큐잉까지 처리
   *
   * 진행 UI는 "N개 중 K번째 올리는 중" + 마지막에 "합치는 중…".
   * 실패 시: 서버가 "incompatible" 반환하면 자동으로 separate 폴백 호출.
   */
  async function uploadMerged(files: File[], type: MaterialType, note: string): Promise<void> {
    setPhase("uploading");
    setErrorMsg(null);
    setUploaded([]);
    setFailed([]);
    setTotalCount(files.length);

    const sources: Array<{
      storagePath: string;
      filename: string;
      mimeType: string;
      materialId: string;
    }> = [];
    const optimisticIds: string[] = [];

    // 1) 각 파일 Storage PUT
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setCurrentIndex(i + 1);
      setCurrentName(file.name);
      try {
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
          throw new Error(
            (urlBody && urlBody.ok === false && urlBody.error) ||
              `URL 발급 실패 (HTTP ${urlRes.status})`,
          );
        }
        const putRes = await fetch(urlBody.signedUrl, {
          method: "PUT",
          headers: {
            "content-type": file.type || "application/octet-stream",
            "x-upsert": "false",
          },
          body: file,
        });
        if (!putRes.ok) throw new Error(`파일 업로드 실패 (HTTP ${putRes.status})`);

        sources.push({
          storagePath: urlBody.storagePath,
          filename: file.name,
          mimeType: file.type || guessMimeFromName(file.name),
          materialId: urlBody.materialId,
        });
      } catch (e) {
        // 한 파일이라도 PUT 실패하면 merge 불가 — 전체 fail
        setErrorMsg(
          `${file.name} 업로드 실패: ${e instanceof Error ? e.message : "알 수 없는 오류"}`,
        );
        setPhase("error");
        return;
      }
    }

    if (sources.length < 2) {
      setErrorMsg("합치려면 2개 이상 파일이 필요해요");
      setPhase("error");
      return;
    }

    // 2) primary = 첫 파일. dock에 합쳐진 자료 하나로 표시.
    const primary = sources[0];
    const optimisticId = `optimistic-${primary.materialId}`;
    optimisticIds.push(optimisticId);
    addOptimisticJob({
      id: optimisticId,
      tool: "upload",
      toolLabel: "합치는 중",
      status: "running",
      materialId: primary.materialId,
      materialTitle: `${primary.filename} 외 ${sources.length - 1}개`,
      courseId,
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
    });

    setCurrentIndex(files.length);
    setCurrentName(`${files.length}개 파일 합치는 중…`);

    // 3) finalize-merged 호출
    const mergeRes = await fetch("/api/materials/finalize-merged", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        materialId: primary.materialId,
        sources: sources.map((s) => ({
          storagePath: s.storagePath,
          filename: s.filename,
          mimeType: s.mimeType,
        })),
        courseId,
        type,
        intentNote: note || undefined,
      }),
    });
    const mergeBody = (await mergeRes.json().catch(() => null)) as
      | { ok: true; materialId: string; mergeMode: "pdf" | "text-concat"; mergedCount: number }
      | { ok: false; error: string; reason?: string }
      | null;

    if (!mergeRes.ok || !mergeBody || mergeBody.ok === false) {
      for (const id of optimisticIds) removeOptimisticJob(id);

      // 서버가 "형식 섞임"으로 거부하면 → separate 폴백 자동 호출 (이미 업로드된 파일들로)
      if (mergeBody && "reason" in mergeBody && mergeBody.reason === "incompatible") {
        setErrorMsg(null);
        await fallbackToSeparate(sources, type, note);
        return;
      }

      setErrorMsg(
        (mergeBody && mergeBody.ok === false && mergeBody.error) ||
          `합치기 실패 (HTTP ${mergeRes.status})`,
      );
      setPhase("error");
      return;
    }

    pingActiveJobs();
    pingSidebarCourses();
    setUploaded([
      {
        filename: `${primary.filename} 외 ${sources.length - 1}개`,
        materialId: mergeBody.materialId,
      },
    ]);
    setFailed([]);
    setPhase("done");
  }

  /**
   * 형식 섞임으로 merge 실패한 경우 — 이미 Storage에 PUT된 파일들로 각각 자료 등록 폴백.
   * 사용자가 모든 파일을 다시 업로드할 필요 없음.
   */
  async function fallbackToSeparate(
    sources: Array<{ storagePath: string; filename: string; mimeType: string; materialId: string }>,
    type: MaterialType,
    note: string,
  ) {
    const okList: UploadedItem[] = [];
    const failList: FailedItem[] = [];

    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      setCurrentIndex(i + 1);
      setCurrentName(s.filename);
      try {
        const optimisticId = `optimistic-${s.materialId}`;
        addOptimisticJob({
          id: optimisticId,
          tool: "upload",
          toolLabel: "올리는 중",
          status: "running",
          materialId: s.materialId,
          materialTitle: s.filename,
          courseId,
          createdAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
        });
        const finRes = await fetch("/api/materials/finalize", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            storagePath: s.storagePath,
            filename: s.filename,
            mimeType: s.mimeType,
            materialId: s.materialId,
            courseId,
            type,
            intentNote: note || undefined,
          }),
        });
        const finBody = (await finRes.json().catch(() => null)) as
          | { ok: true; materialId: string }
          | { ok: false; error: string }
          | null;
        if (!finRes.ok || !finBody || finBody.ok === false) {
          removeOptimisticJob(optimisticId);
          throw new Error(
            (finBody && finBody.ok === false && finBody.error) ||
              `finalize 실패 (HTTP ${finRes.status})`,
          );
        }
        okList.push({ filename: s.filename, materialId: finBody.materialId });
      } catch (e) {
        failList.push({
          filename: s.filename,
          reason: e instanceof Error ? e.message : "알 수 없는 오류",
        });
      }
    }

    setUploaded(okList);
    setFailed(failList);
    setErrorMsg("형식이 섞여서 합칠 수 없었어요. 각각 자료로 등록했어요.");
    if (okList.length > 0) {
      pingActiveJobs();
      pingSidebarCourses();
      setPhase("done");
    } else {
      setPhase("error");
    }
  }

  /**
   * N개 파일 순차 업로드. 한 파일 실패해도 나머지 진행.
   * 한 파일이라도 성공하면 phase="done". 전부 실패면 phase="error".
   */
  async function uploadAll(files: File[], type: MaterialType, note: string) {
    setPhase("uploading");
    setErrorMsg(null);
    setUploaded([]);
    setFailed([]);
    setTotalCount(files.length);

    const okList: UploadedItem[] = [];
    const failList: FailedItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setCurrentIndex(i + 1);
      setCurrentName(file.name);
      try {
        const materialId = await uploadOne(file, type, note);
        okList.push({ filename: file.name, materialId });
      } catch (e) {
        failList.push({
          filename: file.name,
          reason: e instanceof Error ? e.message : "알 수 없는 오류",
        });
      }
    }

    setUploaded(okList);
    setFailed(failList);

    // dock·sidebar 최종 갱신 (한 파일이라도 성공했으면)
    if (okList.length > 0) {
      pingActiveJobs();
      pingSidebarCourses();
    }

    if (okList.length === 0) {
      setErrorMsg(failList[0]?.reason ?? "모두 실패했어요");
      setPhase("error");
    } else {
      setPhase("done");
    }
  }

  const busy = phase === "uploading";

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
    const dropped = Array.from(e.dataTransfer.files ?? []);
    if (dropped.length > 0) askTypeThenUpload(dropped);
  }

  // 파일 선택 직후 자료 종류를 먼저 묻는다 — N개 파일 모두 같은 종류로 일괄 적용.
  // 2개 이상이면 모드 선택지도 같이 등장 (기본 "각각 등록").
  function askTypeThenUpload(files: File[]) {
    setPickedType("lecture");
    setMergeMode("separate");
    setIntentNote("");
    setPendingFiles(files);
  }

  function confirmType() {
    if (pendingFiles.length === 0) return;
    const files = pendingFiles;
    const type = pickedType;
    const mode = mergeMode;
    const note = intentNote.trim();
    setPendingFiles([]);
    if (files.length > 1 && mode === "merge") {
      void uploadMerged(files, type, note);
    } else {
      void uploadAll(files, type, note);
    }
  }

  function cancelType() {
    setPendingFiles([]);
    setIntentNote("");
    if (inputRef.current) inputRef.current.value = "";
  }

  function resetForNextUpload() {
    setPhase("idle");
    setCurrentName(null);
    setCurrentIndex(0);
    setTotalCount(0);
    setUploaded([]);
    setFailed([]);
    setErrorMsg(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  // 모달 안내 — 1개면 "이 자료", N개면 "N개 자료"
  const modalTitle =
    pendingFiles.length === 1 ? "이 자료의 종류는?" : `자료 ${pendingFiles.length}개 종류는?`;
  const modalDescription =
    pendingFiles.length === 1
      ? pendingFiles[0]?.name
      : `${pendingFiles[0]?.name} 외 ${pendingFiles.length - 1}개`;

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
          multiple
          accept=".pdf,.hwp,.hwpx,.pptx,.docx,.txt,.md"
          disabled={busy}
          className="sr-only"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            if (picked.length > 0) askTypeThenUpload(picked);
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
              {currentName}
            </p>
            <p
              className="mt-1.5 text-[13px] wght-450 text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.022em" }}
            >
              {totalCount > 1 ? `${totalCount}개 중 ${currentIndex}번째 올리는 중…` : "올리는 중…"}
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
              {uploaded.length === 1 ? uploaded[0].filename : `자료 ${uploaded.length}개 올렸어요`}
              {failed.length > 0 && (
                <span className="ml-1.5 text-[12px] wght-450 text-[var(--color-urgent)]">
                  · {failed.length}개 실패
                </span>
              )}
            </p>
            <p
              className="mt-1.5 max-w-[420px] text-[13px] wght-450 text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.022em" }}
            >
              {uploaded.length === 1
                ? "분석을 시작했어요. 끝나면 자료에서 요약·문제를 확인할 수 있어요."
                : `${uploaded.length}개 자료 분석이 동시에 시작됐어요. 끝나는 대로 자료 페이지에서 확인할 수 있어요.`}
            </p>
            {failed.length > 0 && (
              <ul className="mx-auto mt-3 max-w-[420px] space-y-1 text-left text-[11.5px] wght-450 text-[var(--color-urgent)]">
                {failed.slice(0, 4).map((f) => (
                  <li key={f.filename} className="truncate">
                    · {f.filename} — {f.reason}
                  </li>
                ))}
                {failed.length > 4 && <li>· 외 {failed.length - 4}개 더</li>}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {uploaded.length === 1 ? (
                <Link
                  href={`/dashboard/study/${encodeURIComponent(courseName)}/${uploaded[0].materialId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded-[8px] border border-[var(--color-apple-hairline)] bg-white px-3 py-1.5 text-[12px] wght-560 text-[var(--color-apple-ink)] hover:border-[var(--color-apple-action)] hover:text-[var(--color-apple-action)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  자료 보기 →
                </Link>
              ) : (
                <Link
                  href={`/dashboard/study/${encodeURIComponent(courseName)}`}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded-[8px] border border-[var(--color-apple-hairline)] bg-white px-3 py-1.5 text-[12px] wght-560 text-[var(--color-apple-ink)] hover:border-[var(--color-apple-action)] hover:text-[var(--color-apple-action)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  강의로 돌아가기 →
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
              업로드 실패
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
              여러 개 한 번에 OK · PDF · HWPX · PPTX · DOCX · TXT · MD
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
        open={pendingFiles.length > 0}
        onClose={cancelType}
        title={modalTitle}
        description={modalDescription}
        size="sm"
      >
        <div>
          <p
            className="text-[12.5px] wght-450 leading-[1.6] text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.022em" }}
          >
            {pendingFiles.length > 1
              ? `${pendingFiles.length}개 자료 모두 같은 종류로 등록돼요. 기출문제로 표시하면 자료에 실린 문제·정답·해설을 그대로 추출해요. 기본은 강의자료예요.`
              : "기출문제로 표시하면 자료에 실린 문제·정답·해설을 그대로 추출해 풀이할 수 있어요. 기본은 강의자료예요."}
          </p>

          {pendingFiles.length > 1 && (
            <ul className="mt-3 space-y-0.5 text-[11.5px] wght-450 text-[var(--color-apple-muted)]/85">
              {pendingFiles.slice(0, 5).map((f, i) => (
                <li key={`${f.name}-${i}`} className="truncate">
                  · {f.name}
                </li>
              ))}
              {pendingFiles.length > 5 && <li>· 외 {pendingFiles.length - 5}개 더</li>}
            </ul>
          )}

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

          {pendingFiles.length > 1 &&
            (() => {
              const compat = detectCompatibility(pendingFiles);
              const canMerge = compat !== "incompatible";
              const mergeHint =
                compat === "pdf"
                  ? "PDF 페이지가 순서대로 이어진 1개 자료로 합쳐져요."
                  : compat === "text-concat"
                    ? "본문 텍스트가 파일별 헤더와 함께 합쳐져요."
                    : "PDF와 다른 형식은 한 자료로 합칠 수 없어요. '각각 등록'만 가능해요.";
              return (
                <div className="mt-6">
                  <h4
                    className="text-[11px] wght-700 tabular-nums uppercase text-[var(--color-apple-muted)]"
                    style={{ letterSpacing: "0.04em" }}
                  >
                    등록 방식
                  </h4>
                  <ul className="mt-2.5 -mx-1 flex flex-wrap gap-x-1 gap-y-2">
                    {[
                      {
                        value: "separate" as const,
                        label: "각각 자료로",
                        subtitle: `${pendingFiles.length}개 분리`,
                        disabled: false,
                      },
                      {
                        value: "merge" as const,
                        label: "하나로 합치기",
                        subtitle: compat === "pdf" ? "PDF 페이지 이어붙임" : "본문 텍스트 합침",
                        disabled: !canMerge,
                      },
                    ].map(({ value, label, subtitle, disabled }) => {
                      const active = mergeMode === value && !disabled;
                      return (
                        <li key={value}>
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => {
                              if (!disabled) setMergeMode(value);
                            }}
                            aria-pressed={active}
                            className={cn(
                              "inline-flex items-baseline gap-1.5 rounded-full px-3.5 py-2 text-[13px] transition-colors",
                              disabled
                                ? "wght-450 cursor-not-allowed text-[var(--color-apple-muted)]/45"
                                : active
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
                  <p
                    className="mt-2 text-[11px] wght-450 leading-[1.5] text-[var(--color-apple-muted)]"
                    style={{ letterSpacing: "-0.012em" }}
                  >
                    {mergeMode === "merge" && canMerge
                      ? mergeHint
                      : `${pendingFiles.length}개 파일이 각각 별도 자료로 등록돼요.`}
                    {!canMerge && (
                      <span className="ml-1 text-[var(--color-urgent)]">{mergeHint}</span>
                    )}
                  </p>
                </div>
              );
            })()}

          {/* 첫 요약 한 줄 요청 — 자료 안에서 어디를 강조할지. 자료 밖 생성은 서버 가드가 거부.
              비워두면 일반 요약(기존 동작). 120자 cap은 input + 서버 양쪽. */}
          <div className="mt-6">
            <h4
              className="text-[11px] wght-700 tabular-nums uppercase text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "0.04em" }}
            >
              요약 요청 <span className="wght-450 normal-case opacity-70">(선택)</span>
            </h4>
            <input
              type="text"
              value={intentNote}
              onChange={(e) => setIntentNote(e.target.value.slice(0, 120))}
              placeholder="원하시는 방향에 맞게 요청해주세요 — 예: 시험 직전 정리, 예문은 영어 그대로"
              className="mt-2.5 w-full rounded-full border border-[var(--color-apple-hairline)] bg-white px-4 py-2 text-[13px] wght-450 text-[var(--color-apple-ink)] outline-none focus:border-[var(--color-apple-action)] placeholder:text-[var(--color-apple-muted)]/55"
              style={{ letterSpacing: "-0.012em" }}
            />
            <p
              className="mt-2 text-[11px] wght-450 leading-[1.5] text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              비워두면 일반 요약으로 진행해요. 자료 안에서 강조할 지점만 적어주세요.
            </p>
          </div>

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
              {pendingFiles.length > 1
                ? mergeMode === "merge" && detectCompatibility(pendingFiles) !== "incompatible"
                  ? `${pendingFiles.length}개 합치기`
                  : `${pendingFiles.length}개 올리기`
                : "올리기"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
