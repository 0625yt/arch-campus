import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "arch — 대학 생활을 놓치지 않게",
  description:
    "강의자료, 강의계획서, 시간표를 올려 오늘 할 일과 공부 흐름을 정리하는 대학생 캠퍼스",
};

/**
 * 모바일 viewport — Next.js 16 viewport export 패턴.
 *
 * - width=device-width + initialScale=1: 디바이스 폭 그대로 매핑.
 * - maximumScale=1·userScalable=false: iOS Safari가 input focus 시 자동 줌하는 동작 차단.
 *   (16px 미만 입력칸 + 자동 줌 = 사용자 폭 갑자기 800px처럼 변함 → 레이아웃 폭주)
 *   대신 본문은 충분히 큰 폰트로 만들어 접근성 보완.
 * - viewportFit=cover: iOS 노치·홈 인디케이터 영역까지 사용. safe-area-inset-* CSS로 안전 영역 확보.
 *   (이 옵션 없으면 env(safe-area-inset-*) 값이 0 — 모바일 nav가 노치에 가림)
 * - themeColor: 모바일 상단 상태바 색상. surface-canvas와 일치.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#fafafa",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased" data-scroll-behavior="smooth">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
