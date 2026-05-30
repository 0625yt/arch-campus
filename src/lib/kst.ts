/**
 * KST(Asia/Seoul) 기준 날짜 헬퍼.
 *
 * 왜 필요한가:
 *   Vercel은 서버 timezone이 UTC. Server Component에서 `new Date().getMonth()` 같은
 *   호출은 UTC 기준이라 KST 자정 직전(UTC 15:00~23:59) 사용자에게는 "오늘"이
 *   하루 전으로 잡힘. D-day·"오늘 일정" 라벨이 통째로 어긋남.
 *
 * 처리:
 *   UTC ms에 +9시간을 더한 뒤 `getUTC*` 계열로 KST 컴포넌트를 읽음.
 *   외부 라이브러리 없이 일관 처리.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 주어진 Date의 KST 기준 연/월/일/요일을 한 번에. */
export function kstParts(date: Date = new Date()): {
  year: number;
  /** 1-12 (사용자 친화). 코드 기준의 0-11이 필요하면 `monthIndex` 사용. */
  month: number;
  monthIndex: number;
  day: number;
  /** 0=일요일, 1=월요일, ... 6=토요일. */
  weekday: number;
} {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth() + 1,
    monthIndex: kst.getUTCMonth(),
    day: kst.getUTCDate(),
    weekday: kst.getUTCDay(),
  };
}

const KST_WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** "5월 30일 금요일" 같은 KST 기준 라벨. */
export function kstDateLabel(date: Date = new Date()): string {
  const { month, day, weekday } = kstParts(date);
  return `${month}월 ${day}일 ${KST_WEEKDAY_KO[weekday]}요일`;
}

/** "오후 3시" 식의 KST 기준 시간대 라벨 (대시보드 인사말 등에서 사용). */
export function kstHour(date: Date = new Date()): number {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  return kst.getUTCHours();
}

/**
 * KST 기준 "오늘 자정" Date.
 * 두 시각이 같은 KST 날짜인지 비교할 때 기준점으로 사용.
 */
export function kstStartOfDay(date: Date = new Date()): Date {
  const { year, monthIndex, day } = kstParts(date);
  return new Date(Date.UTC(year, monthIndex, day) - KST_OFFSET_MS);
}
