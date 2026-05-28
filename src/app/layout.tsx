import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "arch — 대학 생활을 놓치지 않게",
  description:
    "강의자료, 강의계획서, 시간표를 올려 오늘 할 일과 공부 흐름을 정리하는 대학생 캠퍼스",
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
