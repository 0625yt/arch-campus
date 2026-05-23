import type { NextConfig } from "next";

/**
 * 보안 헤더 7종 (2026-05 보안 리서치 적용).
 *
 * 각 헤더의 이유:
 *   - HSTS: HTTP 다운그레이드 차단. preload 등록 권장 (https://hstspreload.org)
 *   - X-Frame-Options DENY: clickjacking. iframe으로 우리 페이지 끼우기 금지
 *   - X-Content-Type-Options nosniff: MIME 스니핑 차단 (XSS 보조)
 *   - Referrer-Policy: 외부 사이트로 사용자 URL 일부만 전달 (개인정보 줄임)
 *   - Permissions-Policy: 카메라·마이크·위치 거부 — 우리는 이 권한 안 씀
 *   - COOP same-origin: cross-origin window opener 격리 (Spectre 류 방어)
 *   - X-DNS-Prefetch-Control on: 사용자 경험 (안전한 prefetch)
 *
 * CSP는 별도 sprint에서 nonce 기반으로 추가 — 현 단계엔 마크다운·iframe 호환성 점검 필요.
 */
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
