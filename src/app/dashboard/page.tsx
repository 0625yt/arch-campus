import Link from "next/link";
import { redirect } from "next/navigation";
import { tryGetOwnerId } from "@/lib/auth";
import { listCoursesGrouped, type CourseListItem } from "@/lib/data/materials";
import { listUpcomingEvents, type EventView } from "@/lib/data/events";
import { getWrongStats } from "@/lib/data/attempts";
import { getProfile } from "@/lib/data/profile";
import { inferSemester } from "@/lib/semester";
import { formatEventLabel } from "@/lib/format-event";

export const dynamic = "force-dynamic";

/**
 * 내 캠퍼스 — 한 학기를 한 화면에 펼치는 홈 화면.
 *
 * "지금"이 오늘이면, "내 캠퍼스"는 한 학기. 사용자가 사이드바에서
 * 누를 수 있는 항상 살아있는 진입점.
 */
export default async function DashboardHomePage() {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  const [profile, grouped, upcoming, wrongStats] = await Promise.all([
    getProfile(ownerId),
    listCoursesGrouped({ ownerId }),
    listUpcomingEvents({ ownerId, limit: 6 }),
    getWrongStats({ ownerId, sinceDays: 14 }),
  ]);

  const semester = inferSemester();
  const allCourses = [...grouped.semester, ...grouped.personal];
  const totalMaterials = allCourses.reduce((a, c) => a + c.materialCount, 0);
  const greeting = pickGreeting(profile?.displayName ?? null);

  return (
    <div>
      <div className="mx-auto w-full max-w-[1080px] px-6 pb-24 pt-8 sm:px-10 sm:pb-28 sm:pt-12 md:px-12">
        <Hero greeting={greeting} semesterLabel={semester.label} />

        <Stats
          courseCount={allCourses.length}
          materialCount={totalMaterials}
          wrongCount={wrongStats.totalWrong}
          upcomingCount={upcoming.length}
          className="mt-10 fade-up fade-up-2 sm:mt-14"
        />

        <QuickActions
          hasUpcoming={upcoming.length > 0}
          hasCourses={allCourses.length > 0}
          className="mt-12 fade-up fade-up-3 sm:mt-16"
        />

        {upcoming.length > 0 && (
          <UpcomingStrip
            events={upcoming.slice(0, 4)}
            className="mt-14 fade-up fade-up-4 sm:mt-16"
          />
        )}

        {allCourses.length > 0 && (
          <CoursesGrid
            courses={allCourses}
            className="mt-14 fade-up fade-up-5 sm:mt-16"
          />
        )}
      </div>
    </div>
  );
}

function Hero({ greeting, semesterLabel }: { greeting: string; semesterLabel: string }) {
  return (
    <header className="fade-up fade-up-1">
      <p
        className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-action)]"
        style={{ letterSpacing: "0.06em" }}
      >
        {semesterLabel}
      </p>
      <h1
        className="mt-4 text-[40px] leading-[1.04] wght-700 text-[var(--color-apple-ink)] sm:text-[56px] md:text-[64px]"
        style={{ letterSpacing: "-0.022em" }}
      >
        {greeting}.{" "}
        <span className="text-[var(--color-apple-muted)]">한 학기, 한 화면.</span>
      </h1>
      <p
        className="mt-5 max-w-[640px] text-[15px] leading-[1.55] wght-450 text-[var(--color-apple-muted)] sm:text-[17px]"
        style={{ letterSpacing: "-0.012em" }}
      >
        오늘 할 일은 지금 탭, 한 학기 전체는 여기에. 지금 어디로 갈지 한 번에 고르세요.
      </p>
    </header>
  );
}

function Stats({
  courseCount,
  materialCount,
  wrongCount,
  upcomingCount,
  className,
}: {
  courseCount: number;
  materialCount: number;
  wrongCount: number;
  upcomingCount: number;
  className?: string;
}) {
  const items: { label: string; value: number; href: string }[] = [
    { label: "과목", value: courseCount, href: "/dashboard/study" },
    { label: "자료", value: materialCount, href: "/dashboard/study" },
    { label: "다가오는 일정", value: upcomingCount, href: "/dashboard/calendar" },
    { label: "오답 (14일)", value: wrongCount, href: "/dashboard/review" },
  ];
  return (
    <section className={className}>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((it) => (
          <li key={it.label}>
            <Link
              href={it.href}
              className="elev-hover-2 press-soft block rounded-[14px] bg-white px-5 py-5"
            >
              <p
                className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]"
                style={{ letterSpacing: "0.06em" }}
              >
                {it.label}
              </p>
              <p
                className="mt-2 text-[28px] wght-700 tabular-nums text-[var(--color-apple-ink)] sm:text-[32px]"
                style={{ letterSpacing: "-0.022em" }}
              >
                {it.value}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function QuickActions({
  hasUpcoming,
  hasCourses,
  className,
}: {
  hasUpcoming: boolean;
  hasCourses: boolean;
  className?: string;
}) {
  const actions: {
    href: string;
    label: string;
    hint: string;
    accent: string;
    bg: string;
    ink: string;
  }[] = [
    {
      href: "/dashboard/today",
      label: "지금",
      hint: hasUpcoming ? "오늘 가장 임박한 일정" : "오늘 할 일 비어있어요",
      accent: "var(--color-apple-action)",
      bg: "var(--color-tint-prez)",
      ink: "var(--color-tint-prez-ink)",
    },
    {
      href: "/dashboard/study",
      label: "공부",
      hint: hasCourses ? "과목별 자료·요약·문제" : "과목을 먼저 만들어요",
      accent: "var(--color-tint-class-ink)",
      bg: "var(--color-tint-class)",
      ink: "var(--color-tint-class-ink)",
    },
    {
      href: "/dashboard/calendar",
      label: "일정",
      hint: "한 학기 전체 캘린더",
      accent: "var(--color-tint-assign-ink)",
      bg: "var(--color-tint-assign)",
      ink: "var(--color-tint-assign-ink)",
    },
    {
      href: "/dashboard/tools",
      label: "도구",
      hint: "발표·과제·시험 위저드",
      accent: "var(--color-tint-etc-ink)",
      bg: "var(--color-tint-etc)",
      ink: "var(--color-tint-etc-ink)",
    },
  ];
  return (
    <section className={className}>
      <h2
        className="text-[22px] leading-[1.15] wght-620 text-[var(--color-apple-ink)] sm:text-[26px]"
        style={{ letterSpacing: "-0.012em" }}
      >
        어디로 갈까요.
      </h2>
      <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {actions.map((a) => (
          <li key={a.href}>
            <Link
              href={a.href}
              className="elev-hover-2 press-soft group block overflow-hidden rounded-[18px] bg-white p-6"
              style={{ minHeight: 156 }}
            >
              <span
                aria-hidden
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[15px] wght-700"
                style={{ backgroundColor: a.bg, color: a.ink }}
              >
                {a.label.charAt(0)}
              </span>
              <h3
                className="mt-5 text-[20px] wght-620 text-[var(--color-apple-ink)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                {a.label}
              </h3>
              <p
                className="mt-1 text-[12.5px] wght-450 text-[var(--color-apple-muted)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                {a.hint}
              </p>
              <span
                aria-hidden
                className="mt-4 inline-flex items-center text-[13px] wght-560 transition-transform group-hover:translate-x-0.5"
                style={{ color: a.accent }}
              >
                열기 ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function UpcomingStrip({ events, className }: { events: EventView[]; className?: string }) {
  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2
          className="text-[22px] leading-[1.15] wght-620 text-[var(--color-apple-ink)] sm:text-[26px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          다가오는 일정.
        </h2>
        <Link
          href="/dashboard/calendar"
          className="text-[13px] wght-450 text-[var(--color-apple-action)] hover:underline"
          style={{ letterSpacing: "-0.012em" }}
        >
          전체 캘린더 ›
        </Link>
      </div>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {events.map((e) => (
          <li key={e.id}>
            <UpcomingItem event={e} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function UpcomingItem({ event }: { event: EventView }) {
  const date = new Date(event.startsAt);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((date.getTime() - today.getTime()) / 86400000);
  const dDay = days === 0 ? "오늘" : `D-${days}`;
  const tone = days <= 1 ? "urgent" : days <= 3 ? "warn" : "muted";
  return (
    <Link
      href="/dashboard/calendar"
      className="elev-hover-2 press-soft flex items-baseline justify-between gap-3 rounded-[12px] bg-white px-5 py-4"
    >
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-[14px] wght-560 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {formatEventLabel(event)}
        </p>
        <p
          className="mt-0.5 text-[12px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {formatWhen(date, event.allDay)}
        </p>
      </div>
      <span
        className={`shrink-0 tabular-nums text-[13px] wght-700 ${
          tone === "urgent"
            ? "text-[var(--color-urgent)]"
            : tone === "warn"
              ? "text-[var(--color-apple-action)]"
              : "text-[var(--color-apple-muted)]"
        }`}
      >
        {dDay}
      </span>
    </Link>
  );
}

function CoursesGrid({ courses, className }: { courses: CourseListItem[]; className?: string }) {
  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2
          className="text-[22px] leading-[1.15] wght-620 text-[var(--color-apple-ink)] sm:text-[26px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          내 과목.
        </h2>
        <Link
          href="/dashboard/study"
          className="text-[13px] wght-450 text-[var(--color-apple-action)] hover:underline"
          style={{ letterSpacing: "-0.012em" }}
        >
          공부 탭에서 보기 ›
        </Link>
      </div>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {courses.slice(0, 9).map((c) => {
          const dot = c.color ?? "#7aa6d6";
          return (
            <li key={c.id}>
              <Link
                href={`/dashboard/study/${encodeURIComponent(c.name)}`}
                className="elev-hover-2 press-soft block rounded-[12px] bg-white px-5 py-4"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: dot }}
                  />
                  <span
                    className="truncate text-[12px] wght-450 text-[var(--color-apple-muted)]"
                    style={{ letterSpacing: "-0.012em" }}
                  >
                    {c.category === "personal" ? "개인 학습" : (c.professor ?? "교수 미정")}
                  </span>
                </div>
                <h3
                  className="mt-2 truncate text-[17px] wght-620 text-[var(--color-apple-ink)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  {c.name}
                </h3>
                <p
                  className="mt-1.5 text-[12px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  자료 {c.materialCount}개
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function pickGreeting(name: string | null): string {
  const hour = new Date().getHours();
  const part = hour < 6 ? "새벽" : hour < 12 ? "오전" : hour < 18 ? "오후" : "저녁";
  if (name && name.trim().length > 0) {
    return `${name}님의 ${part}`;
  }
  return `${part} 잘 보내요`;
}

function formatWhen(d: Date, allDay: boolean): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  if (allDay) return `${m}/${day}`;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${m}/${day} ${hh}:${mm}`;
}
