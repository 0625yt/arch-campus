/**
 * 시간표 그리드용 변환기.
 *
 * courses.schedule은 한국어 표시 문자열 배열로 DB에 저장됨:
 *   ["월 09:00-10:50", "수 09:00-10:50"]
 *
 * 시간표 그리드를 그리려면 이걸 weekday + 시작/끝 분 단위로 다시 파싱해야 함.
 * services/timetable의 expandWeekly는 학기 전체 이벤트 expand용이고, 여기는
 * dashboard 뷰의 빠른 in-memory 변환.
 */

export type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

const KO_TO_WEEKDAY: Record<string, Weekday> = {
  월: "MON",
  화: "TUE",
  수: "WED",
  목: "THU",
  금: "FRI",
  토: "SAT",
  일: "SUN",
};

export interface ParsedSlot {
  weekday: Weekday;
  /** 분 단위 (00:00=0, 09:00=540). */
  startMinute: number;
  endMinute: number;
  startLabel: string;
  endLabel: string;
}

const SLOT_RE = /^([월화수목금토일])\s+(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/;

/** 단일 문자열 → ParsedSlot. 형식 안 맞으면 null. */
export function parseScheduleString(s: string): ParsedSlot | null {
  const m = SLOT_RE.exec(s.trim());
  if (!m) return null;
  const weekday = KO_TO_WEEKDAY[m[1]];
  if (!weekday) return null;
  const sh = Number.parseInt(m[2], 10);
  const sm = Number.parseInt(m[3], 10);
  const eh = Number.parseInt(m[4], 10);
  const em = Number.parseInt(m[5], 10);
  const startMinute = sh * 60 + sm;
  const endMinute = eh * 60 + em;
  if (endMinute <= startMinute) return null;
  return {
    weekday,
    startMinute,
    endMinute,
    startLabel: `${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}`,
    endLabel: `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`,
  };
}

export interface CourseSlot {
  courseId: string;
  courseName: string;
  professor: string | null;
  location: string | null;
  color: string | null;
  slot: ParsedSlot;
}

export interface TimetableData {
  slots: CourseSlot[];
  /** 그리드 표시 범위 — 가장 이른 강의~가장 늦은 강의 (1시간 단위 round). */
  hourStart: number;
  hourEnd: number;
  /** 강의 있는 요일만 (요일 순). */
  activeWeekdays: Weekday[];
}

const WEEKDAY_ORDER: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export interface CourseLike {
  id: string;
  name: string;
  professor: string | null;
  location?: string | null;
  color: string | null;
  schedule: string[] | null;
}

/**
 * courses 배열 → 시간표 그리드 데이터.
 * schedule이 비었거나 못 파싱하는 강의는 자동 제외.
 */
export function buildTimetable(courses: CourseLike[]): TimetableData {
  const slots: CourseSlot[] = [];
  for (const c of courses) {
    if (!c.schedule || c.schedule.length === 0) continue;
    for (const raw of c.schedule) {
      const parsed = parseScheduleString(raw);
      if (!parsed) continue;
      slots.push({
        courseId: c.id,
        courseName: c.name,
        professor: c.professor,
        location: c.location ?? null,
        color: c.color,
        slot: parsed,
      });
    }
  }
  if (slots.length === 0) {
    return { slots: [], hourStart: 9, hourEnd: 18, activeWeekdays: [] };
  }
  const minMin = Math.min(...slots.map((s) => s.slot.startMinute));
  const maxMin = Math.max(...slots.map((s) => s.slot.endMinute));
  const hourStart = Math.floor(minMin / 60);
  const hourEnd = Math.ceil(maxMin / 60);
  const present = new Set(slots.map((s) => s.slot.weekday));
  const activeWeekdays = WEEKDAY_ORDER.filter((w) => present.has(w));
  return { slots, hourStart, hourEnd, activeWeekdays };
}

const WEEKDAY_TO_JS_DAY: Record<Weekday, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
};

/** KST 기준 "지금 진행 중" 슬롯 + "오늘 다음" 슬롯. dashboard now-glow용. */
export function findNowAndNext(
  data: TimetableData,
  now: Date = new Date(),
): { current: CourseSlot | null; next: CourseSlot | null } {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const jsDay = kst.getUTCDay();
  const nowMin = kst.getUTCHours() * 60 + kst.getUTCMinutes();

  let current: CourseSlot | null = null;
  let next: CourseSlot | null = null;
  let nextStartGap = Number.POSITIVE_INFINITY;

  for (const s of data.slots) {
    if (WEEKDAY_TO_JS_DAY[s.slot.weekday] !== jsDay) continue;
    if (nowMin >= s.slot.startMinute && nowMin < s.slot.endMinute) {
      current = s;
    } else if (s.slot.startMinute > nowMin) {
      const gap = s.slot.startMinute - nowMin;
      if (gap < nextStartGap) {
        nextStartGap = gap;
        next = s;
      }
    }
  }
  return { current, next };
}

/** weekday → "월", "화" 한국어 1글자 라벨. */
export function weekdayKoShort(w: Weekday): string {
  switch (w) {
    case "MON":
      return "월";
    case "TUE":
      return "화";
    case "WED":
      return "수";
    case "THU":
      return "목";
    case "FRI":
      return "금";
    case "SAT":
      return "토";
    case "SUN":
      return "일";
  }
}

/** weekday가 KST 기준 오늘인지. */
export function isKstToday(w: Weekday, now: Date = new Date()): boolean {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return WEEKDAY_TO_JS_DAY[w] === kst.getUTCDay();
}

/** next 슬롯 시작까지 남은 분 (KST 기준). 음수면 이미 시작함. */
export function minutesUntilSlot(slot: CourseSlot, now: Date = new Date()): number {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const nowMin = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  return slot.slot.startMinute - nowMin;
}

/** 남은 분 → "41분 후" / "1시간 20분 후". 한국어 명사형. */
export function formatUntil(min: number): string {
  if (min < 60) return `${min}분 후`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}시간 후` : `${h}시간 ${m}분 후`;
}
