import Link from "next/link";
import { redirect } from "next/navigation";
import { tryGetOwnerId } from "@/lib/auth";
import { listUpcomingEvents, type EventView } from "@/lib/data/events";
import { getRecentActivities, type Activity } from "@/lib/data/activity";
import {
  getWrongStats,
  listRecentAttempts,
  type RecentAttempt,
  type WrongStats,
} from "@/lib/data/attempts";
import { formatEventLabel } from "@/lib/format-event";
import { TodayHero } from "./today-hero";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<EventView["kind"], string> = {
  exam: "시험",
  assignment: "과제",
  presentation: "발표",
  class: "수업",
  etc: "기타",
};

export default async function TodayPage() {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  const [upcoming, recent, wrongStats, recentAttempts] = await Promise.all([
    listUpcomingEvents({ ownerId, limit: 12 }),
    getRecentActivities({ ownerId, limit: 6 }),
    getWrongStats({ ownerId, sinceDays: 14 }),
    listRecentAttempts({ ownerId, limit: 3 }),
  ]);

  const focus = pickFocus(upcoming);
  const showStudyRow = wrongStats.totalWrong > 0 || recentAttempts.length > 0;

  return (
    <div className="bg-[var(--color-apple-pearl)]">
      <div className="mx-auto w-full max-w-[1080px] px-6 pb-24 pt-8 sm:px-10 sm:pb-28 sm:pt-12 md:px-12">
        <TopBar />

        {focus ? (
          <TodayHero focus={focus} kindLabel={KIND_LABEL} className="mt-10 fade-up fade-up-1 sm:mt-14" />
        ) : (
          <NoFocus className="mt-10 fade-up fade-up-1 sm:mt-14" />
        )}

        {showStudyRow && (
          <StudyRow
            wrongStats={wrongStats}
            recentAttempts={recentAttempts}
            className="mt-12 fade-up fade-up-2 sm:mt-14"
          />
        )}

        <UpcomingList
          events={upcoming}
          kindLabel={KIND_LABEL}
          className="mt-14 fade-up fade-up-2 sm:mt-16"
        />

        <RecentSection activities={recent} className="mt-14 fade-up fade-up-3 sm:mt-16" />
      </div>
    </div>
  );
}

function StudyRow({
  wrongStats,
  recentAttempts,
  className,
}: {
  wrongStats: WrongStats;
  recentAttempts: RecentAttempt[];
  className?: string;
}) {
  const lastAttempt = recentAttempts[0] ?? null;
  return (
    <section className={className}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ReviewQueueCard wrongStats={wrongStats} />
        {lastAttempt && <ResumeAttemptCard attempt={lastAttempt} />}
      </div>
    </section>
  );
}

function ReviewQueueCard({ wrongStats }: { wrongStats: WrongStats }) {
  if (wrongStats.totalWrong === 0) {
    return (
      <article className="rounded-[18px] border border-[var(--color-apple-hairline)] bg-white p-6">
        <p
          className="text-[11.5px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-success)]"
        >
          오답 없음
        </p>
        <h2
          className="mt-3 text-[17px] leading-[1.35] wght-620 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          최근 14일 동안 풀이 오답이 없어요.
        </h2>
        <p className="mt-2 text-[13px] wght-450 leading-[1.55] text-[var(--color-apple-muted)]">
          새 자료에서 문제를 만들면 여기서 복습 큐가 잡혀요.
        </p>
      </article>
    );
  }

  const topLine = wrongStats.byMaterial[0];
  return (
    <article className="rounded-[18px] bg-white p-6">
      <p
        className="text-[11.5px] wght-560 uppercase tracking-[0.06em] text-[var(--color-urgent)]"
      >
        오답 {wrongStats.totalWrong}문제
      </p>
      <h2
        className="mt-3 text-[17px] leading-[1.35] wght-620 text-[var(--color-apple-ink)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {topLine ? `${topLine.quizTitle}부터 다시.` : "오답을 다시 풀어요."}
      </h2>
      {wrongStats.byMaterial.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-[12.5px] wght-450 text-[var(--color-apple-muted)]">
          {wrongStats.byMaterial.slice(0, 3).map((m) => (
            <li key={m.materialId ?? m.quizTitle} className="flex justify-between gap-3">
              <span className="truncate">{m.quizTitle}</span>
              <span className="shrink-0 tabular-nums">{m.count}문제</span>
            </li>
          ))}
        </ul>
      )}
      <Link
        href="/dashboard/review"
        className="mt-6 inline-flex h-[40px] items-center rounded-full bg-[var(--color-urgent)] px-4 text-[13px] wght-560 text-white transition-all hover:opacity-90"
      >
        오답 복습 시작 →
      </Link>
    </article>
  );
}

function ResumeAttemptCard({ attempt }: { attempt: RecentAttempt }) {
  const ratio = attempt.total > 0 ? Math.round((attempt.score / attempt.total) * 100) : 0;
  const minutesAgo = Math.max(0, Math.floor((Date.now() - new Date(attempt.attemptedAt).getTime()) / 60000));
  const hoursAgo = Math.floor(minutesAgo / 60);
  const ago =
    minutesAgo < 60
      ? `${minutesAgo}분 전`
      : hoursAgo < 24
        ? `${hoursAgo}시간 전`
        : `${Math.floor(hoursAgo / 24)}일 전`;

  return (
    <article className="rounded-[18px] bg-white p-6">
      <p
        className="text-[11.5px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-action)]"
      >
        직전 풀이 · {ago}
      </p>
      <h2
        className="mt-3 text-[17px] leading-[1.35] wght-620 text-[var(--color-apple-ink)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {attempt.quizTitle}
      </h2>
      <p className="mt-2 text-[13px] wght-450 text-[var(--color-apple-muted)]">
        정답률 {ratio}% · {attempt.score}/{attempt.total}
      </p>
      <div className="mt-6 flex gap-2">
        <Link
          href={`/dashboard/quiz/${attempt.quizId}/result/${attempt.attemptId}`}
          className="inline-flex h-[40px] flex-1 items-center justify-center rounded-full bg-[var(--color-apple-ink)] px-4 text-[13px] wght-560 text-white transition-all hover:opacity-90"
        >
          다시보기
        </Link>
        <Link
          href={`/dashboard/quiz/${attempt.quizId}/wrong`}
          className="inline-flex h-[40px] items-center justify-center rounded-full border border-[var(--color-apple-hairline)] px-4 text-[12px] wght-450 text-[var(--color-apple-muted)] transition-all hover:border-[var(--color-apple-ink)] hover:text-[var(--color-apple-ink)]"
        >
          오답만
        </Link>
      </div>
    </article>
  );
}

function TopBar() {
  const now = new Date();
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const dateLabel = `${now.getMonth() + 1}월 ${now.getDate()}일 ${days[now.getDay()]}요일`;

  return (
    <header className="fade-up flex items-baseline justify-between gap-3">
      <p
        className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {dateLabel}
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
  );
}

function NoFocus({ className }: { className?: string }) {
  return (
    <section className={className}>
      <div className="rounded-[18px] bg-white px-7 py-12 text-center sm:py-16">
        <p
          className="text-[20px] wght-620 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          오늘 마감인 일정이 없어요
        </p>
        <p className="mx-auto mt-3 max-w-[420px] text-[14px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]">
          강의계획서를 등록하면 마감 임박한 시험·과제가 여기에 떠요.
        </p>
        <Link
          href="/dashboard/calendar/import"
          className="mt-6 inline-flex h-[44px] items-center rounded-full bg-[var(--color-apple-action)] px-6 text-[14px] wght-560 text-white transition-all hover:bg-[var(--color-apple-action-hover)]"
        >
          학교 자료 등록 →
        </Link>
      </div>
    </section>
  );
}

function UpcomingList({
  events,
  kindLabel,
  className,
}: {
  events: EventView[];
  kindLabel: Record<EventView["kind"], string>;
  className?: string;
}) {
  if (events.length === 0) return null;
  // 오늘은 hero에 노출됐을 가능성 높으니 1개 제외하고 다음 ~ 5개
  const list = events.slice(1, 6);
  if (list.length === 0) return null;

  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2
          className="text-[24px] leading-[1.1] wght-620 text-[var(--color-apple-ink)] sm:text-[28px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          다가오는 일정.
        </h2>
        <Link
          href="/dashboard/calendar"
          className="group inline-flex items-baseline text-[14px] wght-450 text-[var(--color-apple-action)]"
        >
          <span className="border-b border-transparent group-hover:border-[var(--color-apple-action)]">
            전체 캘린더
          </span>
          <span className="ml-1">›</span>
        </Link>
      </div>

      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {list.map((e) => (
          <li key={e.id}>
            <UpcomingCard event={e} kindLabel={kindLabel} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function UpcomingCard({
  event,
  kindLabel,
}: {
  event: EventView;
  kindLabel: Record<EventView["kind"], string>;
}) {
  const date = new Date(event.startsAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((date.getTime() - today.getTime()) / 86400000);
  const dDayLabel = days === 0 ? "오늘" : `D-${days}`;
  const tone = days <= 1 ? "urgent" : days <= 3 ? "warn" : "muted";

  return (
    <article className="rounded-[12px] bg-white p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <span
          className="text-[10.5px] wght-700 uppercase tracking-[0.06em]"
          style={{
            color:
              event.kind === "exam"
                ? "var(--color-urgent)"
                : event.kind === "assignment"
                  ? "var(--color-apple-action)"
                  : "var(--color-apple-muted)",
          }}
        >
          {kindLabel[event.kind]}
          {event.weightPercent != null && ` · ${event.weightPercent}%`}
        </span>
        <span
          className={`text-[12px] wght-700 tabular-nums ${
            tone === "urgent"
              ? "text-[var(--color-urgent)]"
              : tone === "warn"
                ? "text-[var(--color-apple-action)]"
                : "text-[var(--color-apple-muted)]"
          }`}
        >
          {dDayLabel}
        </span>
      </div>
      <p
        className="mt-3 text-[16px] leading-[1.3] wght-560 text-[var(--color-apple-ink)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {formatEventLabel(event)}
      </p>
      {event.courseColor && (
        <p className="mt-1.5 flex items-center gap-2 text-[12px] wght-450 text-[var(--color-apple-muted)]">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: event.courseColor ?? "#7aa6d6" }}
          />
          {formatEventTime(event)}
        </p>
      )}
    </article>
  );
}

function formatEventTime(event: EventView): string {
  const d = new Date(event.startsAt);
  if (!Number.isFinite(d.getTime())) return "";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  if (event.allDay) return `${m}/${day}`;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${m}/${day} ${hh}:${mm}`;
}

function RecentSection({ activities, className }: { activities: Activity[]; className?: string }) {
  if (activities.length === 0) return null;
  return (
    <section className={className}>
      <h2
        className="text-[24px] leading-[1.1] wght-620 text-[var(--color-apple-ink)] sm:text-[28px]"
        style={{ letterSpacing: "-0.012em" }}
      >
        최근 활동.
      </h2>
      <ul className="mt-6 overflow-hidden rounded-[12px] border border-[var(--color-apple-hairline)] bg-white">
        {activities.map((a, idx) => (
          <li
            key={a.id}
            className={
              idx !== activities.length - 1 ? "border-b border-[var(--color-apple-hairline-soft)]" : ""
            }
          >
            <Link
              href={a.href}
              className="grid grid-cols-[60px_1fr_auto] items-center gap-4 px-5 py-[18px] transition-colors hover:bg-[var(--color-apple-pearl)] sm:grid-cols-[72px_1fr_auto] sm:gap-5 sm:px-7"
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
              <span className="text-[15px] text-[var(--color-apple-muted)]">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function pickFocus(upcoming: EventView[]): EventView | null {
  const now = Date.now();
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  // 오늘 마감 중에 가장 가까운 거 우선, 없으면 가장 가까운 시험·과제
  for (const e of upcoming) {
    const t = new Date(e.startsAt).getTime();
    if (t >= now && t <= today.getTime() && (e.kind === "exam" || e.kind === "assignment")) {
      return e;
    }
  }
  for (const e of upcoming) {
    if (e.kind === "exam" || e.kind === "assignment") return e;
  }
  return upcoming[0] ?? null;
}
