import Link from "next/link";

const OPTIONS = [
  ["", "알림 없음"],
  ["0", "시작 시각"],
  ["10", "10분 전"],
  ["30", "30분 전"],
  ["60", "1시간 전"],
  ["1440", "1일 전"],
  ["4320", "3일 전"],
  ["10080", "7일 전"],
];

export function ReminderField({
  value,
  onChange,
  allDay,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  allDay: boolean;
}) {
  return (
    <div className="border-t border-[var(--color-apple-hairline-soft)] py-2.5">
      <select
        aria-label="일정 알림 시각"
        value={value ?? ""}
        onChange={(event) =>
          onChange(event.target.value === "" ? null : Number(event.target.value))
        }
        className="min-h-11 w-full border-0 bg-transparent text-[13.5px] text-[var(--color-apple-ink)]"
      >
        {value !== null && !OPTIONS.some(([v]) => v === String(value)) && (
          <option value={value}>{value}분 전</option>
        )}
        {OPTIONS.map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
      {value !== null && (
        <p className="mt-1 text-[11px] leading-[1.5] text-[var(--color-apple-muted)]">
          <Link href="/dashboard/settings" className="underline underline-offset-2">
            설정에서 이 브라우저 알림을 켜 주세요.
          </Link>
          {allDay && " 종일 일정은 해당 날짜 0시 기준이에요."}
        </p>
      )}
    </div>
  );
}
