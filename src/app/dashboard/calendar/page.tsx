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
      {/* 모바일: 페이지 전체 padding·max-width 제거 → 캘린더가 화면 꽉 채움.
          sm+: 기존 컨테이너 톤 유지. */}
      <div className="mx-auto w-full max-w-[1280px] px-0 pb-0 pt-0 sm:px-10 sm:pb-40 sm:pt-12">
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
  // 모바일에선 헤더 숨김 — 캘린더가 본문 전체를 차지하도록.
  // 월 라벨은 CalendarBoard 안에서 한 번 더 나오므로 정보 손실 없음.
  return (
    <header className="fade-up hidden items-start justify-between gap-3 sm:flex">
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
          이번 학기 일정
        </h1>
      </div>
    </header>
  );
}
