"use client";
import type { SummarizeOutputT } from "@/lib/schemas";
import { DownloadSummaryButton } from "../../dashboard/study/[course]/[material]/download-summary-button";
import { SummaryColumn } from "../../dashboard/study/[course]/[material]/summary-column";
export function SummaryPreview({ summary }: { summary: SummarizeOutputT }) {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">100쪽 자료 요약 · 출력 검증</h1>
        <DownloadSummaryButton filename="100쪽-자료-요약-검증" />
      </header>
      <SummaryColumn summary={summary} onPageClick={() => {}} />
    </main>
  );
}
