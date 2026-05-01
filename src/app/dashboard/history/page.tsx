import { ACTIVITIES, WEEK } from "./data";
import { HistoryView } from "./history-view";
import { Numeral } from "@/components/primitives";
import {
  PageShell,
  PageHint,
  PageTitle,
  PageFooter,
} from "@/components/page-shell";

export default function HistoryPage() {
  return (
    <PageShell width="md">
      <PageHint>
        지금까지 푼 문제·만든 자료를 다시 찾아볼 수 있어요
      </PageHint>

      <PageTitle className="mt-6">히스토리</PageTitle>

      <ThisWeek className="mt-10 fade-up fade-up-2" />

      <HistoryView activities={ACTIVITIES} className="mt-12 fade-up fade-up-3" />

      <PageFooter>
        활동은 본인만 볼 수 있어요. 학기 종료 후 익명 통계로만 사용돼요.
      </PageFooter>
    </PageShell>
  );
}

function ThisWeek({ className }: { className?: string }) {
  return (
    <section className={className}>
      <h2 className="text-[12px] wght-560 kerning-mono uppercase text-[var(--color-fg-subtle)]">
        이번 주
      </h2>

      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-[var(--color-line)] pt-5 sm:grid-cols-4">
        <Stat
          label="연속 학습"
          value={WEEK.streak}
          unit="일"
          hint={WEEK.streak >= 3 ? "잘 가고 있어요" : "오늘 시작해볼까요"}
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
          hint="학기 평균 72%"
        />
        <Stat
          label="학습 시간"
          value={WEEK.hours}
          unit="시간"
          hint="목표 8시간"
        />
      </div>

      {/* contributions 그래프 */}
      <div className="mt-7">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[10.5px] wght-700 kerning-mono uppercase text-[var(--color-fg-subtle)]">
            최근 14일
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
        <div className="mt-2 flex items-center justify-end gap-1.5 text-[10px] wght-450 kerning-mono text-[var(--color-fg-subtle)]">
          <span>적음</span>
          {[0, 1, 2, 3, 4].map((l) => (
            <span
              key={l}
              className="h-2 w-2 rounded-[2px]"
              style={{
                backgroundColor:
                  l === 0
                    ? "var(--color-line)"
                    : `color-mix(in srgb, var(--color-fg-strong) ${l * 22}%, transparent)`,
              }}
            />
          ))}
          <span>많음</span>
        </div>
      </div>
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
      <p className="text-[10.5px] wght-700 kerning-mono uppercase text-[var(--color-fg-subtle)]">
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
