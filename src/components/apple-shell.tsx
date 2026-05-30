/**
 * Apple 톤 페이지 공통 컨테이너 — 27개 페이지가 각자 손으로 짠 max-w/px/pt/pb 통일.
 *
 * 기본: mx-auto + 1080px max-w + responsive padding.
 *
 * 사용:
 *   <AppleShell>...</AppleShell>           — 기본 1080
 *   <AppleShell width="narrow">...        — 820 (위저드용)
 *   <AppleShell width="wide">...          — 1200 (course 2-col 등)
 *   <AppleShell width="hero">...          — 1440 (대시보드 메인)
 *
 * 폭 시리즈 의도:
 *  - narrow(820): 한 단 본문 — 위저드 step UI, 본문 위주
 *  - default(1080): 표준 — Today·Study·Review·Quiz 인덱스
 *  - wide(1200): 2-컬럼 hero — Course detail
 *  - hero(1440): 대시보드 hero — 시간표 + 사이드레일 + 하단카드
 *
 * 외부에서 className으로 추가 패딩·flex 등 자유. min-h-0/h-full 같이 fit 필요한 경우는 외부에서 처리.
 */
export function AppleShell({
  children,
  width = "default",
  className = "",
}: {
  children: React.ReactNode;
  width?: "narrow" | "default" | "wide" | "hero";
  className?: string;
}) {
  const maxW = {
    narrow: "max-w-[820px]",
    default: "max-w-[1080px]",
    wide: "max-w-[1200px]",
    hero: "max-w-[1440px]",
  }[width];

  return (
    <div
      className={`mx-auto w-full ${maxW} px-6 pb-24 pt-8 sm:px-10 sm:pb-28 sm:pt-12 md:px-12 ${className}`}
    >
      {children}
    </div>
  );
}
