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

interface UploadedItem {
  filename: string;
  materialId: string;
}

interface FailedItem {
  filename: string;
  reason: string;
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

  /**
   * 한 파일 업로드 — 성공이면 materialId 반환, 실패면 throw.
   * 호출자(uploadAll)가 try/catch로 한 파일 실패를 batch에 기록.
   */
  async function uploadOne(file: File, type: MaterialType): Promise<string> {
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
   * N개 파일 순차 업로드. 한 파일 실패해도 나머지 진행.
   * 한 파일이라도 성공하면 phase="done". 전부 실패면 phase="error".
   */
  async function uploadAll(files: File[], type: MaterialType) {
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
        const materialId = await uploadOne(file, type);
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
  function askTypeThenUpload(files: File[]) {
    setPickedType("lecture");
    setPendingFiles(files);
  }

  function confirmType() {
    if (pendingFiles.length === 0) return;
    const files = pendingFiles;
    const type = pickedType;
    setPendingFiles([]);
    void uploadAll(files, type);
  }

  function cancelType() {
    setPendingFiles([]);
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
              {totalCount > 1
                ? `${totalCount}개 중 ${currentIndex}번째 올리는 중…`
                : "올리는 중…"}
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
              {uploaded.length === 1
                ? uploaded[0].filename
                : `자료 ${uploaded.length}개 올렸어요`}
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
              {pendingFiles.length > 1 ? `${pendingFiles.length}개 올리기` : "올리기"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
