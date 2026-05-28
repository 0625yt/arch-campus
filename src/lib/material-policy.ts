/**
 * 자료 type에 따른 처리 분기 정책 — 모든 곳에서 동일 답을 내게 하는 단일 출처.
 *
 * 왜 별도 모듈인가:
 *   - "type=exam이면 요약 X, 기출 추출" 같은 분기가 page·service·prompt 세 곳에 흩어지면
 *     한 곳만 손대고 다른 곳이 어긋날 가능성 큼
 *   - 자동 기본 스타일 추천(C-2)도 type+과목 두 입력을 받아 추천하는 룰이라 한 곳에 모음
 *
 * 새 type 추가 시 여기 하나만 수정 → page/service/prompt 모두 자동 반영.
 */

import type { Database } from "@/lib/supabase/types";
import type { SubjectArea } from "./subject-detector";

export type MaterialType = Database["public"]["Tables"]["materials"]["Row"]["type"];

/**
 * 자료가 들어왔을 때 우리가 무엇을 해야 하는가:
 *  - summarize  : 일반 학습자료. AI가 요약 생성.
 *  - extract-exam : PDF 본문에 이미 있는 기출문제·정답을 그대로 추출 (새 생성 X).
 *  - lite       : 요약·추출 둘 다 안 함. 자료를 그대로 보여줌 (공지·팀플처럼 짧은 텍스트).
 */
export type MaterialMode = "summarize" | "extract-exam" | "lite";

/**
 * 요약 스타일 6종 — 학생이 매번 선택. 자동 기본은 type+과목에서 추천.
 *  - memorize  : 키워드·정의 카드 (암기, 시험 직전용)
 *  - understand: 흐름·인과관계 (이해, 개념 처음 잡을 때)
 *  - calculate : 공식·풀이 단계 (계산, 수학·물리·화학)
 *  - analyze   : 자료 해석·근거 (분석, 인문·사회)
 *  - mindmap   : 토픽 트리 (마인드맵, 전체 구조 잡기)
 *  - core      : 정의·중요도★ 리스트 (핵심 개념만 빠르게)
 */
export type SummaryStyle = "memorize" | "understand" | "calculate" | "analyze" | "mindmap" | "core";

export interface MaterialPolicy {
  mode: MaterialMode;
  label: string;
  /** 자료 상세 페이지 hero 톤 컬러 (이번 sprint는 그냥 메타. 향후 카드 ribbon에 사용 가능). */
  accentColor: string;
}

const POLICIES: Record<MaterialType, MaterialPolicy> = {
  lecture: { mode: "summarize", label: "강의자료", accentColor: "#7aa6d6" },
  exam: { mode: "extract-exam", label: "기출문제", accentColor: "#e0445e" },
  assignment: { mode: "summarize", label: "과제", accentColor: "#cca06b" },
  team: { mode: "lite", label: "팀플", accentColor: "#7fb38c" },
  syllabus: { mode: "summarize", label: "강의계획서", accentColor: "#a08bc4" },
  notice: { mode: "lite", label: "공지", accentColor: "#5a6470" },
};

export function getMaterialPolicy(type: MaterialType): MaterialPolicy {
  return POLICIES[type];
}

/**
 * 요약 스타일 자동 기본 — type + 과목에서 추천 2~3개.
 *
 * 의도: 학생이 자료 열자마자 그 자료에 맞는 톤이 첫 화면에 떠 있어야 마찰이 적음.
 * 마음에 안 들면 chip 토글로 즉시 변경 가능.
 *
 * 룰은 사용자가 합의한 표 그대로 (2026-05-23):
 *   - 강의자료 + 수학/물리 → [이해, 계산, 마인드맵]
 *   - 강의자료 + 영어/일본어/중국어 → [핵심 개념, 마인드맵]
 *   - 강의자료 + 인문/사회 → [이해, 분석, 마인드맵]
 *   - 강의자료 + 컴공 → [이해, 계산, 마인드맵]
 *   - 강의자료 + 기본값 → [이해, 핵심 개념]
 *   - 공지 → [핵심 개념]
 *   - 과제 → [핵심 개념, 분석]
 *   - 팀플 → [이해]
 *   - 강의계획서 → [핵심 개념] (별도 syllabus 추출 흐름은 그대로 유지)
 *   - 기출 → 빈 배열 (extract-exam으로 분기)
 */
export function getDefaultStyles(type: MaterialType, subject: SubjectArea): SummaryStyle[] {
  if (type === "exam") return []; // extract-exam 분기 — 요약 안 함
  if (type === "notice") return ["core"];
  if (type === "assignment") return ["core", "analyze"];
  if (type === "team") return ["understand"];
  if (type === "syllabus") return ["core"];

  // lecture — 과목별 분기
  switch (subject) {
    case "math":
    case "physics":
    case "chemistry":
      return ["understand", "calculate", "mindmap"];
    case "english":
    case "japanese":
    case "chinese":
      return ["core", "mindmap"];
    case "humanities":
      return ["understand", "analyze", "mindmap"];
    case "cs":
      return ["understand", "calculate", "mindmap"];
    case "biology":
      return ["understand", "mindmap"];
    default:
      return ["understand", "core"];
  }
}

/**
 * 스타일 코드 → 한국어 라벨. UI chip·summarize 프롬프트의 "요청된 스타일: …" 라인에 사용.
 */
export const STYLE_LABEL: Record<SummaryStyle, string> = {
  memorize: "암기",
  understand: "이해",
  calculate: "계산",
  analyze: "분석",
  mindmap: "마인드맵",
  core: "핵심 개념",
};

/**
 * UI chip 정렬 순서 — 학생이 화면에서 항상 같은 자리에 보이게.
 */
export const STYLE_ORDER: readonly SummaryStyle[] = [
  "core",
  "understand",
  "calculate",
  "analyze",
  "memorize",
  "mindmap",
] as const;

/**
 * UI에서 최대 동시 선택 가능한 스타일 수.
 * 4개 초과 선택 시 출력 토큰 한도(6144)에 근접해 잘림 위험.
 */
export const MAX_STYLES_PER_REQUEST = 4;
