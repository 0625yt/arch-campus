import Link from "next/link";
import { redirect } from "next/navigation";
import { tryGetOwnerId } from "@/lib/auth";
import { listEventsBetween, listUpcomingEvents, type EventView } from "@/lib/data/events";
import { listCoursesWithMaterialCount } from "@/lib/data/materials";
import { CalendarBoard } from "./calendar-board";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<EventView["kind"], string> = {
  exam: "시험",
  assignment: "과제",
  presentation: "발표",
  class: "수업",
  etc: "기타",
};

export default async function CalendarPage() {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  // 이번 달 + 다음 달 한꺼번에 (내비게이션 시 클라이언트가 자체 fetch도 가능, 일단 SSR 한 달치)
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 1);

  const [monthEvents, upcoming, courses] = await Promise.all([
    listEventsBetween({
      ownerId,
      fromIso: monthStart.toISOString(),
      toIso: monthEnd.toISOString(),
    }),
    listUpcomingEvents({ ownerId, limit: 10 }),
    listCoursesWithMaterialCount({ ownerId }),
  ]);

  // EventCreateForm용 — id/name/color만
  const courseOptions = courses.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
  }));

  return (
    <div>
      <div className="mx-auto w-full max-w-[1280px] px-6 pb-32 pt-8 sm:px-10 sm:pb-40 sm:pt-12">
        <Header />
        <CalendarBoard
          monthEvents={monthEvents}
          upcoming={upcoming}
          kindLabel={KIND_LABEL}
          courses={courseOptions}
        />
      </div>
    </div>
  );
}

function Header() {
  return (
    <header className="fade-up flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p
          className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          캘린더
        </p>
        <h1
          className="mt-3 text-[30px] leading-[1.07] wght-620 text-[var(--color-apple-ink)] sm:text-[44px] md:text-[52px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          이번 학기 일정.
        </h1>
      </div>
      <div className="mt-7 flex shrink-0 items-center gap-2 sm:mt-0">
        <Link
          href="/dashboard/calendar/import?kind=timetable"
          className="hidden h-[40px] items-center rounded-full bg-white px-4 text-[13px] wght-560 text-[var(--color-apple-ink)] transition-colors hover:bg-[var(--color-apple-pearl)] sm:inline-flex"
          style={{ letterSpacing: "-0.012em" }}
        >
          시간표 다시 올리기
        </Link>
        <Link
          href="/dashboard/calendar/import"
          aria-label="학교 자료 등록"
          className="inline-flex h-[40px] items-center justify-center gap-1 whitespace-nowrap rounded-full bg-[var(--color-apple-action)] px-4 text-[13px] wght-560 text-white transition-all hover:bg-[var(--color-apple-action-hover)] active:scale-[0.97] sm:px-5"
          style={{ letterSpacing: "-0.012em" }}
        >
          <span aria-hidden>+</span>
          <span className="hidden sm:inline">학교 자료 등록</span>
          <span className="sm:hidden">자료</span>
        </Link>
      </div>
    </header>
  );
}
