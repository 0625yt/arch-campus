"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { useActiveJobs } from "@/lib/hooks/use-active-jobs";

/**
 * summary가 아직 DB에 없을 때 박는 클라이언트 분기.
 *
 * 백엔드는 업로드 직후 `after()` 콜백에서 summarize·quiz 두 잡을 백그라운드로 돌린다
 * (src/app/api/materials/route.ts §"4) 두 잡 큐잉"). 이 컴포넌트는 active jobs를
 * 폴링하면서 다음 셋 중 하나를 그린다:
 *
 *   - 이 materialId 앞으로 summarize 잡이 active(pending/running): 로딩 카드
 *   - active였다가 사라진 직후: router.refresh() → 서버가 detail.summary 채워서
 *     page.tsx의 SummaryArticle 분기로 교체된다.
 *   - 처음부터 active 없음 (예: 새로고침 후 잡 이미 끝남, 또는 수동 트리거 대기 상태):
 *     서버에서 받은 `fallback` (EmptySummary)을 그대로 표시.
 */
export function SummaryLoading({
  materialId,
  className,
  fallback,
}: {
  materialId: string;
  className?: string;
  fallback: ReactNode;
}) {
  const router = useRouter();
  const { jobs } = useActiveJobs();
  const sawActiveRef = useRef(false);

  const active = jobs.find(
    (j) => j.materialId === materialId && j.tool === "summarize",
  );

  useEffect(() => {
    if (active) {
      sawActiveRef.current = true;
      return;
    }
    // active가 사라진 순간 = 잡 끝남. 서버 데이터 다시 가져오기.
    if (sawActiveRef.current) {
      router.refresh();
    }
  }, [active, router]);

  if (!active) return <div className={className}>{fallback}</div>;

  return (
    <section className={className}>
      <div className="elev-1 rounded-[18px] bg-white px-7 py-12 sm:px-10 sm:py-16">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-apple-hairline)] border-t-[var(--color-apple-action)]"
          />
          <p
            className="text-[13px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]"
          >
            요약 만드는 중
          </p>
        </div>
        <p
          className="mt-5 text-[20px] leading-[1.5] wght-560 text-[var(--color-apple-ink)] sm:text-[22px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          자료를 읽고 핵심 흐름을 정리하고 있어요. 보통 30~60초 걸려요.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <SkelLine width="92%" />
          <SkelLine width="88%" />
          <SkelLine width="76%" />
          <SkelLine width="64%" />
        </div>
      </div>
    </section>
  );
}

function SkelLine({ width }: { width: string }) {
  return (
    <span
      aria-hidden
      className="h-3 animate-pulse rounded-full bg-[var(--color-apple-hairline)]"
      style={{ width }}
    />
  );
}
