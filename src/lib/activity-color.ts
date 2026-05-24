/**
 * Activity kind → 컬러 매핑.
 *
 * 학습 활동(요약·문제·강의계획서·발표·위저드·풀이)을 화면 간 같은 색으로 보이게 통일한다.
 * study RecentActivity, history ActivityList 등 활동이 줄로 표시되는 모든 화면에서 사용.
 *
 * 톤은 캘린더 KIND_FALLBACK_COLOR와 결 맞춤 — 같은 채도·온도의 6색.
 */

import type { Activity } from "@/lib/data/activity";

export function activityColor(kind: Activity["kind"]): string {
  switch (kind) {
    case "summarize":
      return "#7aa6d6"; // cobalt
    case "quiz":
      return "#e0445e"; // coral
    case "syllabus":
      return "#7fb38c"; // sage
    case "presentation":
      return "#7aa6d6"; // cobalt
    case "exam-cram":
      return "#e0445e"; // coral (시험 톤)
    case "report-checklist":
      return "#cca06b"; // mustard (과제 톤)
    case "chat":
      return "#a08bc4"; // mauve (AI 톤)
    case "wizard":
      return "#a08bc4"; // mauve
    case "attempt":
      return "#cca06b"; // mustard
  }
}
