export interface IcalEvent {
  id: string;
  title: string;
  notes: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  location: string | null;
  recurrenceRule: string | null;
  reminderMinutes: number | null;
}

export function createIcalendar(events: IcalEvent[], generatedAt = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//arch campus//Semester Calendar//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:arch 캠퍼스",
  ];
  for (const event of events) {
    lines.push("BEGIN:VEVENT", `UID:${event.id}@arch-campus.vercel.app`);
    lines.push(`DTSTAMP:${utcDateTime(generatedAt)}`);
    if (event.allDay) {
      const start = kstDate(event.startsAt);
      const end = event.endsAt ? kstDate(event.endsAt) : addDays(start, 1);
      lines.push(
        `DTSTART;VALUE=DATE:${start}`,
        `DTEND;VALUE=DATE:${end === start ? addDays(start, 1) : end}`,
      );
    } else {
      lines.push(`DTSTART:${utcDateTime(new Date(event.startsAt))}`);
      if (event.endsAt) lines.push(`DTEND:${utcDateTime(new Date(event.endsAt))}`);
    }
    lines.push(`SUMMARY:${escapeIcalText(event.title)}`);
    if (event.notes) lines.push(`DESCRIPTION:${escapeIcalText(event.notes)}`);
    if (event.location) lines.push(`LOCATION:${escapeIcalText(event.location)}`);
    if (event.recurrenceRule && /^[A-Z0-9=;,]+$/.test(event.recurrenceRule)) {
      lines.push(`RRULE:${event.recurrenceRule}`);
    }
    if (event.reminderMinutes !== null) {
      lines.push(
        "BEGIN:VALARM",
        `TRIGGER:-PT${Math.max(0, event.reminderMinutes)}M`,
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeIcalText(event.title)} 알림`,
        "END:VALARM",
      );
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

export function escapeIcalText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function utcDateTime(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function kstDate(value: string): string {
  const date = new Date(new Date(value).getTime() + 9 * 60 * 60 * 1000);
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}

function addDays(dateKey: string, amount: number): string {
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(4, 6));
  const day = Number(dateKey.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}

function foldLine(line: string): string {
  if (line.length <= 73) return line;
  const parts: string[] = [];
  let remaining = line;
  while (remaining.length > 73) {
    parts.push(remaining.slice(0, 73));
    remaining = ` ${remaining.slice(73)}`;
  }
  parts.push(remaining);
  return parts.join("\r\n");
}
