/**
 * Course palette — 강의명/이름 시드로 안정적으로 같은 색 매핑.
 *
 * 어디서든 같은 강의명·과목명에 같은 파스텔이 박혀 시간표·카드·문제집이
 * 시각적으로 연결되어 보이게 한다 (Apple Calendar 톤).
 *
 * 사용:
 *   const tint = courseTint("자료구조");        // "rgba(122,166,214,0.12)"
 *   const accent = courseAccentRgb("자료구조"); // {r,g,b} — 진한 액센트용
 *   const ink = courseInkColor("자료구조");     // "rgb(81,121,167)" — 어두운 텍스트용
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/*
 * Apple Calendar/Reminders 톤 — 명도 90+ 채도 40 정도의 화사한 파스텔.
 * "물감 살짝 풀어둔" 톤. 어두운 깊이감보다 가볍고 산뜻한 느낌이 우선.
 */
const PALETTE: RGB[] = [
  { r: 168, g: 213, b: 255 }, // 라이트 sky
  { r: 178, g: 234, b: 192 }, // 라이트 mint
  { r: 255, g: 200, b: 211 }, // 라이트 pink
  { r: 255, g: 220, b: 168 }, // 라이트 butter
  { r: 215, g: 200, b: 245 }, // 라이트 lavender
  { r: 255, g: 196, b: 178 }, // 라이트 coral
  { r: 178, g: 235, b: 230 }, // 라이트 teal
];

/** course.color가 default(#0071e3)거나 비어있으면 강의명 해시로 fallback. */
const DEFAULT_BLUE = "#0071e3";

function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

function pickByHash(seed: string): RGB {
  return PALETTE[hash(seed) % PALETTE.length];
}

function parseHex(color: string): RGB | null {
  if (!color.startsWith("#")) return null;
  const c =
    color.length === 4
      ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      : color;
  if (c.length !== 7) return null;
  const r = Number.parseInt(c.slice(1, 3), 16);
  const g = Number.parseInt(c.slice(3, 5), 16);
  const b = Number.parseInt(c.slice(5, 7), 16);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return null;
  return { r, g, b };
}

/** 강의명·색 → 안정 RGB. color가 default blue거나 없으면 이름 해시로 팔레트 배정. */
export function courseRgb(name: string, color: string | null | undefined): RGB {
  const seed = color && color !== DEFAULT_BLUE ? color : name;
  return (color && color !== DEFAULT_BLUE && parseHex(color)) || pickByHash(seed);
}

/**
 * 카드·셀 배경 tint.
 * RGB가 이미 라이트 톤이라 alpha를 충분히 높여도 화사함 유지.
 * 시간표 셀(0.55)·카드(0.42) 가량이 "물감 풀어둔" 톤.
 */
export function courseTint(name: string, color?: string | null, alpha = 0.42): string {
  const { r, g, b } = courseRgb(name, color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** hover 액센트 — 한 단 진하게. */
export function courseTintStrong(name: string, color?: string | null): string {
  return courseTint(name, color, 0.6);
}

/**
 * 텍스트 강조용 — 같은 hue 채도 끌어올린 dark variant.
 * 카드 위 wght-560+ 텍스트 가독성용 (slate 톤보다 살아있게).
 */
export function courseInkColor(name: string, color?: string | null): string {
  const { r, g, b } = courseRgb(name, color);
  // 라이트 톤 RGB라서 0.4 정도 어둡게 + 채도 보존 (단순 0.65 곱하기보다 명확).
  const dim = (v: number) => Math.max(0, Math.floor(v * 0.42));
  return `rgb(${dim(r)}, ${dim(g)}, ${dim(b)})`;
}

/** 진한 액센트 (도트·border) — 원본 RGB. */
export function courseAccentRgb(name: string, color?: string | null): RGB {
  return courseRgb(name, color);
}

/** 카드 우상단 컬러 wash — radial gradient. hover 시 살아있음. */
export function courseGradient(name: string, color?: string | null): string {
  const { r, g, b } = courseRgb(name, color);
  return `radial-gradient(120% 80% at 100% 0%, rgba(${r}, ${g}, ${b}, 0.55) 0%, rgba(${r}, ${g}, ${b}, 0.18) 50%, transparent 80%)`;
}
