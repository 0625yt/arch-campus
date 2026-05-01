import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "arch — 한 학기를 5분 안에",
  description: "강의자료와 강의계획서를 넣으면 오늘 할 일을 정리해주는 AI",
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
