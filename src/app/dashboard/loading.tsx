/**
 * Dashboard 공통 로딩 — RSC fetch 동안 보여주는 스켈레톤.
 *
 * Hero(헤더 + 큰 제목 + 보조 문구) + 통계 4칸 + 카드 그리드를 회색 박스로 흉내.
 * 실제 페이지가 들어왔을 때 레이아웃 점프가 적도록 같은 max-width·padding 사용.
 */
export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-[1080px] px-6 pb-24 pt-8 sm:px-10 sm:pt-12">
      {/* 헤더 라인 */}
      <SkeletonBlock className="h-3 w-20" />

      {/* Hero 제목 */}
      <div className="mt-10 space-y-3 sm:mt-14">
        <SkeletonBlock className="h-9 w-3/4 sm:h-12" />
        <SkeletonBlock className="h-9 w-1/2 sm:h-12" />
      </div>

      {/* 보조 문구 */}
      <div className="mt-5 space-y-2">
        <SkeletonBlock className="h-3 w-2/5" />
      </div>

      {/* 통계 4칸 */}
      <div className="mt-10 grid grid-cols-2 gap-3 sm:mt-12 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-[88px] rounded-[14px]" />
        ))}
      </div>

      {/* 카드 그리드 */}
      <div className="mt-10 grid gap-3 sm:mt-12 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-[180px] rounded-[18px]" />
        ))}
      </div>
    </div>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-[var(--color-apple-pearl)] ${className}`}
      aria-hidden
    />
  );
}
