import { keyedItems } from "@/lib/keyed-items";
import type { SummarizeOutputT } from "@/lib/schemas";

type Block = SummarizeOutputT["blocks"][number];
/** Structured text only: no generated markup, executable diagrams, or external assets. */
export function SummaryVisual({ block }: { block: Extract<Block, { type: "table" | "flow" }> }) {
  if (block.type === "table") {
    return (
      <div className="summary-table-wrap overflow-x-auto rounded-xl border border-[var(--color-apple-hairline)]">
        <table className="summary-table w-full border-collapse text-left text-sm leading-relaxed">
          <caption className="px-4 py-3 text-left font-semibold">{block.caption}</caption>
          <thead className="bg-[var(--color-apple-pearl)]">
            <tr>
              {keyedItems(block.headers).map(({ item, key }) => (
                <th
                  key={key}
                  scope="col"
                  className="border-t border-[var(--color-apple-hairline)] px-4 py-3 align-top"
                >
                  {item}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keyedItems(block.rows).map(({ item: row, key }) => (
              <tr key={key}>
                {keyedItems(row).map(({ item: cell, key: cellKey }, i) =>
                  i === 0 ? (
                    <th
                      scope="row"
                      key={cellKey}
                      className="border-t border-[var(--color-apple-hairline)] px-4 py-3 align-top font-medium"
                    >
                      {cell}
                    </th>
                  ) : (
                    <td
                      key={cellKey}
                      className="border-t border-[var(--color-apple-hairline)] px-4 py-3 align-top"
                    >
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <figure className="summary-flow rounded-xl border border-[var(--color-apple-hairline)] bg-[var(--color-apple-pearl)] p-4">
      <figcaption className="mb-4 text-sm font-semibold">{block.caption}</figcaption>
      <ol className="grid gap-3">
        {keyedItems(block.steps).map(({ item: step, key }, i) => (
          <li
            key={key}
            className="rounded-lg border border-[var(--color-apple-hairline)] bg-white p-4 text-sm"
          >
            <p className="flex items-center gap-2 font-semibold">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-apple-action)] text-xs text-white">
                {i + 1}
              </span>
              {step.label.replace(/^\s*[1-8](?:[.)]\s*|\s*단계\s*)/u, "").trim() || "단계"}
              {i < block.steps.length - 1 && (
                <span aria-hidden="true" className="ml-auto">
                  ↓
                </span>
              )}
            </p>
            {step.detail && (
              <p className="mt-2 leading-relaxed text-[var(--color-apple-muted)]">{step.detail}</p>
            )}
          </li>
        ))}
      </ol>
    </figure>
  );
}

export function SummaryCoverage({ coverage }: { coverage: SummarizeOutputT["coverage"] }) {
  if (!coverage) return null;
  return (
    <aside className="my-4 rounded-xl border border-[var(--color-apple-hairline)] bg-[var(--color-apple-pearl)] px-4 py-3 text-xs leading-relaxed">
      <p className="font-semibold">
        전체 {coverage.totalChunks}개 구간 처리 · {coverage.inputCharacters.toLocaleString("ko-KR")}
        자 확인{coverage.pageCount ? ` · 원본 ${coverage.pageCount}쪽` : ""}
      </p>
      <p className="mt-1 text-[var(--color-apple-muted)]">
        입력된 원문의 처리 범위예요. 요약은 핵심을 압축하므로 세부 내용은 쪽수 버튼으로 원문과 함께
        확인하세요.
      </p>
      {keyedItems(coverage.warnings).map(({ item, key }) => (
        <p className="mt-2 font-medium text-[var(--color-urgent)]" key={key}>
          {item}
        </p>
      ))}
    </aside>
  );
}
