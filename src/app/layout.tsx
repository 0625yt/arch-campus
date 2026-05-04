import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "arch — 대학 생활을 놓치지 않게",
  description: "강의계획서, 공지, 과제, 팀플 신호를 모아 지금 할 일을 정리하는 대학 생활 AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
