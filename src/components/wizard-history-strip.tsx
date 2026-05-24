import Link from "next/link";
import type { WizardHistoryItem } from "@/lib/data/wizard-history";

/**
 * 위저드 페이지 상단의 "이전 결과" 섹션.
 *
 * 정책:
 *   - items 비어있으면 컴포넌트 자체 렌더 X (위저드 페이지가 더 깔끔)
 *   - 카드 형태로 한 줄씩 — 가로 스크롤 대신 grid 1열(모바일)·2열(데스크) 차분하게
 *   - "전체 보기" 링크는 우상단 — /dashboard/history로
 */
export function WizardHistoryStrip({
  items,
  emptyHint,
}: {
  items: WizardHistoryItem[];
  /** 결과 0건일 때 표시할 빈 카드. 생략하면 컴포넌트 통째로 안 그림 */
  emptyHint?: string;
}) {
  if (items.length === 0) {
    if (!emptyHint) return null;
    return (
      <section>
        <Header />
        <p
          className="mt-4 text-[13.5px] wght-450 leading-[1.6] text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {emptyHint}
        </p>
      </section>
    );
  }

  return (
    <section>
      <Header />
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {items.map((it) => (
          <li key={it.id}>
            <Link
              href={it.href}
              className="group flex items-center gap-3 rounded-[12px] border border-[var(--color-apple-hairline)] bg-white px-4 py-3 transition-all hover:-translate-y-px hover:border-[var(--color-apple-action)]/35 hover:shadow-[0_8px_24px_-12px_rgba(0,113,227,0.18)]"
            >
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-[13.5px] wght-560 text-[var(--color-apple-ink)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  {it.title}
                </p>
                <p
                  className="mt-0.5 truncate text-[11.5px] wght-450 text-[var(--color-apple-muted)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  {it.detail ? `${it.detail} · ` : ""}
                  {formatRelative(it.createdAt)}
                </p>
              </div>
              <span className="shrink-0 text-[14px] text-[var(--color-apple-muted)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--color-apple-action)]">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Header() {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2
        className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]"
      >
        이전에 만든 것
      </h2>
      <Link
        href="/dashboard/history"
        className="group inline-flex items-baseline text-[12px] wght-450 text-[var(--color-apple-muted)] hover:text-[var(--color-apple-action)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        <span>전체 기록</span>
        <span className="ml-0.5">›</span>
      </Link>
    </div>
  );
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const now = Date.now();
  const diffMs = now - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return d.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
  });
}
