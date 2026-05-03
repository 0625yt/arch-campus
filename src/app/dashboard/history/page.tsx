import Link from "next/link";
import { ACTIVITIES, WEEK } from "./data";
import { HistoryView } from "./history-view";
import { Arrow, Dot, Numeral } from "@/components/primitives";
import { PageShell, PageFooter } from "@/components/page-shell";

export default function HistoryPage() {
  const wrong = ACTIVITIES.filter((a) => a.result?.tone === "bad");
  const latestWrong = wrong[0];

  return (
    <PageShell width="md">
      <header className="fade-up">
        <p className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
          약점 로그
        </p>
        <h1 className="mt-3 text-[27px] leading-[1.23] wght-700 kerning-tight text-[var(--color-fg-strong)] sm:text-[32px]">
          기록을 쌓는 이유는, 다음 시험에서 같은 걸 안 틀리기 위해서예요
        </h1>
        <p className="mt-3 max-w-[560px] text-[13.5px] leading-[1.6] wght-450 kerning-tight text-[var(--color-fg-muted)]">
          최근 문제·자료·위저드 사용 기록을 약점 중심으로 다시 꺼내볼 수 있게 정리했어요.
        </p>
      </header>

      <ThisWeek className="mt-8 fade-up fade-up-1" />

      {latestWrong && (
        <ReviewNudge
          className="mt-8 fade-up fade-up-2"
          title={latestWrong.title}
          meta={latestWrong.meta ?? "다시 확인 필요"}
          href={latestWrong.href}
        />
      )}

      <HistoryView activities={ACTIVITIES} className="mt-10 fade-up fade-up-3" />

      <PageFooter>
        활동은 본인만 볼 수 있어요. 학기 종료 후 익명 통계로만 사용돼요.
      </PageFooter>
    </PageShell>
  );
}

function ThisWeek({ className }: { className?: string }) {
  return (
    <section className={className}>
      <h2 className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
        이번 주 학습 신호
      </h2>

      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-[var(--color-line)] py-5 sm:grid-cols-4">
        <Stat
          label="연속 학습"
          value={WEEK.streak}
          unit="일"
          hint={WEEK.streak >= 3 ? "흐름 유지 중" : "오늘 다시 시작"}
        />
        <Stat
          label="푼 문제"
          value={WEEK.problemsSolved}
          unit="개"
          hint="지난주보다 +5"
        />
        <Stat
          label="정답률"
          value={Math.round(WEEK.accuracy * 100)}
          unit="%"
          hint="오답 2개 재확인"
        />
        <Stat
          label="학습 시간"
          value={WEEK.hours}
          unit="시간"
          hint="목표까지 1.5시간"
        />
      </div>

      <div className="mt-7">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
            최근 14일 리듬
          </h3>
          <span className="text-[10.5px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
            오늘 →
          </span>
        </div>
        <div className="mt-2 flex items-end gap-[3px]">
          {WEEK.contributions.map((level, i) => (
            <Bar key={i} level={level} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ReviewNudge({
  title,
  meta,
  href,
  className,
}: {
  title: string;
  meta: string;
  href: string;
  className?: string;
}) {
  return (
    <section className={className}>
      <h2 className="text-[12px] wght-560 kerning-tight text-[var(--color-fg-subtle)]">
        오늘 다시 보면 좋은 것
      </h2>
      <Link
        href={href}
        className="group mt-3 flex items-baseline gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-bg)] p-5 shadow-[var(--shadow-soft)] hover:border-[var(--color-line-strong)]"
      >
        <Dot color="var(--color-urgent)" size={6} className="translate-y-[-1px]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] wght-700 kerning-tight text-[var(--color-fg-strong)]">
            {title}
          </p>
          <p className="mt-1 text-[12.5px] wght-450 kerning-tight text-[var(--color-fg-muted)]">
            {meta}
          </p>
        </div>
        <Arrow className="text-[12px] text-[var(--color-fg-subtle)] transition-transform group-hover:translate-x-0.5" />
      </Link>
    </section>
  );
}

function Stat({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: number;
  unit: string;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-[11px] wght-500 kerning-tight text-[var(--color-fg-subtle)]">
        {label}
      </p>
      <p className="mt-2">
        <Numeral value={value} unit={unit} size="lg" />
      </p>
      {hint && (
        <p className="mt-1 text-[11px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
          {hint}
        </p>
      )}
    </div>
  );
}

function Bar({ level }: { level: number }) {
  const heights = [4, 8, 14, 22, 30];
  const h = heights[Math.min(level, 4)];
  const bg =
    level === 0
      ? "var(--color-line)"
      : `color-mix(in srgb, var(--color-fg-strong) ${level * 22}%, transparent)`;
  return (
    <span
      aria-hidden
      className="block w-2 rounded-[2px] sm:w-2.5"
      style={{ height: `${h}px`, backgroundColor: bg }}
    />
  );
}
