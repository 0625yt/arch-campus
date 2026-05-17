"use client";

import { WizardWatermark } from "@/components/wizard-shell";
import type { SummarizeOutputT } from "@/lib/schemas";
import { PageChip } from "./material-view";

/**
 * 자료 상세의 우측(또는 모바일 단일) 요약 컬럼.
 *
 * 기존 page.tsx의 SummaryArticle 구조를 그대로 가져오되 각 블록의 sourcePage가
 * 있으면 PageChip을 박는다. 칩 클릭은 onPageClick으로 위임 — 데스크톱이면
 * 좌측 iframe 점프, 모바일이면 새 탭.
 */
export function SummaryColumn({
  summary,
  onPageClick,
}: {
  summary: SummarizeOutputT;
  onPageClick: (page: number) => void;
}) {
  return (
    <article className="rounded-[18px] bg-white p-7 sm:p-9">
      <p
        className="text-[15px] leading-[1.55] wght-450 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.022em" }}
      >
        {summary.leadSentence}
      </p>

      <div className="mt-8 flex flex-col gap-6">
        {summary.blocks.map((block, i) => (
          <BlockRow key={i} block={block} onPageClick={onPageClick} />
        ))}
      </div>

      {summary.reviewSpots.length > 0 && (
        <div className="mt-10 rounded-[12px] bg-[var(--color-apple-pearl)] p-5 sm:p-6">
          <p className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
            복습 포인트
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {summary.reviewSpots.map((spot, i) => (
              <li key={i}>
                <p
                  className="text-[14px] wght-560 text-[var(--color-apple-ink)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  {spot.title}
                </p>
                <p
                  className="mt-1 text-[13px] leading-[1.55] wght-450 text-[var(--color-apple-muted)]"
                  style={{ letterSpacing: "-0.022em" }}
                >
                  {spot.why}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6">
        <WizardWatermark modelText={summary.watermark} />
      </div>
    </article>
  );
}

function BlockRow({
  block,
  onPageClick,
}: {
  block: SummarizeOutputT["blocks"][number];
  onPageClick: (page: number) => void;
}) {
  const sourcePage = "sourcePage" in block ? block.sourcePage : null;
  const chip = sourcePage ? (
    <PageChip page={sourcePage} onClick={() => onPageClick(sourcePage)} />
  ) : null;

  if (block.type === "h2") {
    return (
      <div className="flex flex-wrap items-baseline gap-2">
        <h2
          className="text-[20px] wght-620 text-[var(--color-apple-ink)] sm:text-[22px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {block.content}
        </h2>
        {chip}
      </div>
    );
  }
  if (block.type === "para") {
    return (
      <div>
        <p
          className="text-[15px] leading-[1.65] wght-450 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {block.content}
        </p>
        {chip && <div className="mt-2">{chip}</div>}
      </div>
    );
  }
  if (block.type === "bullets") {
    return (
      <div>
        <ul className="flex flex-col gap-2">
          {block.items.map((item, i) => (
            <li
              key={i}
              className="flex gap-2 text-[14.5px] leading-[1.6] wght-450 text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--color-apple-muted)]" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        {chip && <div className="mt-2">{chip}</div>}
      </div>
    );
  }
  // callout
  const toneClass =
    block.tone === "warn"
      ? "bg-[#fff5f5] border-[#f7c5c5]"
      : block.tone === "tip"
        ? "bg-[#f0f9f1] border-[#bee0c1]"
        : "bg-[#f0f7ff] border-[#c8e0f3]";
  return (
    <div className={`rounded-[12px] border p-4 ${toneClass}`}>
      <p
        className="text-[14px] leading-[1.6] wght-450 text-[var(--color-apple-ink)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {block.content}
      </p>
      {chip && <div className="mt-2">{chip}</div>}
    </div>
  );
}
