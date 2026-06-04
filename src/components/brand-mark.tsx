/**
 * Brand mark — arch.
 *
 * 의미: "한 학기 위에 걸치는 아치(arch)". 두 기둥 + 위 곡선으로 학기 전체를
 * 떠받치는 형태. 글자 의존 없이 추상 글리프만으로 식별되는 게 목표 (애플 로고
 * 사과처럼). 컬러 그라데이션은 우리 brand 코발트→라일락 그대로.
 *
 * 사용: <BrandMark size={28} /> — 어디서든 동일한 SVG 한 정의.
 * favicon·apple-icon·OG 이미지는 별도 정적 SVG에 같은 path를 박아둔다.
 */
export function BrandMark({
  size = 24,
  monochrome = false,
  className,
}: {
  /** 한 변 px. 24~64 사이에서 가장 잘 읽힘. */
  size?: number;
  /** 다크 배경 위 단색이 필요한 곳 (e.g. 흑백 print) — gradient 끄고 currentColor */
  monochrome?: boolean;
  className?: string;
}) {
  // 동일 페이지에 여러 brand mark가 있어도 gradient id 충돌이 없도록 size를 섞는다.
  const uid = `brand-${size}-${monochrome ? "m" : "g"}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="arch"
      className={className}
    >
      <title>arch</title>
      {!monochrome && (
        <defs>
          <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0071E3" />
            <stop offset="55%" stopColor="#4F7BE8" />
            <stop offset="100%" stopColor="#8E7EE0" />
          </linearGradient>
          <linearGradient id={`${uid}-shine`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>
      )}

      {/* 배경 squircle — iOS 아이콘 그리드 기준 corner radius = size * 0.22 */}
      <rect
        x="0"
        y="0"
        width="32"
        height="32"
        rx="7.04"
        fill={monochrome ? "currentColor" : `url(#${uid}-fill)`}
      />
      {!monochrome && (
        <rect x="0" y="0" width="32" height="32" rx="7.04" fill={`url(#${uid}-shine)`} />
      )}

      {/*
        arch 글리프 — 두 기둥 + 반원 곡선 (두께 3.4).
        SF Symbol "arch.fill" 톤이지만 둥글기를 더 살리고 캡을 stroke-linecap=round.
        white·약간의 그림자로 깊이감.
      */}
      <g stroke="#ffffff" strokeWidth="3.4" strokeLinecap="round" fill="none" opacity="0.97">
        {/* 좌 기둥 */}
        <path d="M 9.5 22.5 L 9.5 16.5" />
        {/* 우 기둥 */}
        <path d="M 22.5 22.5 L 22.5 16.5" />
        {/* 위 곡선 — 두 기둥을 잇는 반원. 시작·끝이 정확히 기둥 꼭대기와 만남 */}
        <path d="M 9.5 16.5 A 6.5 6.5 0 0 1 22.5 16.5" />
      </g>

      {/* 미세 ground highlight — 글리프가 떠있다는 느낌 */}
      {!monochrome && <ellipse cx="16" cy="24" rx="6.5" ry="0.6" fill="#ffffff" opacity="0.18" />}
    </svg>
  );
}
