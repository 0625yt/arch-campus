import type { MetadataRoute } from "next";

/**
 * PWA manifest — 모바일 홈 화면에 추가하면 standalone 앱처럼.
 * theme_color는 status bar tint, background_color는 첫 paint 색.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "arch — 대학 생활을 놓치지 않게",
    short_name: "arch",
    description:
      "강의자료·강의계획서·시간표를 올리면 오늘 할 일과 공부 흐름을 자동으로 정리하는 한국 대학생 학기 운영 OS.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#0071E3",
    orientation: "portrait",
    lang: "ko",
    categories: ["education", "productivity"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/apple-icon.svg",
        sizes: "180x180",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
