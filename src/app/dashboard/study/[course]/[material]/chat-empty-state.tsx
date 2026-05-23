"use client";

// §4 치팅 라인 — suggested prompt에 "답 알려줘"·"본문 써줘" 류 0개.
// 핵심 정리·헷갈리는 부분·시험 우선순위 위주로.
const SUGGESTED_PROMPTS = [
  "이 자료 핵심 3가지로 정리해줘",
  "내가 헷갈릴 만한 부분 짚어줘",
  "이 자료로 시험 본다면 뭘 먼저 봐야 해?",
];

export function ChatEmptyState({ onPickPrompt }: { onPickPrompt: (text: string) => void }) {
  return (
    <div className="flex flex-col items-stretch gap-4 py-6">
      <div className="text-center">
        <p
          className="text-[18px] wght-620 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          이 자료, 같이 볼까요?
        </p>
        <p
          className="mt-2 text-[13px] leading-[1.55] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.022em" }}
        >
          자료 안에서만 답해요. 본문은 직접 쓰셔야 하지만,
          <br />
          핵심 잡기·헷갈리는 부분 짚기는 같이 해요.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {SUGGESTED_PROMPTS.map((p) => (
          <li key={p}>
            <button
              type="button"
              onClick={() => onPickPrompt(p)}
              className="w-full rounded-[12px] border border-[var(--color-apple-hairline)] bg-white px-4 py-3 text-left text-[13.5px] leading-[1.45] wght-450 text-[var(--color-apple-ink)] transition-colors hover:border-[var(--color-apple-action)] hover:text-[var(--color-apple-action)]"
              style={{ letterSpacing: "-0.022em" }}
            >
              {p}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
