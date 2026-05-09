import Link from "next/link";
import { ACTIVITIES, WEEK } from "./data";
import { HistoryView } from "./history-view";

export default function HistoryPage() {
  const wrong = ACTIVITIES.filter((a) => a.result?.tone === "bad");
  const latestWrong = wrong[0];

  return (
    <div className="bg-[var(--color-apple-pearl)]">
      <div className="mx-auto w-full max-w-[1080px] px-6 pb-24 pt-8 sm:px-10 sm:pb-28 sm:pt-12 md:px-12">
        {/* Top bar */}
        <header className="fade-up flex items-baseline justify-between gap-3">
          <p
            className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            기록
          </p>
          <Link
            href="/dashboard"
            className="group inline-flex items-baseline text-[12px] wght-450 text-[var(--color-apple-action)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            <span className="border-b border-transparent group-hover:border-[var(--color-apple-action)]">
              내 캠퍼스
            </span>
            <span className="ml-0.5">›</span>
          </Link>
        </header>

        {/* Hero */}
        <header className="mt-10 fade-up fade-up-1 sm:mt-14">
          <h1
            className="max-w-[820px] text-[34px] leading-[1.07] wght-620 text-[var(--color-apple-ink)] sm:text-[48px] md:text-[56px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            지나온 흔적이{" "}
            <span className="text-[var(--color-apple-muted)]">다음 시험을 만들어요.</span>
          </h1>
          <p
            className="mt-4 max-w-[600px] text-[15px] leading-[1.55] wght-450 text-[var(--color-apple-muted)] sm:text-[17px] sm:leading-[1.5]"
            style={{ letterSpacing: "-0.022em" }}
          >
            최근 문제·자료·위저드 사용 기록을 약점 중심으로 다시 꺼내볼 수 있게 정리했어요.
          </p>
        </header>

        {/* 이번 주 신호 — Bento */}
        <ThisWeekBento className="mt-12 fade-up fade-up-2 sm:mt-14" />

        {/* 다시 보면 좋은 것 */}
        {latestWrong && (
          <ReviewNudge
            className="mt-14 fade-up fade-up-3 sm:mt-16"
            title={latestWrong.title}
            meta={latestWrong.meta ?? "다시 확인 필요"}
            href={latestWrong.href}
          />
        )}

        {/* 검색·필터·리스트 */}
        <section className="mt-14 fade-up fade-up-4 sm:mt-16">
          <h2
            className="text-[24px] leading-[1.1] wght-620 text-[var(--color-apple-ink)] sm:text-[28px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            전체 기록.
          </h2>
          <HistoryView activities={ACTIVITIES} className="mt-6" />
        </section>
      </div>
    </div>
  );
}

/* ──────────── 이번 주 Bento ──────────── */

function ThisWeekBento({ className }: { className?: string }) {
  const accuracyPct = Math.round(WEEK.accuracy * 100);

  return (
    <section className={className}>
      <h2 className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
        이번 주
      </h2>

      <div className="mt-6 grid gap-4 md:grid-cols-3 md:gap-5">
        {/* 큰 — 14일 리듬 */}
        <div className="md:col-span-2">
          <div className="flex h-full min-h-[220px] flex-col justify-between rounded-[18px] bg-white p-7 sm:p-8">
            <div>
              <p
                className="text-[13px] wght-560"
                style={{ letterSpacing: "-0.012em", color: "var(--color-apple-streak)" }}
              >
                연속 학습
              </p>
              <h3
                className="mt-3 text-[44px] leading-[1.0] wght-620 text-[var(--color-apple-ink)] sm:text-[56px]"
                style={{ letterSpacing: "-0.024em" }}
              >
                {WEEK.streak}일째.
              </h3>
              <p
                className="mt-3 max-w-[440px] text-[14px] leading-[1.5] wght-450 text-[var(--color-apple-muted)]"
                style={{ letterSpacing: "-0.022em" }}
              >
                이번 주 {WEEK.hours}시간 공부했어요. 지난주보다 1시간 30분 더 했어요.
              </p>
            </div>

            {/* 14일 막대 */}
            <div className="mt-6 flex items-end gap-1.5">
              {WEEK.contributions.map((level, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-[3px]"
                  style={{
                    backgroundColor:
                      level >= 4
                        ? "var(--color-apple-streak)"
                        : level >= 3
                          ? "rgba(255, 149, 0, 0.7)"
                          : level >= 2
                            ? "rgba(255, 149, 0, 0.4)"
                            : level >= 1
                              ? "rgba(255, 149, 0, 0.2)"
                              : "var(--color-apple-hairline)",
                    height: `${10 + level * 8}px`,
                  }}
                />
              ))}
            </div>
            <p
              className="mt-2 text-[11px] wght-450 text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              ← 14일 전 오늘 →
            </p>
          </div>
        </div>

        {/* 작은 — 정답률 + 푼 문제 */}
        <div className="grid gap-4 md:gap-5">
          <div className="flex min-h-[100px] flex-col justify-between rounded-[18px] bg-white p-6">
            <p
              className="text-[12px] wght-560"
              style={{ letterSpacing: "-0.012em", color: "var(--color-apple-success)" }}
            >
              정답률
            </p>
            <div className="flex items-baseline gap-1">
              <span
                className="text-[36px] leading-none wght-620 text-[var(--color-apple-ink)] tabular-nums"
                style={{ letterSpacing: "-0.024em" }}
              >
                {accuracyPct}
              </span>
              <span
                className="text-[18px] wght-450 text-[var(--color-apple-muted)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                %
              </span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--color-apple-hairline)]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${accuracyPct}%`,
                  backgroundColor: "var(--color-apple-success)",
                }}
              />
            </div>
          </div>

          <div className="flex min-h-[100px] flex-col justify-between rounded-[18px] bg-white p-6">
            <p
              className="text-[12px] wght-560"
              style={{ letterSpacing: "-0.012em", color: "var(--color-apple-action)" }}
            >
              푼 문제
            </p>
            <div className="flex items-baseline gap-1">
              <span
                className="text-[36px] leading-none wght-620 text-[var(--color-apple-ink)] tabular-nums"
                style={{ letterSpacing: "-0.024em" }}
              >
                {WEEK.problemsSolved}
              </span>
              <span
                className="text-[14px] wght-450 text-[var(--color-apple-muted)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                개
              </span>
            </div>
            <p
              className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              지난주보다 +5
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ──────────── 다시 보면 좋은 것 ──────────── */

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
      <h2 className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
        오늘 다시 보면 좋은 것
      </h2>
      <Link
        href={href}
        className="group mt-6 flex items-center gap-4 rounded-[18px] bg-white p-7 transition-transform duration-200 hover:-translate-y-0.5 sm:p-8"
      >
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-urgent)]" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-urgent)]">
            오답
          </p>
          <p
            className="mt-1 truncate text-[18px] leading-[1.3] wght-620 text-[var(--color-apple-ink)] sm:text-[20px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {title}
          </p>
          <p
            className="mt-1 truncate text-[13px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.022em" }}
          >
            {meta}
          </p>
        </div>
        <span className="shrink-0 text-[15px] text-[var(--color-apple-muted)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--color-apple-action)]">
          ›
        </span>
      </Link>
    </section>
  );
}
