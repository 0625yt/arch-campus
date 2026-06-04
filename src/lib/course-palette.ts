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
 * Apple Calendar/Reminders 톤 — 명도 95+ 채도 30 정도의 "안개처럼 연한" 파스텔.
 * 카드 위에 물감 한 방울 풀어둔 느낌. "색이 거의 안 보이는데 강의별로 다르긴 함" 임계.
 * alpha 0.18 정도로 wash해야 사용자가 원하는 "존나 연한" 톤.
 */
const PALETTE: RGB[] = [
  { r: 200, g: 228, b: 255 }, // 안개 sky
  { r: 204, g: 240, b: 214 }, // 안개 mint
  { r: 255, g: 218, b: 225 }, // 안개 pink
  { r: 255, g: 232, b: 196 }, // 안개 butter
  { r: 228, g: 218, b: 250 }, // 안개 lavender
  { r: 255, g: 214, b: 200 }, // 안개 coral
  { r: 204, g: 240, b: 236 }, // 안개 teal
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
 * 사용자 피드백: "존나 연하게, 파스텔 wash 느낌". default 0.18로 안개처럼.
 * 시간표 셀처럼 색이 명확해야 하는 곳만 caller가 0.32 정도로 끌어올림.
 */
export function courseTint(name: string, color?: string | null, alpha = 0.18): string {
  const { r, g, b } = courseRgb(name, color);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 다크 모드 시간표 셀 — 불투명 색. 강의색을 어두운 베이스에 섞되 채도를 끌어올려
 * Saturn·Notion처럼 선명하게 발광. alpha 합성 진흙기를 원천 차단.
 *   1) 강의색 채도 강화(회색기 제거) → 2) 어두운 베이스(#222)에 mix
 */
export function courseTintDark(name: string, color?: string | null): string {
  const { r, g, b } = courseRgb(name, color);
  // 채도 강화: 각 채널을 평균에서 멀어지게 밀어 회색기를 걷어낸다.
  const avg = (r + g + b) / 3;
  const sat = 1.45;
  const vivid = (c: number) => Math.max(0, Math.min(255, Math.round(avg + (c - avg) * sat)));
  const vr = vivid(r),
    vg = vivid(g),
    vb = vivid(b);
  // 어두운 베이스(#26)에 강의색 55% mix → 불투명·선명·글자 대비 확보.
  const base = 38; // ≈ #262628
  const strength = 0.55;
  const mix = (c: number) => Math.round(c * strength + base * (1 - strength));
  return `rgb(${mix(vr)}, ${mix(vg)}, ${mix(vb)})`;
}

/** hover 액센트 — 한 단 진하게 (그래도 연함). */
export function courseTintStrong(name: string, color?: string | null): string {
  return courseTint(name, color, 0.32);
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

/** 카드 우상단 컬러 wash — radial gradient. hover 시 살아있음. 톤 다운. */
export function courseGradient(name: string, color?: string | null): string {
  const { r, g, b } = courseRgb(name, color);
  return `radial-gradient(120% 80% at 100% 0%, rgba(${r}, ${g}, ${b}, 0.32) 0%, rgba(${r}, ${g}, ${b}, 0.10) 50%, transparent 80%)`;
}

/**
 * 카드 좌→우 그라데이션 — 좌측에서 색이 풍부하고 우측으로 천천히 풀려나가는 wash.
 * 사용자 피드백: 단일 색은 평탄해 보임. 좌측에 색 잡고 우측을 흰 종이로 풀면 호흡감 살아남.
 *
 *   default: 좌측 alpha 0.28 → 우측 alpha 0 (완전 풀림)
 *   strong:  hover·강조 — 좌측 0.42 → 우측 0.04
 *
 * radial(우상단) gradient와 같이 쓰면 두 겹 wash로 카드가 더 살아있음.
 */
export function courseLinearGradient(
  name: string,
  color?: string | null,
  alpha = 0.28,
): string {
  const { r, g, b } = courseRgb(name, color);
  return `linear-gradient(90deg, rgba(${r}, ${g}, ${b}, ${alpha}) 0%, rgba(${r}, ${g}, ${b}, ${alpha * 0.45}) 35%, rgba(${r}, ${g}, ${b}, 0) 100%)`;
}

/**
 * hex 색 직접 받아 좌→우 그라데이션. dotColor만 들어오는 컴포넌트(자료 카드 등) 용도.
 * hex 파싱 실패하면 cobalt 폴백.
 */
export function hexLinearGradient(hex: string, alpha = 0.22): string {
  const parsed = parseHex(hex) ?? { r: 122, g: 166, b: 214 };
  const { r, g, b } = parsed;
  return `linear-gradient(90deg, rgba(${r}, ${g}, ${b}, ${alpha}) 0%, rgba(${r}, ${g}, ${b}, ${alpha * 0.45}) 35%, rgba(${r}, ${g}, ${b}, 0) 100%)`;
}
