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

function mixRgb(base: RGB, tint: RGB, amount: number): RGB {
  const keep = 1 - amount;
  return {
    r: Math.round(base.r * keep + tint.r * amount),
    g: Math.round(base.g * keep + tint.g * amount),
    b: Math.round(base.b * keep + tint.b * amount),
  };
}

const DARK_TONAL_SURFACE: RGB = { r: 34, g: 39, b: 50 };

function darkHueAdjust(h: number): number {
  if (h >= 70 && h <= 200) return -6; // green~cyan is perceived brighter.
  if (h >= 40 && h < 70) return -8; // yellow/butter blooms quickly in dark mode.
  if (h >= 210 && h <= 290) return 5; // blue~violet needs a little lift.
  return 0;
}

function darkTonalRgb(name: string, color?: string | null, amount = 0.18): RGB {
  const { h, s } = rgbToHsl(courseRgb(name, color));
  if (s < 6) return DARK_TONAL_SURFACE;
  const accent = hslToRgbVals(h, 52, 54 + darkHueAdjust(h));
  return mixRgb(DARK_TONAL_SURFACE, accent, amount);
}

/**
 * 다크 모드 시간표 셀 — 강의색 hue만 유지하고 채도·명도를 다크 전용으로 재구성.
 *
 * 직접 색면을 칠하면 다크 화면에서 수업 셀이 발광해 보인다. Apple/Material 다크처럼
 * 중립 surface(#222732)에 과목 hue를 10%만 섞어, 과목 구분은 남기고 화면 전체는 차분하게.
 */
export function courseTintDark(name: string, color?: string | null): string {
  const { r, g, b } = darkTonalRgb(name, color, 0.1);
  return `rgb(${r}, ${g}, ${b})`;
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

/** 작은 과목 라벨용 다크 잉크. hue는 유지하되 어두운 카드에서 AA 대비가 나도록 재구성. */
export function courseInkColorDark(name: string, color?: string | null): string {
  const { h, s } = rgbToHsl(courseRgb(name, color));
  if (s < 6) return hslToRgb(h, 6, 74);
  return hslToRgb(h, 55, 72 + darkHueAdjust(h) * 0.5);
}

/**
 * 진한 액센트 (도트·좌측 색 bar·border) — 파스텔 hue를 살리되 채도·명도를 끌어올린다.
 *
 * 팔레트 원본은 명도 95+·채도 30 안팎의 "안개 파스텔"이라, 그대로 도트·바에 쓰면
 * 거의 흰색이라 강의 구분이 안 된다. 배경 wash(courseTint)는 연하게 두고, 정체성
 * 요소만 같은 hue로 또렷하게 — Apple Calendar가 셀은 연하게·점은 진하게 쓰는 방식.
 *
 * 채도 78%·명도 56%로 재구성(hue band별 명도 보정 — 노랑·청록은 밝아 보여 낮추고
 * 파랑·보라는 어두워 보여 올림). 라이트 카드 위에서 또렷하되 형광스럽지 않은 톤.
 */
export function courseAccentRgb(name: string, color?: string | null): RGB {
  const { h, s } = rgbToHsl(courseRgb(name, color));
  // 무채색(회색)에 가까운 색은 hue가 불안정 — 채도만 살짝 올려 회색 유지.
  if (s < 6) return hslToRgbVals(h, 6, 48);
  const lAdjust =
    h >= 40 && h <= 200
      ? -6 // yellow~cyan (눈에 밝음) → 낮춰 또렷
      : h >= 210 && h <= 290
        ? 6 // blue~violet (눈에 어두움) → 올려 균형
        : 0; // red/pink/orange 기준
  return hslToRgbVals(h, 78, 56 + lAdjust);
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
export function courseLinearGradient(name: string, color?: string | null, alpha = 0.28): string {
  const { r, g, b } = courseRgb(name, color);
  return `linear-gradient(90deg, rgba(${r}, ${g}, ${b}, ${alpha}) 0%, rgba(${r}, ${g}, ${b}, ${alpha * 0.45}) 35%, rgba(${r}, ${g}, ${b}, 0) 100%)`;
}

/**
 * 다크 카드 좌→우 wash — 강의 hue 기반 색을 좌측에서 풍부하게, 우측으로 풀어
 * 거의 검정인 다크 카드에 강의 색 정체성을 입힌다.
 *
 * ⚠️ 이전 버전(S40·L26, hue보정 없음, alpha 0.85)은 "진흙" 문제가 있었다:
 *   어두운 저채도 색을 alpha로 검정 배경(#202024)에 블렌딩하면 채도가 죽어
 *   회갈색으로 수렴한다(글로컬영어=갈색, 노작교육=진흙보라). courseTintDark 주석이
 *   경고한 바로 그 현상인데, 셀은 불투명으로 피했지만 카드는 여전히 alpha였다.
 *
 * 해결: 셀(courseTintDark)과 **동일한 또렷한 색**(S44·L31 + hue band별 지각 보정)을
 *   기반으로, 좌측을 거의 불투명(0.92)하게 깔아 검정과의 블렌딩을 최소화한다.
 *   우측으로만 풀어 "한 방울 떨군 잉크" 호흡은 유지. hue 보정으로 보라·청록도 균일.
 */
export function courseLinearGradientDark(name: string, color?: string | null): string {
  const { h, s } = rgbToHsl(courseRgb(name, color));
  if (s < 6) {
    return "linear-gradient(90deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.02) 45%, rgba(255, 255, 255, 0) 100%)";
  }
  const { r, g, b } = hslToRgbVals(h, 54, 54 + darkHueAdjust(h));
  return `linear-gradient(100deg, rgba(${r}, ${g}, ${b}, 0.2) 0%, rgba(${r}, ${g}, ${b}, 0.08) 42%, rgba(${r}, ${g}, ${b}, 0) 82%)`;
}

/**
 * hex 색 직접 받아 다크 모드 불투명 틴트. 캘린더 EventChip 등 hex만 있는 곳에서
 * courseTintDark와 동일 철학(hue 유지·채도/명도 재구성)을 적용한다.
 *
 *   bg=true  → 셀 배경용 (S44 L31+hue보정, courseTintDark와 동일)
 *   bg=false → 좌측 색 bar·아이콘용 한 단 밝게 (S55 L52) — 다크 배경에서 또렷한 액센트
 * hex 파싱 실패하면 cobalt 폴백.
 */
export function hexTintDark(hex: string, bg = true): string {
  const parsed = parseHex(hex) ?? { r: 122, g: 166, b: 214 };
  const { h } = rgbToHsl(parsed);
  if (bg) {
    const accent = hslToRgbVals(h, 52, 54 + darkHueAdjust(h));
    const { r, g, b } = mixRgb(DARK_TONAL_SURFACE, accent, 0.1);
    return `rgb(${r}, ${g}, ${b})`;
  }
  return hslToRgb(h, 55, 58);
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
