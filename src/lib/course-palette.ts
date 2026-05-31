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

const PALETTE: RGB[] = [
  { r: 122, g: 166, b: 214 }, // sky blue
  { r: 127, g: 179, b: 140 }, // mint
  { r: 224, g: 142, b: 158 }, // peach pink
  { r: 204, g: 160, b: 107 }, // butter
  { r: 160, g: 139, b: 196 }, // lavender
  { r: 214, g: 139, b: 122 }, // coral
  { r: 122, g: 196, b: 196 }, // teal
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

/** 카드·셀 배경용 매우 연한 tint (12% alpha). */
export function courseTint(name: string, color?: string | null, alpha = 0.12): string {
  const { r, g, b } = courseRgb(name, color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 카드 hover 또는 액센트용 (24% alpha). */
export function courseTintStrong(name: string, color?: string | null): string {
  return courseTint(name, color, 0.24);
}

/** 텍스트 강조용 — 채도 유지, 명도 살짝 낮춰 가독성 확보. */
export function courseInkColor(name: string, color?: string | null): string {
  const { r, g, b } = courseRgb(name, color);
  // 30% 어둡게 (라이트 모드 텍스트 대비)
  const dim = (v: number) => Math.max(0, Math.floor(v * 0.65));
  return `rgb(${dim(r)}, ${dim(g)}, ${dim(b)})`;
}

/** 진한 액센트 (도트·border 용) — 원본 RGB 그대로. */
export function courseAccentRgb(name: string, color?: string | null): RGB {
  return courseRgb(name, color);
}

/** 미세한 그라데이션 — 카드 우상단 컬러 워시 (5~12% alpha 그라데이션). */
export function courseGradient(name: string, color?: string | null): string {
  const { r, g, b } = courseRgb(name, color);
  return `radial-gradient(120% 80% at 100% 0%, rgba(${r}, ${g}, ${b}, 0.18) 0%, rgba(${r}, ${g}, ${b}, 0.04) 50%, transparent 80%)`;
}
