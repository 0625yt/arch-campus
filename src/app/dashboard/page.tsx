import Link from "next/link";
import { redirect } from "next/navigation";
import { tryGetOwnerId } from "@/lib/auth";
import { type EventView, listUpcomingEvents } from "@/lib/data/events";
import { type CourseListItem, listCoursesGrouped } from "@/lib/data/materials";
import { getProfile } from "@/lib/data/profile";
import {
  type CourseRiskItem,
  getSemesterSafetySnapshot,
  type SafetySignal,
  type SignalTone,
} from "@/lib/data/semester-safety";
import { formatEventLabel } from "@/lib/format-event";
import { kstHour, kstParts, kstStartOfDay } from "@/lib/kst";
import { inferSemester } from "@/lib/semester";

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

  const [profile, grouped, upcoming, safety] = await Promise.all([
    getProfile(ownerId),
    listCoursesGrouped({ ownerId }),
    listUpcomingEvents({ ownerId, limit: 6 }),
    getSemesterSafetySnapshot(ownerId),
  ]);

  const semester = inferSemester();
  const allCourses = [...grouped.semester, ...grouped.personal];
  const greeting = pickGreeting(profile?.displayName ?? null);

  return (
    <div>
      <div className="mx-auto w-full max-w-[1080px] px-6 pb-24 pt-8 sm:px-10 sm:pb-28 sm:pt-12 md:px-12">
        <Hero greeting={greeting} semesterLabel={semester.label} />

        <SemesterSafetyPanel safety={safety} className="mt-10 fade-up fade-up-2 sm:mt-14" />

        <CampusIntake courses={allCourses} className="mt-12 fade-up fade-up-3 sm:mt-16" />

        {upcoming.length > 0 && (
          <UpcomingStrip
            events={upcoming.slice(0, 4)}
            className="mt-14 fade-up fade-up-4 sm:mt-16"
          />
        )}

        {allCourses.length > 0 && (
          <CoursesGrid
            courses={allCourses}
            risks={safety.courseRisks}
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
      <div className="flex items-start justify-between gap-3">
        <p
          className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-action)]"
          style={{ letterSpacing: "0.06em" }}
        >
          {semesterLabel}
        </p>
        {/* 학기 시작·시간표 변경 시 자주 쓰는 진입점 — Hero 우상단에 미니멀하게 */}
        <Link
          href="/dashboard/calendar/import?kind=timetable"
          className="group inline-flex items-center gap-1 rounded-full border border-[var(--color-apple-hairline)] bg-white px-3 py-1.5 text-[11.5px] wght-560 text-[var(--color-apple-muted)] transition-colors hover:border-[var(--color-apple-action)]/40 hover:text-[var(--color-apple-action)] sm:text-[12px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
            <title>시간표 올리기</title>
            <path
              d="M8 11V3.5M8 3.5l-2.5 2.5M8 3.5l2.5 2.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M3 11.5v.5c0 .8.7 1.5 1.5 1.5h7c.8 0 1.5-.7 1.5-1.5v-.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
          시간표 다시 올리기
        </Link>
      </div>
      <h1
        className="mt-4 text-[40px] leading-[1.04] wght-700 text-[var(--color-apple-ink)] sm:text-[56px] md:text-[64px]"
        style={{ letterSpacing: "-0.022em" }}
      >
        {greeting}. <span className="text-[var(--color-apple-muted)]">지금 손대야 할 것만.</span>
      </h1>
      <p
        className="mt-5 max-w-[640px] text-[15px] leading-[1.55] wght-450 text-[var(--color-apple-muted)] sm:text-[17px]"
        style={{ letterSpacing: "-0.012em" }}
      >
        arch는 한 학기에서 놓치면 손해 보는 것을 자료에서 찾아, 오늘 바로 할 일로 바꿔줍니다.
      </p>
    </header>
  );
}

function SemesterSafetyPanel({
  safety,
  className,
}: {
  safety: Awaited<ReturnType<typeof getSemesterSafetySnapshot>>;
  className?: string;
}) {
  const hasSignals = safety.signals.length > 0;
  const topCourses = safety.courseRisks.filter((course) => course.risk !== "safe").slice(0, 3);
  return (
    <section className={className}>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="elev-1 overflow-hidden rounded-[18px] bg-white">
          <div className="border-b border-[var(--color-apple-hairline-soft)] px-6 py-5 sm:px-7">
            <p
              className="text-[11.5px] wght-620 uppercase text-[var(--color-apple-action)]"
              style={{ letterSpacing: "0.06em" }}
            >
              학기 안전망
            </p>
            <h2
              className="mt-2 text-[24px] leading-[1.15] wght-700 text-[var(--color-apple-ink)] sm:text-[30px]"
              style={{ letterSpacing: "-0.018em" }}
            >
              놓치면 손해인 것만 먼저.
            </h2>
          </div>

          {hasSignals ? (
            <ul className="divide-y divide-[var(--color-apple-hairline-soft)]">
              {safety.signals.map((signal) => (
                <li key={signal.id}>
                  <SafetySignalRow signal={signal} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-6 py-8 sm:px-7">
              <p className="text-[15px] wght-620 text-[var(--color-apple-ink)]">
                지금 당장 막을 신호는 없어요.
              </p>
              <p className="mt-2 text-[13px] leading-[1.55] wght-450 text-[var(--color-apple-muted)]">
                강의계획서와 자료를 넣으면 마감·시험·오답·방치 자료를 여기서 계속 감시합니다.
              </p>
            </div>
          )}
        </div>

        <aside className="elev-1 rounded-[18px] bg-white px-6 py-6 sm:px-7">
          <div className="grid grid-cols-3 gap-2">
            <SafetyMetric label="위험" value={safety.totals.danger} tone="urgent" />
            <SafetyMetric label="주의" value={safety.totals.watch} tone="warn" />
            <SafetyMetric label="방치 자료" value={safety.totals.unreadMaterials} tone="calm" />
          </div>

          <div className="mt-6">
            <p
              className="text-[12px] wght-620 text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              과목 위험도
            </p>
            {topCourses.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-2.5">
                {topCourses.map((course) => (
                  <li key={course.courseId}>
                    <CourseRiskMini course={course} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[13px] leading-[1.55] wght-450 text-[var(--color-apple-muted)]">
                모든 과목이 안전권이에요. 새 자료가 들어오면 다시 계산됩니다.
              </p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

function SafetySignalRow({ signal }: { signal: SafetySignal }) {
  const tone = signalTone(signal.tone);
  return (
    <Link
      href={signal.href}
      className="group grid gap-3 px-6 py-5 transition-colors hover:bg-[var(--color-apple-pearl)] sm:grid-cols-[112px_1fr_auto] sm:items-center sm:px-7"
    >
      <span
        className="inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] wght-700"
        style={{ backgroundColor: tone.bg, color: tone.fg, letterSpacing: "-0.012em" }}
      >
        {signal.label}
      </span>
      <span className="min-w-0">
        <span
          className="block truncate text-[15px] wght-700 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {signal.title}
        </span>
        <span
          className="mt-1 block truncate text-[12.5px] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {signal.reason} · {signal.evidence}
        </span>
      </span>
      <span
        className="text-[12.5px] wght-620 text-[var(--color-apple-action)] transition-transform group-hover:translate-x-0.5"
        style={{ letterSpacing: "-0.012em" }}
      >
        {signal.cta} ›
      </span>
    </Link>
  );
}

function SafetyMetric({ label, value, tone }: { label: string; value: number; tone: SignalTone }) {
  const color = signalTone(tone).fg;
  return (
    <div className="rounded-[12px] bg-[var(--color-apple-pearl)] px-3 py-3">
      <p
        className="text-[10.5px] wght-620 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {label}
      </p>
      <p
        className="mt-1 text-[24px] wght-700 tabular-nums"
        style={{ color, letterSpacing: "-0.022em" }}
      >
        {value}
      </p>
    </div>
  );
}

function CourseRiskMini({ course }: { course: CourseRiskItem }) {
  const tone = riskTone(course.risk);
  return (
    <Link
      href={course.actionHref}
      className="flex items-center justify-between gap-3 rounded-[12px] px-3 py-3 transition-colors hover:bg-[var(--color-apple-pearl)]"
    >
      <span className="min-w-0">
        <span
          className="block truncate text-[13.5px] wght-620 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {course.courseName}
        </span>
        <span className="mt-0.5 block truncate text-[11.5px] wght-450 text-[var(--color-apple-muted)]">
          {course.reasons[0]}
        </span>
      </span>
      <span
        className="shrink-0 rounded-full px-2 py-1 text-[10.5px] wght-700"
        style={{ backgroundColor: tone.bg, color: tone.fg, letterSpacing: "-0.012em" }}
      >
        {tone.label}
      </span>
    </Link>
  );
}

function CampusIntake({ courses, className }: { courses: CourseListItem[]; className?: string }) {
  const firstCourse = courses[0] ?? null;
  const materialHref = firstCourse
    ? `/dashboard/study/${encodeURIComponent(firstCourse.name)}#upload-zone`
    : "/dashboard/study";
  const actions: {
    title: string;
    desc: string;
    href: string;
    color: string;
    meta: string;
  }[] = [
    {
      title: "강의자료",
      desc: "요약, 문제, 자료 챗으로 바꾸기",
      href: materialHref,
      color: "var(--color-apple-action)",
      meta: firstCourse ? `${firstCourse.name}에 넣기` : "과목 만들고 넣기",
    },
    {
      title: "강의계획서",
      desc: "시험, 과제, 발표일 뽑아 일정화",
      href: "/dashboard/calendar/import?kind=syllabus",
      color: "#cca06b",
      meta: "확인 후 캘린더 추가",
    },
    {
      title: "시간표",
      desc: "수업 시간과 강의실을 한 번에 등록",
      href: "/dashboard/calendar/import?kind=timetable",
      color: "#7fb38c",
      meta: "학기 시작에 가장 먼저",
    },
    {
      title: "과제 공지",
      desc: "제출 조건과 감점 포인트 체크",
      href: "/dashboard/tools/report-checklist",
      color: "#a08bc4",
      meta: "마감 전에 확인",
    },
  ];

  return (
    <section className={className}>
      <div className="elev-1 overflow-hidden rounded-[18px] bg-white">
        <div className="grid gap-0 lg:grid-cols-[0.95fr_1.55fr]">
          <div className="border-b border-[var(--color-apple-hairline-soft)] px-6 py-6 sm:px-7 sm:py-7 lg:border-b-0 lg:border-r">
            <p
              className="text-[11.5px] wght-620 uppercase text-[var(--color-apple-action)]"
              style={{ letterSpacing: "0.06em" }}
            >
              자료 넣기
            </p>
            <h2
              className="mt-3 text-[24px] leading-[1.16] wght-700 text-[var(--color-apple-ink)] sm:text-[30px]"
              style={{ letterSpacing: "-0.018em" }}
            >
              파일 종류를 고르면 바로 맞는 흐름으로 들어가요.
            </h2>
            <p
              className="mt-3 max-w-[420px] text-[13.5px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              이 서비스의 시작점은 자료예요. 강의자료는 공부 루프로, 강의계획서와 시간표는 일정으로
              연결됩니다.
            </p>
          </div>

          <ul className="grid divide-y divide-[var(--color-apple-hairline-soft)] sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            {actions.map((action) => (
              <li key={action.title} className="min-w-0">
                <Link
                  href={action.href}
                  className="group flex h-full min-h-[132px] flex-col justify-between px-5 py-5 transition-colors hover:bg-[var(--color-apple-pearl)] sm:px-6 sm:py-6"
                >
                  <span
                    className="h-[3px] w-9 rounded-full"
                    style={{ backgroundColor: action.color }}
                    aria-hidden
                  />
                  <span className="mt-4 block min-w-0">
                    <span
                      className="block text-[17px] wght-700 text-[var(--color-apple-ink)]"
                      style={{ letterSpacing: "-0.012em" }}
                    >
                      {action.title}
                    </span>
                    <span
                      className="mt-1.5 block text-[12.5px] leading-[1.5] wght-450 text-[var(--color-apple-muted)]"
                      style={{ letterSpacing: "-0.012em" }}
                    >
                      {action.desc}
                    </span>
                  </span>
                  <span
                    className="mt-5 flex items-center justify-between gap-3 text-[12px] wght-560 text-[var(--color-apple-action)]"
                    style={{ letterSpacing: "-0.012em" }}
                  >
                    <span className="truncate">{action.meta}</span>
                    <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                      ›
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
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
          다가오는 일정
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
  // Vercel UTC 서버에서 setHours(0,0,0,0)은 UTC 자정 → KST 새벽 9시. KST 자정 기준으로 비교.
  const today = kstStartOfDay();
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

function CoursesGrid({
  courses,
  risks,
  className,
}: {
  courses: CourseListItem[];
  risks: CourseRiskItem[];
  className?: string;
}) {
  const riskByCourse = new Map(risks.map((risk) => [risk.courseId, risk]));
  return (
    <section className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <h2
          className="text-[22px] leading-[1.15] wght-620 text-[var(--color-apple-ink)] sm:text-[26px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          내 과목
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
          const risk = riskByCourse.get(c.id);
          const tone = risk ? riskTone(risk.risk) : riskTone("safe");
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
                {risk && (
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <span
                      className="rounded-full px-2.5 py-1 text-[10.5px] wght-700"
                      style={{
                        backgroundColor: tone.bg,
                        color: tone.fg,
                        letterSpacing: "-0.012em",
                      }}
                    >
                      {tone.label}
                    </span>
                    <span className="truncate text-[11.5px] wght-450 text-[var(--color-apple-muted)]">
                      {risk.reasons[0]}
                    </span>
                  </div>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function signalTone(tone: SignalTone): { bg: string; fg: string } {
  if (tone === "urgent") {
    return { bg: "var(--color-urgent-soft)", fg: "var(--color-urgent)" };
  }
  if (tone === "warn") {
    return { bg: "var(--color-tint-assign)", fg: "var(--color-tint-assign-ink)" };
  }
  return { bg: "var(--color-tint-class)", fg: "var(--color-tint-class-ink)" };
}

function riskTone(risk: CourseRiskItem["risk"]): { label: string; bg: string; fg: string } {
  if (risk === "danger") {
    return { label: "위험", bg: "var(--color-urgent-soft)", fg: "var(--color-urgent)" };
  }
  if (risk === "watch") {
    return { label: "주의", bg: "var(--color-tint-assign)", fg: "var(--color-tint-assign-ink)" };
  }
  return { label: "안전", bg: "var(--color-tint-class)", fg: "var(--color-tint-class-ink)" };
}

function pickGreeting(name: string | null): string {
  // UTC 서버에서 getHours()는 UTC 시각 → KST 사용자에게 "오전" 인사가 새벽에 뜸. KST 시간 기준.
  const hour = kstHour();
  const part = hour < 6 ? "새벽" : hour < 12 ? "오전" : hour < 18 ? "오후" : "저녁";
  if (name && name.trim().length > 0) {
    return `${name}님의 ${part}`;
  }
  return `${part} 잘 보내요`;
}

function formatWhen(d: Date, allDay: boolean): string {
  // UTC ISO → KST 라벨. Vercel UTC 서버에서 getMonth/getHours를 그대로 쓰면 KST 자정 직전 어긋남.
  const { month, day } = kstParts(d);
  const m = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  if (allDay) return `${m}/${dd}`;
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${m}/${dd} ${hh}:${mm}`;
}
