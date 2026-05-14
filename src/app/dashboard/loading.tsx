/**
 * Dashboard 공통 로딩 — App Router가 RSC fetch 동안 보여주는 스켈레톤.
 * 페이지마다 layout 안쪽이 fade-up으로 들어오므로, 여기는 거의 아무것도 안 보여도 OK.
 * 상단 NavigationProgress가 진행 신호를 이미 주므로 본문은 비워둠.
 */
export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-[1080px] px-6 pb-24 pt-8 sm:px-10 sm:pt-12">
      <div className="space-y-4">
        <div className="h-3 w-24 animate-pulse rounded bg-[var(--color-apple-pearl)]" />
        <div className="h-10 w-2/3 animate-pulse rounded bg-[var(--color-apple-pearl)]" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-[var(--color-apple-pearl)]" />
      </div>
    </div>
  );
}
