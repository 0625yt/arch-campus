import Link from "next/link";
import { redirect } from "next/navigation";
import { tryGetOwnerId } from "@/lib/auth";
import { getRecentActivities, type Activity } from "@/lib/data/activity";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  const activities = await getRecentActivities({ ownerId, limit: 50 });

  return (
    <div className="bg-[var(--color-apple-pearl)]">
      <div className="mx-auto w-full max-w-[1080px] px-6 pb-24 pt-8 sm:px-10 sm:pb-28 sm:pt-12 md:px-12">
        <Header />
        {activities.length === 0 ? (
          <Empty className="mt-10 fade-up fade-up-1 sm:mt-14" />
        ) : (
          <ActivityList activities={activities} className="mt-10 fade-up fade-up-2 sm:mt-14" />
        )}
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="fade-up flex items-baseline justify-between gap-3">
      <div>
        <p
          className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          기록
        </p>
        <h1
          className="mt-3 text-[34px] leading-[1.07] wght-620 text-[var(--color-apple-ink)] sm:text-[44px] md:text-[52px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          학습 활동.
        </h1>
      </div>
      <Link
        href="/dashboard"
        className="group inline-flex items-baseline text-[12px] wght-450 text-[var(--color-apple-action)]"
      >
        <span className="border-b border-transparent group-hover:border-[var(--color-apple-action)]">
          내 캠퍼스
        </span>
        <span className="ml-0.5">›</span>
      </Link>
    </header>
  );
}

function Empty({ className }: { className?: string }) {
  return (
    <section className={className}>
      <div className="rounded-[18px] bg-white px-7 py-16 text-center sm:py-20">
        <p
          className="text-[20px] wght-620 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          아직 활동 기록이 없어요
        </p>
        <p className="mx-auto mt-3 max-w-[440px] text-[14px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]">
          자료를 올리고 요약·문제를 만들면 여기에 시간순으로 쌓여요.
        </p>
        <Link
          href="/dashboard/study"
          className="mt-7 inline-flex h-[44px] items-center rounded-full bg-[var(--color-apple-action)] px-6 text-[14px] wght-560 text-white transition-all hover:bg-[var(--color-apple-action-hover)]"
        >
          공부하러 가기 →
        </Link>
      </div>
    </section>
  );
}

function ActivityList({ activities, className }: { activities: Activity[]; className?: string }) {
  const byDate = new Map<string, Activity[]>();
  for (const a of activities) {
    const day = a.createdAt.slice(0, 10);
    const list = byDate.get(day) ?? [];
    list.push(a);
    byDate.set(day, list);
  }
  const days = Array.from(byDate.keys()).sort((a, b) => (a > b ? -1 : 1));

  return (
    <section className={className}>
      <div className="flex flex-col gap-8">
        {days.map((day) => (
          <div key={day}>
            <p className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
              {formatDayLabel(day)}
            </p>
            <ul className="mt-3 overflow-hidden rounded-[12px] border border-[var(--color-apple-hairline)] bg-white">
              {byDate.get(day)!.map((a, idx, arr) => (
                <li
                  key={a.id}
                  className={
                    idx !== arr.length - 1 ? "border-b border-[var(--color-apple-hairline-soft)]" : ""
                  }
                >
                  <Link
                    href={a.href}
                    className="grid grid-cols-[60px_1fr_auto] items-center gap-4 px-5 py-[18px] transition-colors hover:bg-[var(--color-apple-pearl)] sm:grid-cols-[80px_1fr_auto] sm:gap-5 sm:px-7"
                  >
                    <span className="text-[11px] wght-450 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
                      {a.kindLabel}
                    </span>
                    <span className="min-w-0">
                      <span
                        className="block truncate text-[14px] wght-560 text-[var(--color-apple-ink)]"
                        style={{ letterSpacing: "-0.012em" }}
                      >
                        {a.title}
                      </span>
                      {a.detail && (
                        <span className="mt-1 block truncate text-[12px] wght-450 text-[var(--color-apple-muted)]">
                          {a.detail}
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] wght-450 tabular-nums text-[var(--color-apple-muted)]">
                      {formatTime(a.createdAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatDayLabel(day: string): string {
  const today = isoDay(new Date());
  if (day === today) return "오늘";
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (day === isoDay(yesterday)) return "어제";
  const d = new Date(day + "T00:00:00");
  if (!Number.isFinite(d.getTime())) return day;
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
