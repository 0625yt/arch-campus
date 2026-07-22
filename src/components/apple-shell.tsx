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
 * 하단 패딩 계열:
 *  - default: pb-24 sm:pb-28 — 인덱스·위저드 (표준)
 *  - tall: pb-32 sm:pb-40 — 스크롤 긴 상세(퀴즈 solver·import·history 상세). 하단 액션이 탭바에 안 가리게 여유.
 *
 * ⚠️ className으로 px/max-w/pb를 override하지 말 것 — className은 뒤에 append되지만
 *    동일 property는 Tailwind 클래스 순서에 의존해 override가 깨질 수 있다.
 *    폭·하단패딩이 다르면 width/pb prop으로, 그래도 안 맞으면 이 셸에 편입하지 말 것.
 *
 * 편입 제외(특수 레이아웃 — 인라인 유지가 옳음):
 *  - calendar/page (모바일 full-bleed px-0), dashboard/page 메인 (flex/overflow),
 *    study/[course]/[material] (md 920→1400 점프), quiz result (760), dev/* (내부 툴).
 *
 * className은 flex·gap 등 컨테이너 property가 아닌 것만 추가.
 */
export function AppleShell({
  children,
  width = "default",
  pb = "default",
  className = "",
}: {
  children: React.ReactNode;
  width?: "narrow" | "default" | "wide" | "hero";
  pb?: "default" | "tall";
  className?: string;
}) {
  const maxW = {
    narrow: "max-w-[820px]",
    default: "max-w-[1080px]",
    wide: "max-w-[1200px]",
    hero: "max-w-[1440px]",
  }[width];

  const pbCls = {
    default: "pb-24 sm:pb-28",
    tall: "pb-32 sm:pb-40",
  }[pb];

  return (
    <div
      className={`mx-auto w-full ${maxW} px-6 pt-8 sm:px-10 sm:pt-12 md:px-12 ${pbCls} ${className}`}
    >
      {children}
    </div>
  );
}
