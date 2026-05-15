"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * /dashboard 하위 라우트 어디서든 throw가 일어나면 흰 화면 대신 이 화면.
 * Next.js App Router의 error boundary 규약 — 'use client' 필수, reset()으로 재시도.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard error]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-16">
      <div className="elev-1 w-full max-w-[480px] rounded-[18px] bg-white px-7 py-9 text-center sm:px-10 sm:py-12">
        <div
          className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-urgent)]/10 text-[20px] text-[var(--color-urgent)]"
          aria-hidden
        >
          ⚠
        </div>
        <h1
          className="text-[20px] wght-700 text-[var(--color-apple-ink)] sm:text-[22px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          잠깐, 화면이 멈췄어요
        </h1>
        <p
          className="mt-2.5 text-[13.5px] wght-450 leading-[1.6] text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          이 화면을 그리다가 문제가 생겼어요.
          <br />
          다시 시도하거나 내 캠퍼스로 돌아가 주세요.
        </p>

        {error.digest && (
          <p
            className="mt-4 inline-block rounded-[6px] bg-[var(--color-apple-pearl)] px-2 py-1 font-mono text-[11px] tabular-nums text-[var(--color-apple-muted)]"
          >
            {error.digest}
          </p>
        )}

        <div className="mt-7 flex justify-center gap-2">
          <Link
            href="/dashboard"
            className="rounded-[8px] px-3.5 py-2 text-[13px] wght-560 text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]"
          >
            내 캠퍼스로
          </Link>
          <button
            type="button"
            onClick={reset}
            className="rounded-[8px] bg-[var(--color-apple-ink)] px-3.5 py-2 text-[13px] wght-620 text-white transition-opacity hover:opacity-90"
          >
            다시 시도
          </button>
        </div>
      </div>
    </div>
  );
}
