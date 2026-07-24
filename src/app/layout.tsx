import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://arch-campus.vercel.app"),
  title: {
    default: "arch — 대학 생활을 놓치지 않게",
    template: "%s · arch",
  },
  description:
    "강의계획서에서 시험·과제 일정을 찾고, 강의자료를 요약·문제·오답 복습으로 이어주는 대학생 학습 도구.",
  applicationName: "arch",
  authors: [{ name: "arch" }],
  keywords: [
    "대학생",
    "학기 관리",
    "강의자료 정리",
    "시간표",
    "AI 학습 보조",
    "독후감",
    "발표 자료",
    "보고서",
  ],
  // Next.js 16 — src/app/icon.svg·apple-icon.svg가 자동으로 favicon·apple-touch-icon으로 wiring.
  // 아래 명시는 일부 구버전 브라우저·서버 사이드 파서 안전망.
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-icon.svg", sizes: "180x180", type: "image/svg+xml" }],
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "https://arch-campus.vercel.app",
    siteName: "arch",
    title: "arch — 대학 생활을 놓치지 않게",
    description:
      "강의계획서에서 시험·과제 일정을 찾고, 강의자료를 요약·문제·오답 복습으로 이어줍니다.",
    images: [
      {
        url: "/opengraph-image.svg",
        width: 1200,
        height: 630,
        alt: "arch — 마감은 놓치지 않고, 시험공부는 미루지 않게",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "arch — 대학 생활을 놓치지 않게",
    description: "강의계획서에서 일정을 찾고, 강의자료를 문제·복습으로",
    images: ["/opengraph-image.svg"],
  },
};

/**
 * 모바일 viewport — Next.js 16 viewport export 패턴.
 *
 * - width=device-width + initialScale=1: 디바이스 폭 그대로 매핑.
 * - 확대 제한을 두지 않아 필요한 사용자가 핀치 줌을 사용할 수 있게 함.
 * - viewportFit=cover: iOS 노치·홈 인디케이터 영역까지 사용. safe-area-inset-* CSS로 안전 영역 확보.
 *   (이 옵션 없으면 env(safe-area-inset-*) 값이 0 — 모바일 nav가 노치에 가림)
 * - themeColor: 모바일 상단 상태바 색상. surface-canvas와 일치.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fafafa",
};

/**
 * Theme bootstrap — hydration 전에 localStorage 읽어 dataset에 박는 inline script.
 * React state로 처리하면 first paint = light → CSR = dark 깜빡임이 보임.
 * dangerouslySetInnerHTML로 raw script 11줄.
 *
 * data-theme="dark"는 globals.css의 html[data-theme="dark"] 블록을 활성화.
 * 무지정이면 :root 라이트 토큰 그대로.
 */
const themeBootstrap = `
(function() {
  try {
    var t = localStorage.getItem('arch-theme');
    if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className="h-full antialiased"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: theme bootstrap pre-hydration */}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
