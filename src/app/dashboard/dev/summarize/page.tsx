"use client";

import { useState } from "react";

interface SummarizeOk {
  ok: true;
  materialId: string;
  parser: string;
  pageCount?: number;
  summary: {
    leadSentence: string;
    blocks: Array<
      | { type: "h2"; content: string }
      | { type: "para"; content: string }
      | { type: "bullets"; items: string[] }
      | { type: "callout"; tone: "info" | "warn" | "tip"; content: string }
    >;
    keywords: string[];
    reviewSpots: { title: string; why: string }[];
    watermark: string;
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    costUsd: number;
    tokenBudget: { rule: number; dynamic: number; user: number; total: number; cacheableShare: number };
  };
}

interface SummarizeErr {
  ok: false;
  error: string;
  reason?: string;
}

type SummarizeResponse = SummarizeOk | SummarizeErr;

export default function DevSummarizePage() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"lecture" | "assignment" | "exam" | "syllabus" | "notice" | "team">("lecture");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SummarizeResponse | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setResult(null);
    setElapsedMs(null);
    const started = Date.now();
    try {
      const form = new FormData();
      form.append("file", file);
      if (title) form.append("title", title);
      form.append("type", type);
      const res = await fetch("/api/summarize", { method: "POST", body: form });
      const json = (await res.json()) as SummarizeResponse;
      setResult(json);
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setElapsedMs(Date.now() - started);
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8">
        <p className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
          DEV
        </p>
        <h1 className="mt-2 text-[28px] wght-620 text-[var(--color-apple-ink)] sm:text-[36px]" style={{ letterSpacing: "-0.024em" }}>
          /api/summarize 검증
        </h1>
        <p className="mt-3 text-[14px] leading-[1.6] text-[var(--color-apple-muted)]">
          파일 올리면 파서 → sanitize → Claude → Zod → generations 기록까지 한 번에. 결과 JSON·비용·토큰까지 표시.
        </p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-[14px] bg-white p-6">
        <label className="flex flex-col gap-2 text-[13px] wght-560 text-[var(--color-apple-ink)]">
          파일 (PDF · DOCX · XLSX · PPTX · 이미지 · TXT)
          <input
            type="file"
            accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-[13px] wght-450 file:mr-3 file:rounded-full file:border-0 file:bg-[var(--color-apple-pearl)] file:px-4 file:py-2 file:text-[12px] file:wght-560 file:text-[var(--color-apple-ink)]"
            required
          />
          {file && (
            <span className="text-[11px] wght-450 text-[var(--color-apple-muted)] tabular-nums">
              {file.name} · {(file.size / 1024).toFixed(1)} KB · {file.type || "알 수 없음"}
            </span>
          )}
        </label>

        <label className="flex flex-col gap-2 text-[13px] wght-560 text-[var(--color-apple-ink)]">
          제목 (선택)
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="자료 제목 — 비우면 파일명에서 추출"
            className="rounded-[8px] bg-[var(--color-apple-pearl)] px-3 py-2 text-[14px] wght-450"
          />
        </label>

        <label className="flex flex-col gap-2 text-[13px] wght-560 text-[var(--color-apple-ink)]">
          종류
          <select
            value={type}
            onChange={(e) => setType(e.target.value as typeof type)}
            className="rounded-[8px] bg-[var(--color-apple-pearl)] px-3 py-2 text-[14px] wght-450"
          >
            <option value="lecture">강의 노트</option>
            <option value="assignment">과제 안내</option>
            <option value="exam">시험 자료</option>
            <option value="syllabus">강의계획서</option>
            <option value="notice">학사 공지</option>
            <option value="team">팀플 자료</option>
          </select>
        </label>

        <button
          type="submit"
          disabled={loading || !file}
          className="mt-2 inline-flex h-[44px] items-center justify-center rounded-full bg-[var(--color-apple-action)] px-6 text-[15px] wght-560 text-white transition-all duration-150 hover:bg-[var(--color-apple-action-hover)] disabled:opacity-50"
        >
          {loading ? "요약 중…" : "요약 받기"}
        </button>
      </form>

      {elapsedMs !== null && (
        <p className="mt-4 text-[12px] wght-450 tabular-nums text-[var(--color-apple-muted)]">
          소요: {(elapsedMs / 1000).toFixed(1)}초
        </p>
      )}

      {result && !result.ok && (
        <section className="mt-6 rounded-[14px] bg-[var(--color-urgent-soft)] p-6">
          <p className="text-[13px] wght-560 uppercase tracking-[0.06em] text-[var(--color-urgent)]">실패</p>
          <p className="mt-2 text-[15px] wght-560 text-[var(--color-apple-ink)]">{result.error}</p>
          {result.reason && (
            <p className="mt-1 text-[12px] wght-450 text-[var(--color-apple-muted)]">사유: {result.reason}</p>
          )}
        </section>
      )}

      {result?.ok && (
        <section className="mt-6 flex flex-col gap-6">
          <div className="rounded-[14px] bg-white p-6">
            <p className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
              요약 — material {result.materialId.slice(0, 8)}…
            </p>
            <p className="mt-2 text-[18px] wght-620 leading-[1.4] text-[var(--color-apple-ink)]">
              {result.summary.leadSentence}
            </p>

            <div className="mt-6 flex flex-col gap-4">
              {result.summary.blocks.map((block, i) => (
                <SummaryBlock key={i} block={block} />
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {result.summary.keywords.map((k) => (
                <span
                  key={k}
                  className="rounded-full bg-[var(--color-apple-pearl)] px-3 py-1 text-[12px] wght-560 text-[var(--color-apple-ink)]"
                >
                  {k}
                </span>
              ))}
            </div>

            {result.summary.reviewSpots.length > 0 && (
              <div className="mt-6 rounded-[10px] bg-[var(--color-apple-pearl)] p-4">
                <p className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
                  한 번 더 보면 좋은 곳
                </p>
                <ul className="mt-3 flex flex-col gap-3">
                  {result.summary.reviewSpots.map((s, i) => (
                    <li key={i}>
                      <p className="text-[14px] wght-620 text-[var(--color-apple-ink)]">{s.title}</p>
                      <p className="mt-1 text-[12px] wght-450 leading-[1.5] text-[var(--color-apple-muted)]">{s.why}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="mt-6 text-[11px] wght-450 italic text-[var(--color-apple-muted)]">
              {result.summary.watermark}
            </p>
          </div>

          <div className="rounded-[14px] bg-white p-6">
            <p className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
              비용 · 토큰
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] tabular-nums">
              <Row label="parser" value={result.parser + (result.pageCount ? ` · ${result.pageCount}쪽` : "")} />
              <Row label="cost" value={`$${result.usage.costUsd.toFixed(6)}`} />
              <Row label="input" value={`${result.usage.inputTokens}`} />
              <Row label="output" value={`${result.usage.outputTokens}`} />
              <Row label="cache read" value={`${result.usage.cacheReadTokens}`} />
              <Row label="cache write" value={`${result.usage.cacheCreationTokens}`} />
              <Row
                label="cacheable share"
                value={`${(result.usage.tokenBudget.cacheableShare * 100).toFixed(1)}%`}
              />
              <Row label="total budget" value={`${result.usage.tokenBudget.total} tok`} />
            </dl>
          </div>
        </section>
      )}
    </div>
  );
}

function SummaryBlock({
  block,
}: {
  block:
    | { type: "h2"; content: string }
    | { type: "para"; content: string }
    | { type: "bullets"; items: string[] }
    | { type: "callout"; tone: "info" | "warn" | "tip"; content: string };
}) {
  if (block.type === "h2") {
    return (
      <h3 className="text-[16px] wght-620 text-[var(--color-apple-ink)]">{block.content}</h3>
    );
  }
  if (block.type === "para") {
    return (
      <p className="text-[14px] leading-[1.65] text-[var(--color-apple-ink)]">{block.content}</p>
    );
  }
  if (block.type === "bullets") {
    return (
      <ul className="flex flex-col gap-1.5 pl-4 text-[14px] leading-[1.6] text-[var(--color-apple-ink)]">
        {block.items.map((it, i) => (
          <li key={i} className="list-disc">
            {it}
          </li>
        ))}
      </ul>
    );
  }
  const toneBg =
    block.tone === "warn"
      ? "var(--color-urgent-soft)"
      : block.tone === "tip"
        ? "var(--color-apple-action-soft)"
        : "var(--color-apple-pearl)";
  return (
    <div className="rounded-[10px] p-4 text-[13px] leading-[1.6]" style={{ backgroundColor: toneBg }}>
      {block.content}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--color-apple-hairline)] pb-1.5">
      <dt className="text-[var(--color-apple-muted)]">{label}</dt>
      <dd className="wght-560 text-[var(--color-apple-ink)]">{value}</dd>
    </div>
  );
}
