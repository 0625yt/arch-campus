import type { NextConfig } from "next";

/**
 * 보안 헤더 7종 + CSP Report-Only (2026-05 보안 리서치 적용).
 *
 * 각 헤더의 이유:
 *   - HSTS: HTTP 다운그레이드 차단. preload 등록 권장 (https://hstspreload.org)
 *   - X-Frame-Options DENY: clickjacking. iframe으로 우리 페이지 끼우기 금지
 *   - X-Content-Type-Options nosniff: MIME 스니핑 차단 (XSS 보조)
 *   - Referrer-Policy: 외부 사이트로 사용자 URL 일부만 전달 (개인정보 줄임)
 *   - Permissions-Policy: 카메라·마이크·위치 거부 — 우리는 이 권한 안 씀
 *   - COOP same-origin: cross-origin window opener 격리 (Spectre 류 방어)
 *   - X-DNS-Prefetch-Control on: 사용자 경험 (안전한 prefetch)
 *   - CSP Report-Only: 일주일 violation 보고 받고 enforce 전환
 *
 * CSP 외부 자원 화이트리스트:
 *   - style-src: jsdelivr (Pretendard 폰트 CSS), 'unsafe-inline' (Tailwind v4가 인라인 스타일)
 *   - img-src: data: + supabase storage (signed URL PDF는 frame-src로)
 *   - frame-src: 우리 supabase project 도메인만 (와일드카드 X — 사용자가 다른 project로 우회 못 함)
 *   - connect-src: supabase REST·Realtime·Anthropic (모두 self+같은 도메인 또는 외부)
 *
 * SUPABASE_PROJECT_HOST: NEXT_PUBLIC_SUPABASE_URL에서 host만 뽑아 사용.
 * 빌드 시 env 없으면 와일드카드 fallback (preview 환경 깨짐 방지).
 */
const SUPABASE_PROJECT_HOST = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return "*.supabase.co"; // build-time env 없을 때만 fallback
  try {
    return new URL(url).host;
  } catch {
    return "*.supabase.co";
  }
})();

const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js dev에 필요, nonce 도입은 별도 sprint
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://cdn.jsdelivr.net",
  `frame-src 'self' https://${SUPABASE_PROJECT_HOST}`,
  // Anthropic 미리 화이트리스트 — 향후 클라이언트 streaming(useChat) 도입 시 enforce 전환에서 막히지 않게
  `connect-src 'self' https://${SUPABASE_PROJECT_HOST} wss://${SUPABASE_PROJECT_HOST} https://api.anthropic.com`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  // Report-Only — 일주일 운영 후 violation 0~소수면 'Content-Security-Policy'로 enforce 전환.
  // violation은 브라우저 콘솔에서 즉시 확인 가능 (report-uri 별도 설정 안 함).
  { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
];

const nextConfig: NextConfig = {
  // dev 좌하단 N 인디케이터가 사이드바 푸터 아바타와 겹쳐서 끔
  devIndicators: false,

  // X-Powered-By: Next.js 헤더 제거 — 정보 노출 최소화
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
