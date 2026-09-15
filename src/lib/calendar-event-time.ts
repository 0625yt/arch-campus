import { KST_OFFSET_MS, kstParts } from "./kst";

type TimeResult =
  | { ok: true; startsAt: string; endsAt: string | null }
  | { ok: false; error: string };

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-](\d{2}):(\d{2}))$/;

export function validateEventTimestamp(
  value: string,
  options: { allowDateOnly?: boolean } = {},
): string | null {
  const allowDateOnly = options.allowDateOnly ?? true;
  const dateOnly = DATE_ONLY_RE.exec(value);
  if (dateOnly) {
    if (!allowDateOnly) return "시간 일정에는 시각과 시간대가 필요해요.";
    return isValidCalendarDate(dateOnly) ? null : "존재하지 않는 날짜예요.";
  }

  const dateTime = DATE_TIME_RE.exec(value);
  if (!dateTime) return "ISO 날짜·시간 형식과 시간대가 필요해요.";
  if (!isValidCalendarDate(dateTime)) return "존재하지 않는 날짜예요.";

  const hour = Number(dateTime[4]);
  const minute = Number(dateTime[5]);
  const second = Number(dateTime[6] ?? "0");
  if (hour > 23 || minute > 59 || second > 59) return "시각이 올바르지 않아요.";

  if (dateTime[8] !== "Z") {
    const offsetHour = Number(dateTime[9]);
    const offsetMinute = Number(dateTime[10]);
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) {
      return "시간대가 올바르지 않아요.";
    }
  }

  return Number.isFinite(new Date(value).getTime()) ? null : "날짜·시간이 올바르지 않아요.";
}

export function validateEventRange(
  startsAt: string,
  endsAt: string | null,
  options: { allowDateOnly?: boolean } = {},
): string | null {
  const startFormatError = validateEventTimestamp(startsAt, options);
  if (startFormatError) return `시작 ${startFormatError}`;
  const start = new Date(startsAt).getTime();
  if (endsAt === null) return null;
  const endFormatError = validateEventTimestamp(endsAt, options);
  if (endFormatError) return `종료 ${endFormatError}`;
  const end = new Date(endsAt).getTime();
  if (end <= start) return "종료 시간은 시작 시간보다 늦어야 해요.";
  if (end - start > 366 * 24 * 60 * 60 * 1000) return "일정 기간은 1년을 넘길 수 없어요.";
  return null;
}

function isValidCalendarDate(match: RegExpExecArray): boolean {
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day
  );
}

/** 단건 수정: 시작만 옮기면 기존 길이를 보존해 종료도 같은 만큼 이동한다. */
export function resolveSingleEventTimes(opts: {
  originalStart: string;
  originalEnd: string | null;
  requestedStart?: string;
  requestedEnd?: string | null;
}): TimeResult {
  const originalStartMs = new Date(opts.originalStart).getTime();
  const requestedStartMs = opts.requestedStart
    ? new Date(opts.requestedStart).getTime()
    : originalStartMs;
  if (!Number.isFinite(originalStartMs) || !Number.isFinite(requestedStartMs)) {
    return { ok: false, error: "시작 시간이 올바르지 않아요." };
  }

  const startsAt = new Date(requestedStartMs).toISOString();
  let endsAt: string | null = opts.originalEnd;
  if (opts.requestedEnd !== undefined) {
    endsAt = opts.requestedEnd;
  } else if (opts.requestedStart && opts.originalEnd) {
    const originalEndMs = new Date(opts.originalEnd).getTime();
    if (!Number.isFinite(originalEndMs))
      return { ok: false, error: "종료 시간이 올바르지 않아요." };
    endsAt = new Date(requestedStartMs + (originalEndMs - originalStartMs)).toISOString();
  }

  const error = validateEventRange(startsAt, endsAt);
  return error ? { ok: false, error } : { ok: true, startsAt, endsAt };
}

/**
 * 반복 수업 전체 수정: 각 회차의 날짜는 유지하고 새 KST 시각만 적용한다.
 * 종료는 선택 회차에서 사용자가 만든 길이(또는 기존 길이)를 모든 회차에 동일하게 적용한다.
 */
export function resolveSeriesOccurrenceTimes(opts: {
  occurrenceStart: string;
  occurrenceEnd: string | null;
  selectedStart: string;
  selectedEnd: string | null;
  requestedStart?: string;
  requestedEnd?: string | null;
}): TimeResult {
  const startsAt = opts.requestedStart
    ? replaceKstClock(opts.occurrenceStart, opts.requestedStart)
    : opts.occurrenceStart;
  if (!startsAt) return { ok: false, error: "시작 시간이 올바르지 않아요." };

  let endsAt = opts.occurrenceEnd;
  if (opts.requestedEnd === null) {
    endsAt = null;
  } else if (opts.requestedEnd !== undefined) {
    const selectedStart = opts.requestedStart ?? opts.selectedStart;
    const duration = new Date(opts.requestedEnd).getTime() - new Date(selectedStart).getTime();
    if (!Number.isFinite(duration) || duration <= 0) {
      return { ok: false, error: "종료 시간은 시작 시간보다 늦어야 해요." };
    }
    endsAt = new Date(new Date(startsAt).getTime() + duration).toISOString();
  } else if (opts.requestedStart && opts.occurrenceEnd) {
    const duration =
      new Date(opts.occurrenceEnd).getTime() - new Date(opts.occurrenceStart).getTime();
    endsAt = new Date(new Date(startsAt).getTime() + duration).toISOString();
  }

  const error = validateEventRange(startsAt, endsAt);
  return error ? { ok: false, error } : { ok: true, startsAt, endsAt };
}

function replaceKstClock(occurrenceIso: string, desiredIso: string): string | null {
  const occurrence = kstParts(occurrenceIso);
  const desired = kstParts(desiredIso);
  if (
    ![occurrence.year, occurrence.month, occurrence.day, desired.hour, desired.minute].every(
      Number.isFinite,
    )
  ) {
    return null;
  }
  return new Date(
    Date.UTC(occurrence.year, occurrence.month - 1, occurrence.day, desired.hour, desired.minute) -
      KST_OFFSET_MS,
  ).toISOString();
}
