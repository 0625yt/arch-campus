"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type Phase = "upload" | "extracting" | "review" | "saving" | "done";

type Kind = "exam" | "assignment" | "presentation" | "class" | "etc";

interface ExtractedCourse {
  name: string;
  professor?: string | null;
  location?: string | null;
  schedule?: string[];
  termStart?: string | null;
  termEnd?: string | null;
}

interface ExtractedEvent {
  kind: Kind;
  title: string;
  notes?: string | null;
  startsAt: string;
  endsAt?: string | null;
  allDay: boolean;
  weightPercent?: number | null;
  confidence: number;
}

interface ExtractedResponse {
  ok: true;
  materialId: string;
  courseId: string;
  course: ExtractedCourse;
  events: ExtractedEvent[];
  parser: string;
  pageCount?: number;
  usage: { costUsd: number };
}

interface ApiErr {
  ok: false;
  error: string;
}

const KIND_LABEL: Record<Kind, string> = {
  exam: "시험",
  assignment: "과제",
  presentation: "발표",
  class: "수업",
  etc: "기타",
};

const KIND_TONE: Record<Kind, string> = {
  exam: "var(--color-urgent)",
  assignment: "var(--color-apple-action)",
  presentation: "#a08bc4",
  class: "#7aa6d6",
  etc: "var(--color-apple-muted)",
};

export function SyllabusImportFlow() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<ExtractedResponse | null>(null);
  const [editing, setEditing] = useState<ExtractedEvent[]>([]);
  const [keepIds, setKeepIds] = useState<Set<number>>(new Set());

  async function handleUpload() {
    if (!file) return;
    setPhase("extracting");
    setError(null);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/syllabus", { method: "POST", body: form });
      const json = (await res.json()) as ExtractedResponse | ApiErr;
      if (!res.ok || !json.ok) {
        setError(("error" in json && json.error) || "강의계획서 파싱 실패");
        setPhase("upload");
        return;
      }
      setExtracted(json);
      setEditing(json.events);
      setKeepIds(new Set(json.events.map((_, i) => i)));
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
      setPhase("upload");
    }
  }

  async function handleConfirm() {
    if (!extracted) return;
    setPhase("saving");
    setError(null);

    const eventsToSave = editing.filter((_, i) => keepIds.has(i));
    try {
      const res = await fetch("/api/syllabus/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          courseId: extracted.courseId,
          sourceMaterialId: extracted.materialId,
          events: eventsToSave,
        }),
      });
      const json = (await res.json()) as { ok: boolean; inserted?: number; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "일정 저장 실패");
        setPhase("review");
        return;
      }
      setPhase("done");
      setTimeout(() => router.push("/dashboard/calendar"), 1200);
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

  function updateEvent(idx: number, patch: Partial<ExtractedEvent>) {
    setEditing((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }

  return (
    <>
      <ProgressBar phase={phase} />

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
          editing={editing}
          keepIds={keepIds}
          onToggle={toggleKeep}
          onUpdate={updateEvent}
          onConfirm={handleConfirm}
        />
      )}

      {phase === "saving" && <SavingCard />}
      {phase === "done" && <DoneCard />}
    </>
  );
}

/* ─────────── 단계 표시 ─────────── */

function ProgressBar({ phase }: { phase: Phase }) {
  const steps = [
    { id: "upload", label: "파일 올리기" },
    { id: "review", label: "일정 검토" },
    { id: "done", label: "캘린더 등록" },
  ] as const;

  const currentIdx =
    phase === "upload" || phase === "extracting"
      ? 0
      : phase === "review"
        ? 1
        : 2;

  return (
    <div className="mt-10 fade-up fade-up-2 sm:mt-12">
      <ol className="flex items-center gap-3">
        {steps.map((s, idx) => {
          const active = idx === currentIdx;
          const done = idx < currentIdx;
          return (
            <li key={s.id} className="flex flex-1 items-center gap-2">
              <span
                className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] wght-700 tabular-nums transition-colors ${
                  active
                    ? "bg-[var(--color-apple-ink)] text-white"
                    : done
                      ? "bg-[var(--color-apple-action)] text-white"
                      : "bg-white text-[var(--color-apple-muted)]"
                }`}
              >
                {done ? "✓" : idx + 1}
              </span>
              <span
                className={`text-[12.5px] wght-560 ${
                  active
                    ? "text-[var(--color-apple-ink)]"
                    : done
                      ? "text-[var(--color-apple-muted)]"
                      : "text-[var(--color-apple-muted)]"
                }`}
                style={{ letterSpacing: "-0.012em" }}
              >
                {s.label}
              </span>
              {idx !== steps.length - 1 && (
                <span
                  aria-hidden
                  className={`ml-1 h-px flex-1 ${
                    done ? "bg-[var(--color-apple-action)]" : "bg-[var(--color-apple-hairline)]"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ─────────── 1단계: 업로드 카드 ─────────── */

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
          강의계획서 파일을 올려주세요
        </h2>
        <p
          className="mt-3 text-[14px] leading-[1.6] wght-450 text-[var(--color-apple-muted)] sm:text-[15px]"
          style={{ letterSpacing: "-0.022em" }}
        >
          PDF, HWP, HWPX, DOCX, 이미지 다 받아요. 본문에서 시험·과제·발표 일정을 자동으로 뽑아드려요.
          학기는 따로 입력할 필요 없어요.
        </p>

        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="group relative mt-7 flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-[14px] border border-dashed border-[var(--color-apple-hairline)] bg-[var(--color-apple-pearl)] px-6 py-10 transition-colors hover:border-[var(--color-apple-action)]"
        >
          {/* 호버 시 옅은 블루 글로우 — 중앙에서 퍼져나감 */}
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
            accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp,.hwp,.hwpx"
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
                PDF · HWP · DOCX · 이미지
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
            {extracting ? "분석하고 있어요…" : "강의계획서 분석하기"}
            {!extracting && <span className="ml-1.5">→</span>}
          </button>

          {extracting && (
            <span className="text-[12.5px] wght-450 text-[var(--color-apple-muted)]">
              보통 15~40초 정도 걸려요
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

/* ─────────── 2단계: 검토 ─────────── */

function ReviewSection({
  extracted,
  editing,
  keepIds,
  onToggle,
  onUpdate,
  onConfirm,
}: {
  extracted: ExtractedResponse;
  editing: ExtractedEvent[];
  keepIds: Set<number>;
  onToggle: (idx: number) => void;
  onUpdate: (idx: number, patch: Partial<ExtractedEvent>) => void;
  onConfirm: () => void;
}) {
  const grouped = useMemo(() => groupEventsByMonth(editing), [editing]);

  return (
    <div className="mt-10 fade-up fade-up-3 sm:mt-12">
      <CourseCard course={extracted.course} />

      <section className="mt-8">
        <div className="flex items-baseline justify-between gap-3">
          <h2
            className="text-[22px] wght-620 text-[var(--color-apple-ink)] sm:text-[24px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            추출된 일정.
          </h2>
          <span
            className="text-[12px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {keepIds.size}/{editing.length} 선택됨 · ${extracted.usage.costUsd.toFixed(4)}
          </span>
        </div>

        <p
          className="mt-3 text-[13.5px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.022em" }}
        >
          잘못 뽑힌 건 체크 풀고, 날짜·제목은 클릭해서 수정할 수 있어요.
        </p>

        {editing.length === 0 ? (
          <EmptyEvents />
        ) : (
          <div className="mt-7 flex flex-col gap-8">
            {grouped.map(({ month, events }) => (
              <div key={month}>
                <p
                  className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]"
                  style={{ letterSpacing: "0.06em" }}
                >
                  {month}
                </p>
                <ul className="mt-3 overflow-hidden rounded-[16px] bg-white">
                  {events.map(({ event, idx }, listIdx) => (
                    <li
                      key={idx}
                      className={
                        listIdx !== events.length - 1
                          ? "border-b border-[var(--color-apple-hairline-soft)]"
                          : ""
                      }
                    >
                      <EventRow
                        event={event}
                        kept={keepIds.has(idx)}
                        onToggle={() => onToggle(idx)}
                        onUpdate={(patch) => onUpdate(idx, patch)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <ActionFooter
        keepCount={keepIds.size}
        onConfirm={onConfirm}
      />
    </div>
  );
}

function CourseCard({ course }: { course: ExtractedCourse }) {
  const meta: { label: string; value: string }[] = [];
  if (course.professor) meta.push({ label: "교수", value: course.professor });
  if (course.location) meta.push({ label: "강의실", value: course.location });
  if (course.schedule && course.schedule.length > 0) {
    meta.push({ label: "강의시간", value: course.schedule.join(", ") });
  }
  if (course.termStart && course.termEnd) {
    meta.push({
      label: "학기",
      value: `${formatTermDate(course.termStart)} ~ ${formatTermDate(course.termEnd)}`,
    });
  }

  return (
    <section
      className="relative overflow-hidden rounded-[18px] bg-white p-7 sm:p-9"
      style={{
        backgroundImage:
          "radial-gradient(640px 260px at 100% 0%, rgba(122,166,214,0.10), transparent 70%), radial-gradient(420px 200px at 0% 100%, rgba(255,179,138,0.06), transparent 70%)",
      }}
    >
      <p className="relative text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
        과목
      </p>
      <h3
        className="relative mt-2 text-[26px] wght-620 text-[var(--color-apple-ink)] sm:text-[30px]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {course.name}.
      </h3>

      {meta.length > 0 && (
        <dl className="relative mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {meta.map((item) => (
            <div key={item.label} className="flex items-baseline gap-3">
              <dt className="w-16 shrink-0 text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
                {item.label}
              </dt>
              <dd
                className="text-[13.5px] wght-450 text-[var(--color-apple-ink)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function EventRow({
  event,
  kept,
  onToggle,
  onUpdate,
}: {
  event: ExtractedEvent;
  kept: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<ExtractedEvent>) => void;
}) {
  return (
    <div
      className={`grid grid-cols-[24px_72px_1fr_auto] items-baseline gap-x-4 gap-y-1.5 px-5 py-4 transition-colors sm:grid-cols-[24px_88px_1fr_auto] sm:px-7 sm:py-5 ${
        kept ? "bg-white" : "bg-[var(--color-apple-pearl)] opacity-60"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={kept ? "이 일정 빼기" : "이 일정 등록"}
        className={`mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] wght-700 transition-colors ${
          kept
            ? "border-[var(--color-apple-action)] bg-[var(--color-apple-action)] text-white"
            : "border-[var(--color-apple-hairline)] bg-white text-transparent"
        }`}
      >
        ✓
      </button>

      <input
        type="date"
        value={isoToDate(event.startsAt)}
        onChange={(e) => onUpdate({ startsAt: dateToIso(e.target.value, event.startsAt) })}
        disabled={!kept}
        className="self-start text-[13px] wght-560 tabular-nums text-[var(--color-apple-ink)] outline-none disabled:cursor-default"
        style={{ letterSpacing: "-0.012em" }}
      />

      <div className="min-w-0 flex flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline gap-2">
          <span
            className="text-[10.5px] wght-700 uppercase tracking-[0.06em]"
            style={{ color: KIND_TONE[event.kind] }}
          >
            {KIND_LABEL[event.kind]}
          </span>
          {event.weightPercent != null && (
            <span className="text-[10.5px] wght-450 tabular-nums text-[var(--color-apple-muted)]">
              비중 {event.weightPercent}%
            </span>
          )}
        </div>
        <input
          type="text"
          value={event.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          disabled={!kept}
          className="bg-transparent text-[14.5px] wght-560 text-[var(--color-apple-ink)] outline-none focus:bg-[var(--color-apple-pearl)] focus:px-2 focus:py-1 focus:rounded disabled:cursor-default"
          style={{ letterSpacing: "-0.012em" }}
        />
        {event.notes && (
          <p
            className="text-[12px] wght-450 leading-[1.5] text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.022em" }}
          >
            {event.notes}
          </p>
        )}
      </div>

      <div className="self-start">
        <ConfidenceBadge value={event.confidence} />
      </div>
    </div>
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  const tone =
    value >= 0.8 ? "high" : value >= 0.5 ? "mid" : "low";
  const cls =
    tone === "high"
      ? "text-[var(--color-apple-success)]"
      : tone === "mid"
        ? "text-[var(--color-apple-muted)]"
        : "text-[var(--color-urgent)]";
  const label = tone === "high" ? "확실" : tone === "mid" ? "확인 필요" : "추정";
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10.5px] wght-560 uppercase tracking-[0.06em] ${cls}`}
      style={{ letterSpacing: "0.06em" }}
    >
      <span aria-hidden className="tabular-nums">
        {Math.round(value * 100)}%
      </span>
      <span className="hidden sm:inline">·</span>
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}

function EmptyEvents() {
  return (
    <div className="mt-7 rounded-[18px] bg-white px-7 py-12 text-center sm:py-16">
      <p
        className="text-[16px] wght-620 text-[var(--color-apple-ink)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        본문에서 일정을 못 찾았어요
      </p>
      <p
        className="mt-2 text-[13px] wght-450 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.022em" }}
      >
        다른 강의계획서를 올려주시거나, 캘린더에서 직접 추가해 주세요.
      </p>
    </div>
  );
}

function ActionFooter({
  keepCount,
  onConfirm,
}: {
  keepCount: number;
  onConfirm: () => void;
}) {
  return (
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
        disabled={keepCount === 0}
        className="inline-flex h-[48px] flex-[2] items-center justify-center gap-1.5 rounded-full bg-[var(--color-apple-ink)] px-6 text-[15px] wght-560 text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {keepCount === 0 ? "등록할 일정을 골라주세요" : `${keepCount}개 일정 등록`}
        {keepCount > 0 && <span>→</span>}
      </button>
    </div>
  );
}

/* ─────────── 보조 카드 ─────────── */

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mt-6 fade-up rounded-[14px] bg-[var(--color-urgent-soft)] px-5 py-4 text-[13px] wght-560 text-[var(--color-urgent)]">
      {message}
    </div>
  );
}

function SavingCard() {
  return (
    <div className="mt-10 rounded-[18px] bg-white p-10 text-center fade-up fade-up-3">
      <p
        className="text-[16px] wght-560 text-[var(--color-apple-ink)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        일정을 캘린더에 박고 있어요…
      </p>
    </div>
  );
}

function DoneCard() {
  return (
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
        등록 완료.
      </p>
      <p
        className="relative mt-2 text-[13.5px] wght-450 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.022em" }}
      >
        잠시 후 캘린더로 이동해요.
      </p>
    </div>
  );
}

/* ─────────── 헬퍼 ─────────── */

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function isoToDate(iso: string): string {
  return iso.slice(0, 10);
}

function dateToIso(date: string, original: string): string {
  if (original.includes("T")) {
    return `${date}${original.slice(10)}`;
  }
  return date;
}

function formatTermDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function groupEventsByMonth(events: ExtractedEvent[]) {
  const map = new Map<string, { event: ExtractedEvent; idx: number }[]>();
  events.forEach((event, idx) => {
    const d = new Date(event.startsAt);
    const month = Number.isFinite(d.getTime())
      ? `${d.getFullYear()}년 ${d.getMonth() + 1}월`
      : "날짜 미상";
    const list = map.get(month) ?? [];
    list.push({ event, idx });
    map.set(month, list);
  });
  // 월 정렬
  return Array.from(map.entries())
    .sort(([a], [b]) => (a > b ? 1 : -1))
    .map(([month, events]) => ({ month, events }));
}
