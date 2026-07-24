export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface KstParts {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
}

export function kstParts(value: string | number | Date): KstParts {
  const instant = value instanceof Date ? value.getTime() : new Date(value).getTime();
  const shifted = new Date(instant + KST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

export function kstDateKey(value: string | number | Date): string {
  const part = kstParts(value);
  return `${part.year}-${pad(part.month)}-${pad(part.day)}`;
}

export function kstTimeLabel(value: string | number | Date): string {
  const part = kstParts(value);
  return `${pad(part.hour)}:${pad(part.minute)}`;
}

export function dateKeyToDayNumber(dateKey: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return Number.NaN;
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS);
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const dayNumber = dateKeyToDayNumber(dateKey);
  if (!Number.isFinite(dayNumber)) return dateKey;
  const date = new Date((dayNumber + days) * DAY_MS);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function weekdayOfDateKey(dateKey: string): number {
  const dayNumber = dateKeyToDayNumber(dateKey);
  if (!Number.isFinite(dayNumber)) return 0;
  return new Date(dayNumber * DAY_MS).getUTCDay();
}

export function startOfWeekDateKey(dateKey: string): string {
  return addDaysToDateKey(dateKey, -weekdayOfDateKey(dateKey));
}

export function kstDateKeyToIso(dateKey: string, time = "00:00"): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match || !timeMatch) throw new Error("잘못된 KST 날짜/시간 형식");
  const utcMs =
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(timeMatch[1]),
      Number(timeMatch[2]),
    ) - KST_OFFSET_MS;
  return new Date(utcMs).toISOString();
}

export function kstStartOfDay(value: string | number | Date = new Date()): Date {
  return new Date(kstDateKeyToIso(kstDateKey(value)));
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
