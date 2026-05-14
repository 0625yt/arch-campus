/**
 * 한국 학기 자동 추정 — 강의계획서에 학기가 명시 안 됐을 때 fallback.
 *
 * 봄학기(1학기): 3월 ~ 8월 (전반)
 * 가을학기(2학기): 9월 ~ 2월 (후반)
 *
 * 9~12월 = 그 해 가을학기, 1~2월 = 전년도 가을학기 (학사 일정상)
 * 3~8월 = 그 해 봄학기.
 */

export type SemesterTerm = "spring" | "fall";

export interface InferredSemester {
  year: number;
  term: SemesterTerm;
  label: string; // 예: "2026 봄학기"
  /** 학기 첫날 (ISO date, YYYY-MM-DD) — 한국 학사 일정 기준 추정 */
  termStart: string;
  /** 학기 마지막날 (ISO date) — 보통 15주차 종강 + 시험 1주 */
  termEnd: string;
}

export function inferSemester(now: Date = new Date()): InferredSemester {
  const m = now.getMonth() + 1; // 1~12
  const y = now.getFullYear();

  if (m >= 3 && m <= 8) {
    // 봄학기: 3월 첫 월요일 ~ 6월 말 (시험 1주 포함). 확실치 않으면 살짝 더 길게.
    return {
      year: y,
      term: "spring",
      label: `${y} 봄학기`,
      termStart: `${y}-03-01`,
      termEnd: `${y}-06-30`,
    };
  }
  if (m >= 9) {
    return {
      year: y,
      term: "fall",
      label: `${y} 가을학기`,
      termStart: `${y}-09-01`,
      termEnd: `${y}-12-31`,
    };
  }
  // 1~2월 = 전년도 가을학기
  return {
    year: y - 1,
    term: "fall",
    label: `${y - 1} 가을학기`,
    termStart: `${y - 1}-09-01`,
    termEnd: `${y - 1}-12-31`,
  };
}
