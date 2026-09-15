import { ArrowUpRight, CalendarDays, Check, ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";
import { AppleShell } from "@/components/apple-shell";
import type { EventView } from "@/lib/data/events";
import type { SafetySignal } from "@/lib/data/semester-safety";
import { formatEventLabel } from "@/lib/format-event";
import s from "./today.module.css";

export function TodayOverview({
  signals,
  events,
}: {
  signals: SafetySignal[];
  events: EventView[];
}) {
  return (
    <AppleShell>
      <nav aria-label="페이지 경로" className={s.breadcrumb}>
        <Link href="/dashboard">내 캠퍼스</Link>
        <ChevronRight size={13} aria-hidden />
        <span>오늘 할 일</span>
      </nav>
      <header className={s.hero}>
        <p className={s.kicker}>TODAY, ONE STEP AT A TIME</p>
        <h1>오늘의 우선순위</h1>
        <p className={s.description}>
          다가오는 마감, 아직 정리하지 않은 자료, 다시 볼 문제.
          <br />
          지금 확인하면 좋은 일을 모았어요.
        </p>
        <span className={s.count}>
          <b>{signals.length}</b>개의 확인할 일
        </span>
      </header>
      <section className={s.section} aria-labelledby="priority-title">
        <h2 id="priority-title">먼저 확인해 보세요</h2>
        {signals.length ? (
          <ol className={s.signals}>
            {signals.map((signal, index) => (
              <li key={signal.id}>
                <Link href={signal.href} className={s.signal} data-tone={signal.tone}>
                  <span className={s.number}>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <small>{signal.label}</small>
                    <h3>{signal.title}</h3>
                    <p>{signal.reason}</p>
                    {signal.evidence && <span className={s.evidence}>{signal.evidence}</span>}
                    <span className={s.cta}>
                      {signal.cta}
                      <ArrowUpRight size={14} aria-hidden />
                    </span>
                  </div>
                  <ArrowUpRight size={20} aria-hidden />
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <div className={s.empty}>
            <Check size={24} aria-hidden />
            <h3>지금 확인할 우선순위가 없어요</h3>
            <p>등록된 자료와 일정 기준이에요. 새 자료나 마감이 생기면 이곳에서 확인할 수 있어요.</p>
            <Link href="/dashboard/study">
              내 과목에서 공부 이어가기 <ArrowUpRight size={15} aria-hidden />
            </Link>
          </div>
        )}
      </section>
      <section className={s.section} aria-labelledby="upcoming-title">
        <div className={s.sectionHeading}>
          <h2 id="upcoming-title">다가오는 일정</h2>
          <Link href="/dashboard/calendar">
            전체 일정 <ArrowUpRight size={14} aria-hidden />
          </Link>
        </div>
        {events.length ? (
          <ul className={s.events}>
            {events.map((event) => (
              <li key={event.id}>
                <Link href="/dashboard/calendar">
                  <CalendarDays size={20} aria-hidden />
                  <div>
                    <h3>{formatEventLabel(event)}</h3>
                    <p>
                      {formatDate(event)}
                      {event.location && (
                        <span>
                          <MapPin size={12} aria-hidden />
                          {event.location}
                        </span>
                      )}
                    </p>
                  </div>
                  <ArrowUpRight size={16} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className={s.noEvents}>
            <p>등록된 예정 일정이 없어요.</p>
            <Link href="/dashboard/calendar/import?kind=syllabus">
              강의계획서에서 일정 가져오기 <ArrowUpRight size={14} aria-hidden />
            </Link>
          </div>
        )}
      </section>
    </AppleShell>
  );
}

function formatDate(event: EventView) {
  const date = new Date(event.startsAt);
  if (!Number.isFinite(date.getTime())) return "날짜 확인 필요";
  return (
    new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "long",
      day: "numeric",
      weekday: "short",
      ...(event.allDay ? {} : { hour: "2-digit", minute: "2-digit", hour12: false }),
    }).format(date) + (event.allDay ? " · 하루 종일" : "")
  );
}
