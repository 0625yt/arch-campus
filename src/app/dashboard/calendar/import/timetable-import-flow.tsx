"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Phase = "upload" | "extracting" | "review" | "saving" | "done";

type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

interface Slot {
  weekday: Weekday;
  startTime: string;
  endTime: string;
}

interface Course {
  name: string;
  professor?: string | null;
  location?: string | null;
  slots: Slot[];
  credits?: number | null;
}

interface ExtractedResponse {
  ok: true;
  materialId: string;
  termYear: number | null;
  termLabel: string | null;
  courses: Course[];
  parser: string;
  pageCount?: number;
  usage: { costUsd: number };
}

interface ApiErr {
  ok: false;
  error: string;
}

const WEEKDAY_KO: Record<Weekday, string> = {
  MON: "월",
  TUE: "화",
  WED: "수",
  THU: "목",
  FRI: "금",
  SAT: "토",
  SUN: "일",
};

const WEEKDAY_ORDER: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export function TimetableImportFlow() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedResponse | null>(null);
  const [keepIds, setKeepIds] = useState<Set<number>>(new Set());

  async function handleUpload() {
    if (!file) return;
    setPhase("extracting");
    setError(null);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/timetable", { method: "POST", body: form });
      const json = (await res.json()) as ExtractedResponse | ApiErr;
      if (!res.ok || !json.ok) {
        setError(("error" in json && json.error) || "시간표 분석 실패");
        setPhase("upload");
        return;
      }
      setExtracted(json);
      setKeepIds(new Set(json.courses.map((_, i) => i)));
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
      setPhase("upload");
    }
  }

  const [savedSummary, setSavedSummary] = useState<{
    courses: number;
    events: number;
  } | null>(null);

  async function handleConfirm() {
    if (!extracted) return;
    setPhase("saving");
    setError(null);

    const courses = extracted.courses.filter((_, i) => keepIds.has(i));
    try {
      const res = await fetch("/api/timetable/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceMaterialId: extracted.materialId,
          termYear: extracted.termYear,
          termLabel: extracted.termLabel,
          courses,
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        insertedCourses?: number;
        insertedEvents?: number;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "강의 등록 실패");
        setPhase("review");
        return;
      }
      setSavedSummary({
        courses: json.insertedCourses ?? courses.length,
        events: json.insertedEvents ?? 0,
      });
      setPhase("done");
      // 일정 페이지로 보내서 사용자가 실제로 박힌 수업을 본다 (예전엔 study로 갔는데
      // "시간표가 안 들어갔다"는 인상을 줌). prefetch + replace로 뒤로가기 깔끔.
      router.prefetch("/dashboard/calendar");
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
      setPhase("review");
    }
  }

  function toggleKeep(idx: number) {
    setKeepIds((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  return (
    <>
      {error && <ErrorBanner message={error} />}

      {(phase === "upload" || phase === "extracting") && (
        <UploadCard
          file={file}
          setFile={setFile}
          extracting={phase === "extracting"}
          onSubmit={handleUpload}
        />
      )}

      {phase === "review" && extracted && (
        <ReviewSection
          extracted={extracted}
          keepIds={keepIds}
          onToggle={toggleKeep}
          onConfirm={handleConfirm}
        />
      )}

      {phase === "saving" && (
        <div className="mt-10 rounded-[18px] bg-white p-10 text-center fade-up fade-up-3">
          <p
            className="text-[16px] wght-560 text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            강의를 등록하고 있어요…
          </p>
        </div>
      )}

      {phase === "done" && (
        <div
          className="relative mt-10 overflow-hidden rounded-[18px] bg-white p-10 text-center fade-up fade-up-3 sm:p-14"
          style={{
            backgroundImage:
              "radial-gradient(640px 320px at 50% 0%, rgba(52,199,89,0.10), transparent 70%), radial-gradient(420px 220px at 100% 100%, rgba(122,166,214,0.06), transparent 70%)",
          }}
        >
          <span
            aria-hidden
            className="relative mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-apple-success)] text-[20px] wght-700 text-white"
          >
            ✓
          </span>
          <p
            className="relative mt-5 text-[20px] wght-620 text-[var(--color-apple-ink)] sm:text-[24px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            강의 등록 완료.
          </p>
          {savedSummary && (
            <p
              className="relative mt-2 text-[13.5px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.022em" }}
            >
              {savedSummary.courses}과목 · 매주 반복 일정{" "}
              <span className="wght-620 text-[var(--color-apple-ink)]">
                {savedSummary.events}개
              </span>{" "}
              자동 생성됨
            </p>
          )}
          <div className="relative mt-6 flex flex-wrap items-center justify-center gap-2">
            <Link
              href="/dashboard/calendar"
              className="inline-flex h-[44px] items-center rounded-full bg-[var(--color-apple-action)] px-6 text-[14px] wght-560 text-white transition-all hover:bg-[var(--color-apple-action-hover)] active:scale-[0.97]"
              style={{ letterSpacing: "-0.012em" }}
            >
              캘린더에서 확인하기 →
            </Link>
            <Link
              href="/dashboard/study"
              className="inline-flex h-[44px] items-center rounded-full bg-[var(--color-apple-pearl)] px-5 text-[13px] wght-560 text-[var(--color-apple-ink)] transition-colors hover:bg-[var(--color-apple-hairline)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              과목 폴더 보기
            </Link>
          </div>
        </div>
      )}
    </>
  );
}

/* ─────────── 업로드 카드 ─────────── */

function UploadCard({
  file,
  setFile,
  extracting,
  onSubmit,
}: {
  file: File | null;
  setFile: (f: File | null) => void;
  extracting: boolean;
  onSubmit: () => void;
}) {
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  }

  return (
    <section className="mt-10 fade-up fade-up-3 sm:mt-12">
      <div
        className="relative overflow-hidden rounded-[18px] bg-white p-7 sm:p-10"
        style={{
          backgroundImage:
            "radial-gradient(560px 220px at 0% 0%, rgba(0,113,227,0.05), transparent 70%), radial-gradient(420px 220px at 100% 100%, rgba(160,139,196,0.06), transparent 70%)",
        }}
      >
        <h2
          className="relative text-[20px] wght-620 text-[var(--color-apple-ink)] sm:text-[22px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          학교 포털 시간표를 올려주세요
        </h2>
        <p
          className="relative mt-3 text-[14px] leading-[1.6] wght-450 text-[var(--color-apple-muted)] sm:text-[15px]"
          style={{ letterSpacing: "-0.022em" }}
        >
          한 학기에 듣는 강의가 한 번에 등록돼요. 요일·교시·강의실·교수까지 자동으로 잡아드려요.
          시험·과제 일정은 강의계획서에서 따로 추가하실 수 있어요.
        </p>

        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="group relative mt-7 flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-[14px] border border-dashed border-[var(--color-apple-hairline)] bg-[var(--color-apple-pearl)] px-6 py-10 transition-colors hover:border-[var(--color-apple-action)]"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{
              background:
                "radial-gradient(360px 180px at 50% 50%, rgba(0,113,227,0.08), transparent 70%)",
            }}
          />
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.xls,.hwp,.hwpx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="sr-only"
            disabled={extracting}
          />
          {file ? (
            <div className="relative flex flex-col items-center gap-1">
              <span
                className="text-[15px] wght-560 text-[var(--color-apple-ink)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                {file.name}
              </span>
              <span className="text-[12px] wght-450 tabular-nums text-[var(--color-apple-muted)]">
                {formatSize(file.size)} · 다른 파일을 끌어다 놓으면 교체돼요
              </span>
            </div>
          ) : (
            <div className="relative flex flex-col items-center gap-1.5">
              <span
                className="text-[15px] wght-560 text-[var(--color-apple-ink)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                여기에 끌어다 놓거나 클릭해서 선택
              </span>
              <span className="text-[12px] wght-450 text-[var(--color-apple-muted)]">
                PDF · 사진 · Excel · HWP · DOCX
              </span>
            </div>
          )}
        </label>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onSubmit}
            disabled={!file || extracting}
            className="inline-flex h-[48px] items-center rounded-full bg-[var(--color-apple-action)] px-7 text-[15px] wght-560 text-white transition-all hover:bg-[var(--color-apple-action-hover)] active:scale-[0.97] disabled:opacity-50"
            style={{ letterSpacing: "-0.012em" }}
          >
            {extracting ? "분석하고 있어요…" : "시간표 분석하기"}
            {!extracting && <span className="ml-1.5">→</span>}
          </button>
          {extracting && (
            <span className="text-[12.5px] wght-450 text-[var(--color-apple-muted)]">
              보통 10~25초 정도 걸려요
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

/* ─────────── 검토 ─────────── */

function ReviewSection({
  extracted,
  keepIds,
  onToggle,
  onConfirm,
}: {
  extracted: ExtractedResponse;
  keepIds: Set<number>;
  onToggle: (idx: number) => void;
  onConfirm: () => void;
}) {
  return (
    <div className="mt-10 fade-up fade-up-3 sm:mt-12">
      {/* 학기 헤더 */}
      <section
        className="relative overflow-hidden rounded-[18px] bg-white p-7 sm:p-9"
        style={{
          backgroundImage:
            "radial-gradient(640px 260px at 100% 0%, rgba(122,166,214,0.10), transparent 70%), radial-gradient(420px 200px at 0% 100%, rgba(255,179,138,0.06), transparent 70%)",
        }}
      >
        <p className="relative text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
          학기
        </p>
        <h3
          className="relative mt-2 text-[26px] wght-620 text-[var(--color-apple-ink)] sm:text-[30px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {extracted.termLabel ?? `${extracted.termYear ?? ""} 학기`}
        </h3>
        <p className="relative mt-2 text-[12.5px] wght-450 text-[var(--color-apple-muted)]">
          강의 {extracted.courses.length}개 추출됨 · ${extracted.usage.costUsd.toFixed(4)}
        </p>
      </section>

      <section className="mt-8">
        <div className="flex items-baseline justify-between gap-3">
          <h2
            className="text-[22px] wght-620 text-[var(--color-apple-ink)] sm:text-[24px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            추출된 강의.
          </h2>
          <span className="text-[12px] wght-450 tabular-nums text-[var(--color-apple-muted)]">
            {keepIds.size}/{extracted.courses.length} 선택됨
          </span>
        </div>
        <p className="mt-3 text-[13.5px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]">
          잘못 뽑힌 건 체크 풀고 등록할 것만 골라주세요.
        </p>

        {extracted.courses.length === 0 ? (
          <div className="mt-7 rounded-[18px] bg-white px-7 py-12 text-center sm:py-16">
            <p
              className="text-[16px] wght-620 text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              본문에서 강의를 못 찾았어요
            </p>
            <p className="mt-2 text-[13px] wght-450 text-[var(--color-apple-muted)]">
              학교 포털에서 출력한 시간표 PDF·이미지가 맞나요? 다른 파일을 올려주세요.
            </p>
          </div>
        ) : (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {extracted.courses.map((course, idx) => (
              <li key={idx}>
                <CourseRow
                  course={course}
                  kept={keepIds.has(idx)}
                  onToggle={() => onToggle(idx)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="sticky bottom-4 mt-10 flex gap-3 sm:bottom-6">
        <Link
          href="/dashboard/calendar"
          className="inline-flex h-[48px] flex-1 items-center justify-center rounded-full bg-white px-6 text-[14px] wght-560 text-[var(--color-apple-ink)] transition-colors hover:bg-[var(--color-apple-pearl)]"
        >
          취소
        </Link>
        <button
          type="button"
          onClick={onConfirm}
          disabled={keepIds.size === 0}
          className="inline-flex h-[48px] flex-[2] items-center justify-center gap-1.5 rounded-full bg-[var(--color-apple-ink)] px-6 text-[15px] wght-560 text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {keepIds.size === 0 ? "등록할 강의를 골라주세요" : `${keepIds.size}개 강의 등록`}
          {keepIds.size > 0 && <span>→</span>}
        </button>
      </div>
    </div>
  );
}

function CourseRow({
  course,
  kept,
  onToggle,
}: {
  course: Course;
  kept: boolean;
  onToggle: () => void;
}) {
  const sortedSlots = [...course.slots].sort((a, b) => {
    const dayDiff = WEEKDAY_ORDER.indexOf(a.weekday) - WEEKDAY_ORDER.indexOf(b.weekday);
    if (dayDiff !== 0) return dayDiff;
    return a.startTime.localeCompare(b.startTime);
  });

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={kept}
      className={`flex w-full flex-col gap-3 rounded-[14px] border bg-white p-5 text-left transition-colors sm:p-6 ${
        kept
          ? "border-[var(--color-apple-action)]"
          : "border-[var(--color-apple-hairline)] opacity-60"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3
          className="text-[16px] wght-620 text-[var(--color-apple-ink)] sm:text-[17px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {course.name}
        </h3>
        <span
          aria-hidden
          className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] wght-700 transition-colors ${
            kept
              ? "border-[var(--color-apple-action)] bg-[var(--color-apple-action)] text-white"
              : "border-[var(--color-apple-hairline)] bg-white text-transparent"
          }`}
        >
          ✓
        </span>
      </div>

      <ul className="flex flex-wrap gap-1.5">
        {sortedSlots.map((s, i) => (
          <li
            key={i}
            className="rounded-full bg-[var(--color-apple-pearl)] px-2.5 py-1 text-[11.5px] wght-560 tabular-nums text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {WEEKDAY_KO[s.weekday]} {s.startTime}–{s.endTime}
          </li>
        ))}
        {sortedSlots.length === 0 && (
          <li className="text-[11.5px] wght-450 text-[var(--color-apple-muted)]">
            강의시간 미배정
          </li>
        )}
      </ul>

      {(course.professor || course.location) && (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px] wght-450 text-[var(--color-apple-muted)]">
          {course.professor && <span>{course.professor}</span>}
          {course.professor && course.location && (
            <span className="text-[var(--color-apple-hairline)]">·</span>
          )}
          {course.location && <span>{course.location}</span>}
        </div>
      )}
    </button>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mt-6 fade-up rounded-[14px] bg-[var(--color-urgent-soft)] px-5 py-4 text-[13px] wght-560 text-[var(--color-urgent)]">
      {message}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
