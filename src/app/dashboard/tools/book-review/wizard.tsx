"use client";

import { useState } from "react";
import { useJob } from "@/lib/hooks/use-job";
import type { BookReviewOutputT } from "@/lib/schemas";
import { cn } from "@/lib/utils";

type LengthHint = "short" | "medium" | "long";

interface DraftRequest {
  bookTitle: string;
  bookAuthor: string;
  notes: string[];
  feeling?: string;
  lengthHint: LengthHint;
}

const LENGTH_OPTIONS: { value: LengthHint; label: string; sub: string }[] = [
  { value: "short", label: "짧게", sub: "단락 4개 · 700자" },
  { value: "medium", label: "보통", sub: "단락 5~6개 · 900~1200자" },
  { value: "long", label: "길게", sub: "단락 7~8개 · 1200~1500자" },
];

export function BookReviewWizard() {
  const [bookTitle, setBookTitle] = useState("");
  const [bookAuthor, setBookAuthor] = useState("");
  const [feeling, setFeeling] = useState("");
  const [notes, setNotes] = useState<string[]>([""]);
  const [lengthHint, setLengthHint] = useState<LengthHint>("medium");

  const [jobId, setJobId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [output, setOutput] = useState<BookReviewOutputT | null>(null);

  const { job, loading, error: jobError } = useJob(jobId);

  // 작업 끝나면 결과 캐싱 — 다시 쓰기 후에도 이전 초안과 비교 가능
  if (job?.status === "done" && job.result && !output) {
    const out = (job.result as { output?: BookReviewOutputT }).output;
    if (out) setOutput(out);
  }

  const validNotes = notes.filter((n) => n.trim().length >= 5);
  const canSubmit = bookTitle.trim().length > 0 && validNotes.length > 0;

  async function onGenerate(req: DraftRequest, paraphraseFrom?: BookReviewOutputT, seed?: string) {
    setSubmitError(null);
    setJobId(null);
    if (paraphraseFrom) setOutput(null);

    try {
      const endpoint = paraphraseFrom
        ? "/api/wizards/book-review/paraphrase"
        : "/api/wizards/book-review";
      const body = paraphraseFrom ? { ...req, previous: paraphraseFrom, seed: seed ?? "" } : req;
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json()) as { ok: boolean; jobId?: string; error?: string };
      if (!j.ok || !j.jobId) {
        setSubmitError(j.error ?? "요청 실패");
        return;
      }
      setJobId(j.jobId);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onGenerate({
      bookTitle: bookTitle.trim(),
      bookAuthor: bookAuthor.trim(),
      notes: validNotes,
      feeling: feeling.trim() || undefined,
      lengthHint,
    });
  }

  function onParaphrase() {
    if (!output) return;
    onGenerate(
      {
        bookTitle: output.bookTitle,
        bookAuthor: output.bookAuthor,
        notes: validNotes,
        lengthHint,
      },
      output,
      output.paraphrasePromptSeed,
    );
  }

  function resetWizard() {
    setOutput(null);
    setJobId(null);
    setSubmitError(null);
  }

  // ─── 렌더 분기 ───────────────────────────────────────────────────
  const isRunning = loading || job?.status === "pending" || job?.status === "running";
  const hasError = submitError || jobError || job?.errorMessage;

  if (output) {
    return (
      <ResultView
        output={output}
        onParaphrase={onParaphrase}
        onReset={resetWizard}
        isParaphrasing={isRunning}
      />
    );
  }

  return (
    <form onSubmit={onSubmit} className="elev-1 rounded-[22px] bg-white px-5 py-6 sm:px-7 sm:py-8">
      {/* 1. 책 정보 */}
      <Section index={1} title="책 정보">
        <Field label="제목" required>
          <input
            type="text"
            value={bookTitle}
            onChange={(e) => setBookTitle(e.target.value.slice(0, 120))}
            placeholder="예: 멋진 신세계"
            className={fieldClass}
            maxLength={120}
            required
          />
        </Field>
        <Field label="저자" hint="선택">
          <input
            type="text"
            value={bookAuthor}
            onChange={(e) => setBookAuthor(e.target.value.slice(0, 80))}
            placeholder="예: 올더스 헉슬리"
            className={fieldClass}
            maxLength={80}
          />
        </Field>
      </Section>

      {/* 2. 본인 메모 — 사활 (Gauth 안 되게 본인 흔적 강제) */}
      <Section
        index={2}
        title="본인 메모"
        sub="이 책의 어느 문장이 마음에 남았어요? 메모·발췌·인상. 1개 이상."
      >
        <div className="space-y-2.5">
          {notes.map((note, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 사용자 입력 textarea라 안정 id 없음 + position이 의미
            <div key={i} className="flex items-start gap-2">
              <textarea
                value={note}
                onChange={(e) => {
                  const next = [...notes];
                  next[i] = e.target.value.slice(0, 600);
                  setNotes(next);
                }}
                rows={2}
                placeholder={
                  i === 0
                    ? '예: "행복한 사회는 슬픔을 모른다" — 정말 행복이 맞나 싶었다'
                    : "추가 메모"
                }
                className={cn(fieldClass, "resize-none")}
                maxLength={600}
              />
              {notes.length > 1 && (
                <button
                  type="button"
                  onClick={() => setNotes(notes.filter((_, idx) => idx !== i))}
                  className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-coral)]"
                  aria-label="메모 삭제"
                >
                  −
                </button>
              )}
            </div>
          ))}
          {notes.length < 8 && (
            <button
              type="button"
              onClick={() => setNotes([...notes, ""])}
              className="text-[12.5px] wght-560 text-[var(--color-apple-action)] hover:underline"
            >
              + 메모 추가
            </button>
          )}
        </div>
      </Section>

      {/* 3. 톤·분량 */}
      <Section index={3} title="톤·분량">
        <Field label="한 줄 느낌" hint="선택">
          <input
            type="text"
            value={feeling}
            onChange={(e) => setFeeling(e.target.value.slice(0, 200))}
            placeholder="예: 처음엔 디스토피아 같았는데 마지막엔 우리 일상 같았다"
            className={fieldClass}
            maxLength={200}
          />
        </Field>
        <Field label="분량">
          <div className="grid grid-cols-3 gap-2">
            {LENGTH_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setLengthHint(opt.value)}
                className={cn(
                  "rounded-[14px] border px-3 py-2.5 text-left transition-all",
                  lengthHint === opt.value
                    ? "wght-620 border-[var(--color-apple-ink)] bg-[var(--color-apple-pearl)] text-[var(--color-apple-ink)] shadow-[inset_0_0_0_1px_var(--color-apple-ink)]"
                    : "wght-450 border-[var(--color-apple-hairline)] bg-white text-[var(--color-apple-muted)] hover:border-[var(--color-apple-action)]/40 hover:text-[var(--color-apple-ink)]",
                )}
              >
                <div className="text-[13px]">{opt.label}</div>
                <div className="mt-0.5 text-[10.5px] wght-450 text-[var(--color-apple-muted)]">
                  {opt.sub}
                </div>
              </button>
            ))}
          </div>
        </Field>
      </Section>

      {/* 액션 */}
      <div className="mt-7 flex items-center justify-between gap-4">
        <p className="text-[11px] wght-450 text-[var(--color-apple-muted)]">
          ⚠ AI 초안 — 본인 표현으로 다시 쓰지 않으면 표절 검사기에 잡혀요
        </p>
        <button
          type="submit"
          disabled={!canSubmit || isRunning}
          className={cn(
            "rounded-full px-5 py-2.5 text-[13.5px] wght-620 transition-all",
            !canSubmit || isRunning
              ? "cursor-not-allowed bg-[var(--color-apple-hairline)] text-[var(--color-apple-muted)]"
              : "bg-[var(--color-apple-ink)] text-white hover:-translate-y-px hover:bg-[var(--color-apple-ink)] hover:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.3)] active:translate-y-0",
          )}
        >
          {isRunning ? "초안 만드는 중…" : "초안 만들기"}
        </button>
      </div>

      {hasError && (
        <p className="mt-3 text-[12px] wght-560 text-[var(--color-apple-coral)]">
          {String(submitError || jobError || job?.errorMessage)}
        </p>
      )}

      {isRunning && <RunningBar status={job?.status ?? "pending"} />}
    </form>
  );
}

const fieldClass =
  "w-full rounded-[10px] border border-[var(--color-apple-hairline)] bg-white px-3 py-2 text-[14px] text-[var(--color-apple-ink)] outline-none transition-colors placeholder:text-[var(--color-apple-muted)] focus:border-[var(--color-apple-action)] focus:ring-2 focus:ring-[var(--color-apple-action)]/20";

function Section({
  index,
  title,
  sub,
  children,
}: {
  index: number;
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="not-first:mt-7 first:mt-0">
      <div className="mb-3 flex items-baseline gap-2.5">
        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--color-apple-pearl)] px-1.5 text-[10.5px] wght-620 tabular-nums text-[var(--color-apple-muted)]">
          {index}
        </span>
        <h3
          className="text-[15px] wght-620 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {title}
        </h3>
      </div>
      {sub && <p className="mb-3 text-[12.5px] wght-450 text-[var(--color-apple-muted)]">{sub}</p>}
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  // 자식이 input일 수도 button group일 수도 있어 label 대신 div 사용.
  // input 요소는 자체적으로 placeholder + 인접 라벨로 충분.
  return (
    <div className="block">
      <div className="mb-1.5 flex items-baseline gap-1.5">
        <span className="text-[12.5px] wght-560 text-[var(--color-apple-ink)]">{label}</span>
        {required && (
          <span className="text-[11px] wght-560 text-[var(--color-apple-coral)]">필수</span>
        )}
        {hint && (
          <span className="text-[11px] wght-450 text-[var(--color-apple-muted)]">{hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function RunningBar({ status }: { status: string }) {
  const label = status === "running" ? "쓰는 중" : "대기 중";
  return (
    <div className="mt-5 flex items-center gap-2 rounded-[10px] bg-[var(--color-apple-pearl)] px-3 py-2.5">
      <span className="relative inline-flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-apple-action)] opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-apple-action)]" />
      </span>
      <span className="text-[12.5px] wght-560 text-[var(--color-apple-ink)]">{label}…</span>
      <span className="text-[11px] wght-450 text-[var(--color-apple-muted)]">
        길어도 30초 안. 잠시만요.
      </span>
    </div>
  );
}

// ─── 결과 화면 — 워터마크 + 본문 + 인용 + 다시쓰기 1급 ──────────
function ResultView({
  output,
  onParaphrase,
  onReset,
  isParaphrasing,
}: {
  output: BookReviewOutputT;
  onParaphrase: () => void;
  onReset: () => void;
  isParaphrasing: boolean;
}) {
  const bodyText = output.paragraphs.map((p) => p.text).join("\n\n");
  const fullText = `${output.watermark}\n\n${output.title}\n${output.bookTitle} — ${output.bookAuthor || "(저자 미입력)"}\n\n${bodyText}\n\n${output.disclaimer}`;

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(fullText);
    } catch {
      /* noop */
    }
  }

  return (
    <article className="elev-1 rounded-[22px] bg-white">
      {/* 머리 워터마크 — 굵게, 절대 못 빠뜨림 */}
      <header className="rounded-t-[22px] border-b border-[var(--color-apple-hairline)] bg-[var(--color-apple-coral-soft)] px-5 py-3 sm:px-7">
        <p className="text-[12px] wght-620 text-[var(--color-apple-coral)]">⚠ {output.watermark}</p>
      </header>

      <div className="px-5 py-6 sm:px-8 sm:py-9">
        <h2
          className="text-[22px] wght-700 text-[var(--color-apple-ink)] sm:text-[26px]"
          style={{ letterSpacing: "-0.018em" }}
        >
          {output.title}
        </h2>
        <p className="mt-1 text-[12.5px] wght-560 text-[var(--color-apple-muted)]">
          {output.bookTitle}
          {output.bookAuthor && ` — ${output.bookAuthor}`}
        </p>

        <div className="mt-6 space-y-5">
          {output.paragraphs.map((p, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 같은 role(body) 단락이 여러 개 가능 — index가 진짜 unique 시그널
            <Paragraph key={`${p.role}-${i}`} paragraph={p} />
          ))}
        </div>

        {/* 꼬리 약관 */}
        <p className="mt-8 rounded-[10px] bg-[var(--color-apple-pearl)] px-3.5 py-2.5 text-[11.5px] wght-450 text-[var(--color-apple-muted)]">
          {output.disclaimer}
        </p>
      </div>

      {/* 액션 바 — 다시 쓰기가 가장 크고 눈에 띄어야 함 (§4 정책) */}
      <footer className="flex flex-col gap-3 rounded-b-[22px] border-t border-[var(--color-apple-hairline)] bg-[var(--color-apple-pearl)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={copyAll}
            className="rounded-full border border-[var(--color-apple-hairline)] bg-white px-4 py-2 text-[12.5px] wght-560 text-[var(--color-apple-ink)] transition-colors hover:bg-[var(--color-apple-pearl)]"
          >
            전체 복사
          </button>
          <button
            type="button"
            onClick={onReset}
            className="rounded-full border border-[var(--color-apple-hairline)] bg-white px-4 py-2 text-[12.5px] wght-560 text-[var(--color-apple-ink)] transition-colors hover:bg-[var(--color-apple-pearl)]"
          >
            새 책으로
          </button>
        </div>

        {/* 다시 쓰기 — 1급 액션 (가장 크고 검은색 검정) */}
        <button
          type="button"
          onClick={onParaphrase}
          disabled={isParaphrasing}
          className={cn(
            "rounded-full px-5 py-2.5 text-[13.5px] wght-620 transition-all",
            isParaphrasing
              ? "cursor-not-allowed bg-[var(--color-apple-hairline)] text-[var(--color-apple-muted)]"
              : "bg-[var(--color-apple-ink)] text-white hover:-translate-y-px hover:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.3)] active:translate-y-0",
          )}
        >
          {isParaphrasing ? "다시 쓰는 중…" : "✍ 내 표현으로 다시 쓰기"}
        </button>
      </footer>
    </article>
  );
}

function Paragraph({ paragraph }: { paragraph: BookReviewOutputT["paragraphs"][number] }) {
  return (
    <div>
      <p
        className="text-[14.5px] leading-[1.7] wght-450 text-[var(--color-apple-ink)]"
        style={{ letterSpacing: "-0.005em" }}
      >
        {paragraph.text}
      </p>
      {paragraph.citations.length > 0 && (
        <div className="mt-2 space-y-1.5 border-l-2 border-[var(--color-apple-action)] pl-3">
          {paragraph.citations.map((c, i) => (
            <p
              // biome-ignore lint/suspicious/noArrayIndexKey: 같은 sourceLabel 인용이 여러 번 가능
              key={`${c.sourceLabel}-${i}`}
              className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
            >
              <span className="wght-620 text-[var(--color-apple-action)]">{c.sourceLabel}</span>
              {": "}
              <span className="italic">"{c.quote}"</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
