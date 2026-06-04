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

/* ── HSL 변환 (다크 셀 색 재구성용) ──────────────────────────────── */
function rgbToHsl({ r, g, b }: RGB): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const mx = Math.max(rn, gn, bn);
  const mn = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (mx === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgbVals(h: number, s: number, l: number): RGB {
  const hn = h / 360;
  const sn = s / 100;
  const ln = l / 100;
  const f = (p: number, q: number, t: number) => {
    let tn = t;
    if (tn < 0) tn += 1;
    if (tn > 1) tn -= 1;
    if (tn < 1 / 6) return p + (q - p) * 6 * tn;
    if (tn < 1 / 2) return q;
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
    return p;
  };
  let r: number;
  let g: number;
  let b: number;
  if (sn === 0) {
    r = g = b = ln;
  } else {
    const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
    const p = 2 * ln - q;
    r = f(p, q, hn + 1 / 3);
    g = f(p, q, hn);
    b = f(p, q, hn - 1 / 3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

function hslToRgb(h: number, s: number, l: number): string {
  const { r, g, b } = hslToRgbVals(h, s, l);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * 다크 모드 시간표 셀 — 강의색 hue만 유지하고 채도·명도를 다크 전용으로 재구성.
 *
 * 라이트 파스텔(채도 13~22%·명도 95+)을 "곱하기/섞기"로 다크화하면 채도가 죽어
 * 전부 휘도 ~140의 회갈색 한 덩어리로 수렴한다("진흙"). 대신 hue만 뽑아
 * 채도 44%·명도 ~31%로 **다시 칠한다** → Apple Calendar 다크처럼 또렷하되 차분.
 *
 * 명도는 hue band별 지각 보정(녹/청록/노랑은 밝게 보여 낮추고, 청/보라는 어두워 올림)으로
 * 9개 강의가 고르게 보이게. 흰 텍스트 대비 7:1+ 확보(WCAG AA, 큰 텍스트 AAA).
 */
export function courseTintDark(name: string, color?: string | null): string {
  const { h } = rgbToHsl(courseRgb(name, color));
  const lAdjust =
    h >= 70 && h <= 200
      ? -5 // green~cyan (눈에 밝음)
      : h >= 40 && h < 70
        ? -6 // yellow/butter
        : h >= 210 && h <= 290
          ? 4 // blue~violet (눈에 어두움)
          : 0; // red/pink/orange 기준
  return hslToRgb(h, 44, 31 + lAdjust);
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
 * 다크 카드 좌→우 wash — 강의 hue 기반 진한 색을 좌측에서 풍부하게, 우측으로 풀어
 * 거의 검정인 다크 카드에 강의 색 정체성을 입힌다.
 *
 * 라이트용 courseLinearGradient는 파스텔 alpha 0.28 → 검정 카드 위에선 안 보여
 * 모든 카드가 같은 회색으로 죽음. 셀(courseTintDark)과 동일 철학으로 hue만 뽑아
 * 채도 높은 색(S40·L26)을 alpha로 좌측 0.9 → 우측 0으로 흘려 "한 방울 떨군 잉크".
 */
export function courseLinearGradientDark(name: string, color?: string | null): string {
  const { h } = rgbToHsl(courseRgb(name, color));
  const { r, g, b } = hslToRgbVals(h, 40, 26);
  return `linear-gradient(90deg, rgba(${r}, ${g}, ${b}, 0.85) 0%, rgba(${r}, ${g}, ${b}, 0.32) 38%, rgba(${r}, ${g}, ${b}, 0) 100%)`;
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
