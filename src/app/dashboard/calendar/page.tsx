"use client";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  type LucideIcon,
  MapPin,
  Plus,
  Sparkles,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { type CSSProperties, type ReactNode, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type CalendarKey = "내 일정" | "과제·마감" | "개인" | "공휴일";

interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  color: string;
  calendar: CalendarKey;
  detail: string;
  time?: string;
  location?: string;
  online?: boolean;
  allDay?: boolean;
}

interface SourceScheduleCandidate extends CalendarEvent {
  source: string;
  extracted: string;
  confidence: string;
}

const TODAY_KEY = "2026-05-09";
const SEMESTER_END = "2026-06-15";

const CALENDARS: { id: CalendarKey; label: string; color: string }[] = [
  { id: "내 일정", label: "내 일정", color: "#3b82ff" },
  { id: "과제·마감", label: "과제·마감", color: "#ff6b7d" },
  { id: "개인", label: "개인", color: "#27d6a3" },
  { id: "공휴일", label: "공휴일", color: "#45c989" },
];

const EVENTS: CalendarEvent[] = [
  {
    id: "labor-day",
    date: "2026-05-01",
    title: "노동절",
    color: "#45c989",
    calendar: "공휴일",
    detail: "휴일",
    allDay: true,
  },
  {
    id: "ds-start",
    date: "2026-05-04",
    title: "자료구조 과제 시작",
    time: "오전 10:30",
    color: "#3b82ff",
    calendar: "내 일정",
    detail: "BST 구현 시작.",
    location: "공학관 401",
  },
  {
    id: "children-day",
    date: "2026-05-05",
    title: "어린이날",
    color: "#45c989",
    calendar: "공휴일",
    detail: "공휴일",
    allDay: true,
  },
  {
    id: "morning-class",
    date: "2026-05-05",
    title: "자료구조 강의",
    time: "오전 6:30",
    color: "#3b82ff",
    calendar: "내 일정",
    detail: "트리 트래버설.",
    online: true,
  },
  {
    id: "db-rehearsal",
    date: "2026-05-07",
    title: "DB 발표 리허설",
    time: "오후 2:00",
    color: "#27d6a3",
    calendar: "개인",
    detail: "정규화 사례 발표 순서 맞추기.",
    location: "스터디룸 B",
  },
  {
    id: "parents-day",
    date: "2026-05-08",
    title: "어버이날",
    color: "#45c989",
    calendar: "공휴일",
    detail: "기념일",
    allDay: true,
  },
  {
    id: "algo-quiz",
    date: "2026-05-08",
    title: "알고리즘 퀴즈 마감",
    time: "오후 11:59",
    color: "#ff6b7d",
    calendar: "과제·마감",
    detail: "DP 기본 점화식 퀴즈.",
  },
  {
    id: "ds-deadline",
    date: "2026-05-12",
    title: "자료구조 BST 과제",
    time: "오후 11:59",
    color: "#ff6b7d",
    calendar: "과제·마감",
    detail: "제출 파일명: 학번.txt",
  },
  {
    id: "teachers-day",
    date: "2026-05-15",
    title: "스승의날",
    color: "#45c989",
    calendar: "공휴일",
    detail: "기념일",
    allDay: true,
  },
  {
    id: "os-midterm",
    date: "2026-05-18",
    title: "운영체제 중간고사",
    time: "오전 10:00",
    color: "#3b82ff",
    calendar: "내 일정",
    detail: "범위: 프로세스, 스레드, 동기화",
    location: "공학관 302",
  },
  {
    id: "buddha-day",
    date: "2026-05-24",
    title: "부처님오신날",
    color: "#45c989",
    calendar: "공휴일",
    detail: "공휴일",
    allDay: true,
  },
  {
    id: "buddha-rest",
    date: "2026-05-25",
    title: "대체 휴일",
    color: "#45c989",
    calendar: "공휴일",
    detail: "대체 휴일",
    allDay: true,
  },
  {
    id: "election-day",
    date: "2026-06-03",
    title: "지방선거일",
    color: "#45c989",
    calendar: "공휴일",
    detail: "공휴일",
    allDay: true,
  },
  {
    id: "memorial-day",
    date: "2026-06-06",
    title: "현충일",
    color: "#45c989",
    calendar: "공휴일",
    detail: "공휴일",
    allDay: true,
  },
  {
    id: "final-exam",
    date: "2026-06-12",
    title: "자료구조 기말고사",
    time: "오후 2:00",
    color: "#ff6b7d",
    calendar: "과제·마감",
    detail: "기말고사 범위: 그래프·DP",
    location: "공학관 401",
  },
];

const DRAFT_EVENT: CalendarEvent = {
  id: "draft",
  date: TODAY_KEY,
  title: "(제목 없음)",
  color: "#3b82ff",
  calendar: "내 일정",
  detail: "수업, 과제, 팀플, 개인 약속을 바로 추가할 수 있어요.",
  allDay: true,
};

const SOURCE_SCHEDULE_CANDIDATES_INITIAL: SourceScheduleCandidate[] = [
  {
    id: "candidate-ds-deadline",
    date: "2026-05-12",
    title: "자료구조 BST 과제 마감",
    time: "오후 11:59",
    color: "#ff6b7d",
    calendar: "과제·마감",
    detail: "과제 안내 PDF에서 찾았어요. 제출 파일명은 학번.txt.",
    location: "LMS",
    source: "자료구조_과제안내.pdf",
    extracted: "제출 마감: 5월 12일 23:59 / 파일명: 학번.txt / 실행 캡처 1장 첨부",
    confidence: "높음",
  },
  {
    id: "candidate-os-midterm",
    date: "2026-05-18",
    title: "운영체제 중간고사",
    time: "오전 10:00",
    color: "#3b82ff",
    calendar: "내 일정",
    detail: "강의계획서에서 시험 일정과 범위를 찾았어요. 범위: 프로세스, 스레드, 동기화.",
    location: "공학관 302호",
    source: "운영체제_강의계획서.pdf",
    extracted: "중간고사 일시: 5월 18일 10:00 / 장소: 공학관 302 / 범위: 1~5장",
    confidence: "높음",
  },
  {
    id: "candidate-algo-quiz2",
    date: "2026-05-15",
    title: "알고리즘 2차 퀴즈",
    time: "오후 11:59",
    color: "#ff6b7d",
    calendar: "과제·마감",
    detail: "주차별 퀴즈 안내에서 찾았어요. 그래프 BFS·DFS 범위.",
    location: "LMS",
    source: "알고리즘_주차별안내.pdf",
    extracted: "2차 퀴즈: 5월 15일 23:59 / 그래프 BFS·DFS",
    confidence: "높음",
  },
  {
    id: "candidate-db-meeting",
    date: "2026-05-15",
    title: "DB 팀플 회의",
    time: "오후 7:00",
    color: "#27d6a3",
    calendar: "개인",
    detail: "팀플 메모에서 회의 시간 후보를 찾았어요. 안건: 발표 역할, ERD 수정.",
    location: "온라인",
    online: true,
    source: "DB팀플_회의메모.txt",
    extracted: "금요일 19:00 온라인 / 안건: 발표 역할, ERD 수정",
    confidence: "보통",
  },
  {
    id: "candidate-ds-final",
    date: "2026-06-12",
    title: "자료구조 기말고사",
    time: "오후 2:00",
    color: "#ff6b7d",
    calendar: "과제·마감",
    detail: "강의계획서 기말 일정. 범위: 그래프·DP·해시.",
    location: "공학관 401호",
    source: "자료구조_강의계획서.pdf",
    extracted: "기말고사: 6월 12일 14:00 / 공학관 401",
    confidence: "높음",
  },
  {
    id: "candidate-os-report",
    date: "2026-05-22",
    title: "운영체제 보고서 제출",
    time: "오후 11:59",
    color: "#ff6b7d",
    calendar: "과제·마감",
    detail: "스레드 동기화 사례 분석 보고서. 분량 4쪽 이상.",
    location: "LMS",
    source: "운영체제_보고서안내.pdf",
    extracted: "보고서 제출: 5월 22일 23:59 / 분량 4쪽 이상",
    confidence: "보통",
  },
  {
    id: "candidate-club-meet",
    date: "2026-05-20",
    title: "스터디 모임",
    time: "오후 6:30",
    color: "#27d6a3",
    calendar: "개인",
    detail: "동아리 단톡 캡처에서 시간 후보를 잡았어요.",
    location: "공학관 라운지",
    source: "스터디_단톡캡처.png",
    extracted: "수요일 18:30 라운지 / 발제 윤지",
    confidence: "낮음",
  },
];

const KOREAN_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function parseDate(key: string) {
  const [y, m, d] = key.split("-").map((part) => Number(part));
  return new Date(y, m - 1, d);
}

function diffDays(from: string, to: string) {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function buildMonthCells(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: { key: string; label: string; muted: boolean; today: boolean; weekend: number }[] =
    [];

  for (let i = firstDay - 1; i >= 0; i -= 1) {
    const d = new Date(year, month, -i);
    cells.push({
      key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      label: String(d.getDate()),
      muted: true,
      today: false,
      weekend: d.getDay(),
    });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = `${year}-${pad(month + 1)}-${pad(day)}`;
    cells.push({
      key,
      label: String(day),
      muted: false,
      today: key === TODAY_KEY,
      weekend: new Date(year, month, day).getDay(),
    });
  }
  while (cells.length % 7 !== 0) {
    const next = cells.length - (firstDay + daysInMonth) + 1;
    const d = new Date(year, month + 1, next);
    cells.push({
      key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      label: String(d.getDate()),
      muted: true,
      today: false,
      weekend: d.getDay(),
    });
  }
  return cells;
}

function hexToRgba(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function eventTintStyle(color: string, alpha = 0.12): CSSProperties {
  return {
    "--event-color": color,
    "--event-bg": hexToRgba(color, alpha),
  } as CSSProperties;
}

function shortTime(time?: string) {
  if (!time) return "";
  const match = time.match(/(오전|오후)\s*(\d{1,2}):(\d{2})/);
  if (!match) return time;
  const period = match[1];
  let hour = parseInt(match[2], 10);
  const min = match[3];
  if (period === "오후" && hour !== 12) hour += 12;
  if (period === "오전" && hour === 12) hour = 0;
  return `${pad(hour)}:${min}`;
}

const CONFIDENCE_RANK: Record<string, number> = { 높음: 0, 보통: 1, 낮음: 2 };

function candidatePriority(c: SourceScheduleCandidate) {
  const isDeadline = c.calendar === "과제·마감" ? 0 : 1;
  const days = Math.max(0, diffDays(TODAY_KEY, c.date));
  const conf = CONFIDENCE_RANK[c.confidence] ?? 99;
  return [isDeadline, days, conf] as const;
}

function sortCandidates(list: SourceScheduleCandidate[]) {
  return [...list].sort((a, b) => {
    const pa = candidatePriority(a);
    const pb = candidatePriority(b);
    for (let i = 0; i < pa.length; i += 1) {
      if (pa[i] !== pb[i]) return pa[i] - pb[i];
    }
    return 0;
  });
}

export default function CalendarPage() {
  const [userEvents, setUserEvents] = useState<CalendarEvent[]>([]);
  const [hiddenCalendars, setHiddenCalendars] = useState<CalendarKey[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(TODAY_KEY);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draftPreset, setDraftPreset] = useState<CalendarEvent | null>(null);
  const [viewMonth, setViewMonth] = useState({ year: 2026, month: 4 });
  const [candidates, setCandidates] = useState<SourceScheduleCandidate[]>(
    SOURCE_SCHEDULE_CANDIDATES_INITIAL,
  );
  const [reviewOpen, setReviewOpen] = useState(false);

  const savedEvents = [...EVENTS, ...userEvents];
  const visibleEvents = savedEvents.filter((e) => !hiddenCalendars.includes(e.calendar));
  const sortedCandidates = useMemo(() => sortCandidates(candidates), [candidates]);

  const monthCells = useMemo(() => buildMonthCells(viewMonth.year, viewMonth.month), [viewMonth]);

  const draftBase = draftPreset ?? DRAFT_EVENT;
  const draftEvent = { ...draftBase, id: `draft-${selectedDate}`, date: selectedDate };
  const selectedEvent = creating
    ? draftEvent
    : (savedEvents.find((e) => e.id === selectedEventId) ?? null);

  const semesterDaysLeft = diffDays(TODAY_KEY, SEMESTER_END);
  const todayEvents = visibleEvents.filter((e) => e.date === TODAY_KEY);
  const weekDeadlines = visibleEvents.filter((e) => {
    const delta = diffDays(TODAY_KEY, e.date);
    return delta >= 0 && delta <= 7 && e.calendar === "과제·마감";
  });
  const monthLabel = `${viewMonth.year}년 ${viewMonth.month + 1}월`;

  function toggleCalendar(calendar: CalendarKey) {
    setHiddenCalendars((items) =>
      items.includes(calendar) ? items.filter((i) => i !== calendar) : [...items, calendar],
    );
  }

  function openEvent(event: CalendarEvent) {
    setCreating(false);
    setSelectedEventId(event.id);
    setSelectedDate(event.date);
  }

  function openCreate(date = TODAY_KEY, preset?: CalendarEvent) {
    setSelectedDate(preset?.date ?? date);
    setDraftPreset(preset ?? null);
    setSelectedEventId(null);
    setCreating(true);
  }

  function closePanel() {
    setCreating(false);
    setSelectedEventId(null);
    setDraftPreset(null);
  }

  function saveEvent(event: CalendarEvent) {
    if (creating) {
      const presetId = draftPreset?.id;
      setUserEvents((items) => [
        ...items,
        {
          ...event,
          id: `user-${Date.now()}`,
          color: CALENDARS.find((c) => c.id === event.calendar)?.color ?? event.color,
        },
      ]);
      if (presetId) {
        setCandidates((list) => list.filter((c) => c.id !== presetId));
      }
    }
    closePanel();
  }

  function dismissCandidate(id: string) {
    setCandidates((list) => list.filter((c) => c.id !== id));
  }

  function shiftMonth(delta: number) {
    setViewMonth((prev) => {
      const next = new Date(prev.year, prev.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  function jumpToToday() {
    const t = parseDate(TODAY_KEY);
    setViewMonth({ year: t.getFullYear(), month: t.getMonth() });
    setSelectedDate(TODAY_KEY);
  }

  return (
    <div className="min-h-full bg-[var(--color-apple-pearl)] text-[var(--color-apple-ink)]">
      <div className="mx-auto w-full max-w-[1480px] px-6 pb-24 pt-8 sm:px-8 sm:pt-12 lg:px-10 lg:pb-16">
        {/* Eyebrow */}
        <header className="fade-up flex items-baseline justify-between gap-3">
          <span className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
            학기 흐름
          </span>
          <span className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
            2026 봄 · 5주차
          </span>
        </header>

        {/* Hero */}
        <section className="mt-8 fade-up fade-up-1 sm:mt-10">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <h1
              className="text-[34px] leading-[1.05] wght-620 text-[var(--color-apple-ink)] sm:text-[44px] md:text-[52px]"
              style={{ letterSpacing: "-0.012em" }}
            >
              {monthLabel}
            </h1>
            <div
              className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[13px] wght-450 text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              <span>
                종강까지{" "}
                <span className="wght-620 text-[var(--color-apple-ink)]">D-{semesterDaysLeft}</span>
              </span>
              <span className="text-[var(--color-apple-hairline)]">·</span>
              <span>
                이번 주 마감{" "}
                <span
                  className={cn(
                    "wght-620",
                    weekDeadlines.length > 0 ? "text-[#e0445e]" : "text-[var(--color-apple-ink)]",
                  )}
                >
                  {weekDeadlines.length}건
                </span>
              </span>
              <span className="text-[var(--color-apple-hairline)]">·</span>
              <span>
                오늘{" "}
                <span className="wght-620 text-[var(--color-apple-ink)]">
                  {todayEvents.length}건
                </span>
              </span>
            </div>
          </div>
        </section>

        {/* Main two-column: big calendar + inspector */}
        <div className="mt-10 grid gap-6 fade-up fade-up-2 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
          {/* Big Calendar */}
          <section className="overflow-hidden rounded-[16px] border border-[var(--color-apple-hairline)] bg-white">
            {/* Calendar toolbar */}
            <div className="flex items-center justify-between gap-3 border-b border-[var(--color-apple-hairline)] px-4 py-3 sm:px-5">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  aria-label="이전 달"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]"
                >
                  <ChevronLeft size={18} strokeWidth={2.2} />
                </button>
                <button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  aria-label="다음 달"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]"
                >
                  <ChevronRight size={18} strokeWidth={2.2} />
                </button>
                <button
                  type="button"
                  onClick={jumpToToday}
                  className="ml-2 inline-flex h-8 items-center rounded-[8px] border border-[var(--color-apple-hairline)] bg-white px-3 text-[12.5px] wght-560 text-[var(--color-apple-ink)] transition-colors hover:bg-[var(--color-apple-pearl)]"
                >
                  오늘
                </button>
              </div>

              {/* Filter chips */}
              <div className="hidden flex-wrap items-center gap-1.5 sm:flex">
                {CALENDARS.map((cal) => {
                  const active = !hiddenCalendars.includes(cal.id);
                  return (
                    <button
                      key={cal.id}
                      type="button"
                      onClick={() => toggleCalendar(cal.id)}
                      aria-pressed={active}
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[12px] wght-560 transition-colors",
                        active
                          ? "border-[var(--color-apple-hairline)] bg-white text-[var(--color-apple-ink)] hover:bg-[var(--color-apple-pearl)]"
                          : "border-[var(--color-apple-hairline)] bg-[var(--color-apple-pearl)] text-[var(--color-apple-muted)]",
                      )}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{
                          backgroundColor: active ? cal.color : "transparent",
                          border: `1.5px solid ${cal.color}`,
                        }}
                        aria-hidden
                      />
                      {cal.label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => openCreate(selectedDate)}
                className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-[var(--color-apple-action)] px-3 text-[12.5px] wght-560 text-white transition-colors hover:bg-[var(--color-apple-action-hover)]"
              >
                <Plus size={14} strokeWidth={2.4} />
                일정 추가
              </button>
            </div>

            {/* Weekday header */}
            <div className="grid grid-cols-7 border-b border-[var(--color-apple-hairline)] bg-[var(--color-apple-pearl)]">
              {KOREAN_WEEKDAYS.map((day, i) => (
                <div
                  key={day}
                  className={cn(
                    "py-2.5 text-center text-[11px] wght-560 uppercase tracking-[0.06em]",
                    i === 0 ? "text-[#e0445e]" : "text-[var(--color-apple-muted)]",
                  )}
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Month grid */}
            <div
              className="month-grid grid grid-cols-7"
              style={{ ["--rows" as string]: monthCells.length / 7 } as CSSProperties}
            >
              {monthCells.map((cell, index) => {
                const cellEvents = visibleEvents.filter((e) => e.date === cell.key);
                const isSelected = cell.key === selectedDate;
                const lastCol = (index + 1) % 7 === 0;
                const lastRow = index >= monthCells.length - 7;
                return (
                  <div
                    key={cell.key}
                    role="gridcell"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedDate(cell.key);
                      setSelectedEventId(null);
                      setCreating(false);
                    }}
                    onDoubleClick={() => openCreate(cell.key)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedDate(cell.key);
                        setSelectedEventId(null);
                        setCreating(false);
                      }
                    }}
                    className={cn(
                      "group relative flex cursor-pointer flex-col items-stretch gap-1 px-1.5 py-1.5 text-left transition-colors outline-none sm:px-2 sm:py-2",
                      "focus-visible:ring-2 focus-visible:ring-[var(--color-apple-action)] focus-visible:ring-inset",
                      !lastCol && "border-r border-[var(--color-apple-hairline)]",
                      !lastRow && "border-b border-[var(--color-apple-hairline)]",
                      cell.muted
                        ? "bg-[var(--color-apple-pearl)]"
                        : "bg-white hover:bg-[var(--color-apple-pearl)]",
                      isSelected && !cell.today && "bg-[#f0f7ff]",
                    )}
                  >
                    {/* Day number */}
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[12px] wght-620 tabular-nums transition-colors",
                          cell.today
                            ? "bg-[var(--color-apple-action)] text-white"
                            : cell.muted
                              ? "text-[var(--color-apple-muted)]"
                              : cell.weekend === 0
                                ? "text-[#e0445e]"
                                : "text-[var(--color-apple-ink)]",
                        )}
                      >
                        {cell.label}
                      </span>
                      {isSelected && !cell.today && (
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-[var(--color-apple-action)]"
                          aria-hidden
                        />
                      )}
                    </div>

                    {/* Events */}
                    <div className="flex flex-col gap-0.5">
                      {cellEvents.slice(0, 3).map((event) => (
                        <button
                          key={event.id}
                          type="button"
                          onClick={(clickEvent) => {
                            clickEvent.stopPropagation();
                            openEvent(event);
                          }}
                          className={cn(
                            "flex min-h-[20px] items-center gap-1 overflow-hidden rounded-[5px] px-1.5 text-left text-[11px] leading-[1.2] wght-560 transition-colors",
                            event.allDay
                              ? "bg-[var(--event-bg)] text-[var(--color-apple-ink)]"
                              : "bg-transparent text-[var(--color-apple-ink)] hover:bg-white",
                          )}
                          style={eventTintStyle(event.color, event.allDay ? 0.2 : 0)}
                        >
                          {!event.allDay && (
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ backgroundColor: event.color }}
                              aria-hidden
                            />
                          )}
                          <span className="min-w-0 truncate">
                            {!event.allDay && event.time && (
                              <span className="text-[var(--color-apple-muted)] tabular-nums">
                                {shortTime(event.time)}{" "}
                              </span>
                            )}
                            {event.title}
                          </span>
                        </button>
                      ))}
                      {cellEvents.length > 3 && (
                        <span className="px-1.5 text-[10.5px] wght-560 text-[var(--color-apple-muted)]">
                          +{cellEvents.length - 3}건 더
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Inspector */}
          <Inspector
            selectedDate={selectedDate}
            allEvents={visibleEvents}
            calendars={CALENDARS}
            hiddenCalendars={hiddenCalendars}
            candidates={sortedCandidates}
            onToggleCalendar={toggleCalendar}
            onSelectEvent={openEvent}
            onCreate={(date) => openCreate(date)}
            onAddCandidate={(c) => openCreate(c.date, c)}
            onDismissCandidate={dismissCandidate}
            onOpenReview={() => setReviewOpen(true)}
          />
        </div>
      </div>

      {reviewOpen && (
        <ReviewModal
          candidates={sortedCandidates}
          onClose={() => setReviewOpen(false)}
          onAdd={(c) => {
            setReviewOpen(false);
            openCreate(c.date, c);
          }}
          onDismiss={dismissCandidate}
        />
      )}

      {selectedEvent && (
        <EventDetailPanel
          key={selectedEvent.id}
          event={selectedEvent}
          creating={creating}
          onClose={closePanel}
          onSave={saveEvent}
        />
      )}
    </div>
  );
}

function Inspector({
  selectedDate,
  allEvents,
  calendars,
  hiddenCalendars,
  candidates,
  onToggleCalendar,
  onSelectEvent,
  onCreate,
  onAddCandidate,
  onDismissCandidate,
  onOpenReview,
}: {
  selectedDate: string;
  allEvents: CalendarEvent[];
  calendars: { id: CalendarKey; label: string; color: string }[];
  hiddenCalendars: CalendarKey[];
  candidates: SourceScheduleCandidate[];
  onToggleCalendar: (calendar: CalendarKey) => void;
  onSelectEvent: (event: CalendarEvent) => void;
  onCreate: (date: string) => void;
  onAddCandidate: (candidate: SourceScheduleCandidate) => void;
  onDismissCandidate: (id: string) => void;
  onOpenReview: () => void;
}) {
  const dateEvents = allEvents
    .filter((e) => e.date === selectedDate)
    .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  const upcoming = allEvents
    .filter((e) => {
      const delta = diffDays(TODAY_KEY, e.date);
      return delta > 0 && delta <= 14;
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  const d = parseDate(selectedDate);
  const isToday = selectedDate === TODAY_KEY;
  const headLabel = isToday
    ? "오늘"
    : `${d.getMonth() + 1}월 ${d.getDate()}일 (${KOREAN_WEEKDAYS[d.getDay()]})`;

  return (
    <aside className="space-y-5">
      {/* Selected date detail */}
      <section className="overflow-hidden rounded-[14px] border border-[var(--color-apple-hairline)] bg-white">
        <header className="flex items-center justify-between gap-3 border-b border-[var(--color-apple-hairline)] px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
              {isToday ? "오늘" : "선택한 날짜"}
            </p>
            <h2
              className="mt-1 text-[17px] wght-620 text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              {headLabel}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onCreate(selectedDate)}
            aria-label="이 날짜에 일정 추가"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-[var(--color-apple-hairline)] bg-white text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]"
          >
            <Plus size={14} strokeWidth={2.4} />
          </button>
        </header>
        {dateEvents.length === 0 ? (
          <button
            type="button"
            onClick={() => onCreate(selectedDate)}
            className="block w-full px-5 py-6 text-left text-[13px] wght-450 text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-apple-pearl)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            비어 있어요. 누르면 일정이 추가돼요.
          </button>
        ) : (
          <ul>
            {dateEvents.map((event, i) => (
              <li
                key={event.id}
                className={cn(i > 0 && "border-t border-[var(--color-apple-hairline)]")}
              >
                <button
                  type="button"
                  onClick={() => onSelectEvent(event)}
                  className="flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors hover:bg-[var(--color-apple-pearl)]"
                >
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: event.color }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-[14px] wght-560 text-[var(--color-apple-ink)]"
                      style={{ letterSpacing: "-0.012em" }}
                    >
                      {event.title}
                    </span>
                    <span className="mt-1 block truncate text-[12px] wght-450 text-[var(--color-apple-muted)]">
                      {event.allDay ? "종일" : (event.time ?? "시간 미정")}
                      {event.location && ` · ${event.location}`}
                      {event.online && " · 온라인"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* AI candidates */}
      {candidates.length > 0 && (
        <section className="overflow-hidden rounded-[14px] border border-[var(--color-apple-hairline)] bg-white">
          <header className="flex items-center justify-between gap-3 border-b border-[var(--color-apple-hairline)] px-5 py-3.5">
            <div className="inline-flex items-center gap-1.5">
              <Sparkles
                size={13}
                strokeWidth={2.4}
                style={{ color: "var(--color-apple-cobalt)" }}
              />
              <h2
                className="text-[11px] wght-560 uppercase tracking-[0.06em]"
                style={{ color: "var(--color-apple-cobalt)" }}
              >
                자료에서 찾은 일정
              </h2>
            </div>
            <span className="text-[11px] wght-560 text-[var(--color-apple-muted)]">
              {candidates.length}건
            </span>
          </header>
          <ul>
            {candidates.slice(0, 3).map((candidate, i) => {
              const delta = diffDays(TODAY_KEY, candidate.date);
              const tone =
                delta <= 3 && candidate.calendar === "과제·마감"
                  ? {
                      bg: "#fff0f3",
                      color: "var(--color-apple-coral)",
                      label: delta <= 0 ? "오늘" : `D-${delta}`,
                    }
                  : delta <= 7
                    ? {
                        bg: "var(--color-apple-pearl)",
                        color: "var(--color-apple-ink)",
                        label: `D-${delta}`,
                      }
                    : {
                        bg: "var(--color-apple-pearl)",
                        color: "var(--color-apple-muted)",
                        label: `D-${delta}`,
                      };
              return (
                <li
                  key={candidate.id}
                  className={cn(i > 0 && "border-t border-[var(--color-apple-hairline)]")}
                >
                  <button
                    type="button"
                    onClick={() => onAddCandidate(candidate)}
                    className="group flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors hover:bg-[var(--color-apple-pearl)]"
                  >
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: candidate.color }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span
                          className="truncate text-[14px] wght-560 text-[var(--color-apple-ink)]"
                          style={{ letterSpacing: "-0.012em" }}
                        >
                          {candidate.title}
                        </span>
                        <span
                          className="shrink-0 rounded-[5px] px-1.5 py-0.5 text-[10px] wght-620 tabular-nums"
                          style={{ backgroundColor: tone.bg, color: tone.color }}
                        >
                          {tone.label}
                        </span>
                      </span>
                      <span className="mt-1 block truncate text-[12px] wght-450 text-[var(--color-apple-muted)]">
                        {(() => {
                          const cd = parseDate(candidate.date);
                          return `${cd.getMonth() + 1}/${cd.getDate()} · ${candidate.time ?? "종일"} · ${candidate.source}`;
                        })()}
                      </span>
                    </span>
                    <span
                      className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full text-[14px] wght-560 text-[var(--color-apple-hairline)] transition-colors group-hover:bg-[var(--color-apple-action)] group-hover:text-white"
                      aria-hidden
                    >
                      +
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={onOpenReview}
            className="group flex w-full items-center justify-between gap-3 border-t border-[var(--color-apple-hairline)] bg-[var(--color-apple-pearl)] px-5 py-3 text-left transition-colors hover:bg-white"
          >
            <span
              className="text-[12.5px] wght-560 text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              {candidates.length > 3
                ? `${candidates.length - 3}건 더 검토하기`
                : "모두 한 번에 검토하기"}
            </span>
            <span
              className="text-[14px] text-[var(--color-apple-muted)] transition-transform group-hover:translate-x-0.5"
              aria-hidden
            >
              ›
            </span>
          </button>
        </section>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <section className="overflow-hidden rounded-[14px] border border-[var(--color-apple-hairline)] bg-white">
          <header className="flex items-center justify-between gap-3 border-b border-[var(--color-apple-hairline)] px-5 py-3.5">
            <h2 className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
              다가오는 14일
            </h2>
            <span className="text-[11px] wght-560 text-[var(--color-apple-muted)]">
              {upcoming.length}건
            </span>
          </header>
          <ul>
            {upcoming.map((event, i) => {
              const ed = parseDate(event.date);
              const delta = diffDays(TODAY_KEY, event.date);
              return (
                <li
                  key={event.id}
                  className={cn(i > 0 && "border-t border-[var(--color-apple-hairline)]")}
                >
                  <button
                    type="button"
                    onClick={() => onSelectEvent(event)}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-[var(--color-apple-pearl)]"
                  >
                    <span className="w-[48px] shrink-0">
                      <span className="block text-[12px] wght-620 text-[var(--color-apple-ink)]">
                        {ed.getMonth() + 1}/{ed.getDate()}
                      </span>
                      <span className="mt-0.5 block text-[10.5px] wght-560 text-[var(--color-apple-muted)]">
                        D-{delta}
                      </span>
                    </span>
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: event.color }}
                      aria-hidden
                    />
                    <span
                      className="min-w-0 flex-1 truncate text-[13.5px] wght-560 text-[var(--color-apple-ink)]"
                      style={{ letterSpacing: "-0.012em" }}
                    >
                      {event.title}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Calendar legend */}
      <section className="overflow-hidden rounded-[14px] border border-[var(--color-apple-hairline)] bg-white">
        <header className="border-b border-[var(--color-apple-hairline)] px-5 py-3.5">
          <h2 className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
            캘린더
          </h2>
        </header>
        <div className="space-y-0.5 p-2">
          {calendars.map((cal) => {
            const active = !hiddenCalendars.includes(cal.id);
            const count = allEvents.filter((e) => e.calendar === cal.id).length;
            return (
              <button
                key={cal.id}
                type="button"
                onClick={() => onToggleCalendar(cal.id)}
                className="flex h-8 w-full items-center justify-between rounded-[6px] px-2 text-left transition-colors hover:bg-[var(--color-apple-pearl)]"
              >
                <span className="inline-flex items-center gap-2.5">
                  <span
                    className="inline-flex h-3 w-3 items-center justify-center rounded-[3px] text-white"
                    style={{
                      backgroundColor: active ? cal.color : "transparent",
                      border: `1.5px solid ${cal.color}`,
                    }}
                    aria-hidden
                  >
                    {active && <Check size={9} strokeWidth={3.2} />}
                  </span>
                  <span
                    className={cn(
                      "text-[13px] wght-450",
                      active ? "text-[var(--color-apple-ink)]" : "text-[var(--color-apple-muted)]",
                    )}
                  >
                    {cal.label}
                  </span>
                </span>
                <span className="text-[11px] wght-560 text-[var(--color-apple-muted)]">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </aside>
  );
}

function ReviewModal({
  candidates,
  onClose,
  onAdd,
  onDismiss,
}: {
  candidates: SourceScheduleCandidate[];
  onClose: () => void;
  onAdd: (candidate: SourceScheduleCandidate) => void;
  onDismiss: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(candidates[0]?.id ?? null);
  const selected = candidates.find((c) => c.id === selectedId) ?? candidates[0] ?? null;
  const remaining = candidates.length;

  function handleDismiss(id: string) {
    const idx = candidates.findIndex((c) => c.id === id);
    onDismiss(id);
    const next = candidates[idx + 1] ?? candidates[idx - 1];
    setSelectedId(next?.id ?? null);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 sm:p-6"
      onClick={onClose}
    >
      <section
        onClick={(e) => e.stopPropagation()}
        className="flex h-full max-h-[min(720px,calc(100dvh-32px))] w-full max-w-[920px] flex-col overflow-hidden rounded-[16px] border border-[var(--color-apple-hairline)] bg-white shadow-[0_30px_60px_-30px_rgba(0,0,0,0.25)]"
      >
        <header className="flex items-center justify-between gap-3 border-b border-[var(--color-apple-hairline)] px-6 py-4">
          <div>
            <p
              className="inline-flex items-center gap-1.5 text-[11px] wght-560 uppercase tracking-[0.06em]"
              style={{ color: "var(--color-apple-cobalt)" }}
            >
              <Sparkles size={12} strokeWidth={2.4} />
              자료에서 찾은 일정
            </p>
            <h2
              className="mt-1 text-[22px] wght-620 text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              검토할 후보 {remaining}건
            </h2>
            <p
              className="mt-1 text-[12.5px] wght-450 text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              우선순위 순으로 정렬했어요. 추가 전에 원문 근거를 한 번 확인해주세요.
            </p>
          </div>
          <PanelIconButton label="닫기" icon={X} onClick={onClose} />
        </header>

        {remaining === 0 || !selected ? (
          <div className="flex flex-1 items-center justify-center px-8 py-16 text-center">
            <div>
              <p
                className="text-[15px] wght-560 text-[var(--color-apple-ink)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                검토할 후보가 없어요.
              </p>
              <p className="mt-1.5 text-[13px] wght-450 text-[var(--color-apple-muted)]">
                새 자료를 올리면 일정 후보가 다시 채워져요.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[280px_minmax(0,1fr)]">
            {/* Left list */}
            <aside className="min-h-0 overflow-y-auto border-r border-[var(--color-apple-hairline)] bg-[var(--color-apple-pearl)]">
              <ul>
                {candidates.map((c) => {
                  const delta = diffDays(TODAY_KEY, c.date);
                  const isActive = c.id === selected.id;
                  const urgent = c.calendar === "과제·마감" && delta <= 3;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(c.id)}
                        className={cn(
                          "flex w-full items-start gap-2.5 border-b border-[var(--color-apple-hairline)] px-4 py-3 text-left transition-colors",
                          isActive ? "bg-white" : "hover:bg-white",
                        )}
                      >
                        <span
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: c.color }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span
                              className={cn(
                                "truncate text-[13px] wght-560",
                                isActive
                                  ? "text-[var(--color-apple-ink)]"
                                  : "text-[var(--color-apple-ink)]",
                              )}
                              style={{ letterSpacing: "-0.012em" }}
                            >
                              {c.title}
                            </span>
                            <span
                              className="shrink-0 rounded-[5px] px-1.5 py-0.5 text-[10px] wght-620 tabular-nums"
                              style={{
                                backgroundColor: urgent ? "#fff0f3" : "white",
                                color: urgent ? "#e0445e" : "var(--color-apple-muted)",
                                border: urgent ? "none" : "1px solid var(--color-apple-hairline)",
                              }}
                            >
                              D-{Math.max(0, delta)}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-[11.5px] wght-450 text-[var(--color-apple-muted)]">
                            {(() => {
                              const cd = parseDate(c.date);
                              return `${cd.getMonth() + 1}/${cd.getDate()} · ${c.time ?? "종일"}`;
                            })()}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>

            {/* Right detail */}
            <div className="flex min-h-0 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8 sm:py-8">
                {/* Title block */}
                <div className="flex items-baseline gap-2.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: selected.color }}
                    aria-hidden
                  />
                  <span className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
                    {selected.calendar}
                  </span>
                  <span className="text-[11px] wght-560 text-[var(--color-apple-muted)]">·</span>
                  <span className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
                    확신도 {selected.confidence}
                  </span>
                </div>
                <h3
                  className="mt-2 text-[26px] leading-[1.15] wght-620 text-[var(--color-apple-ink)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  {selected.title}
                </h3>

                {/* Meta grid */}
                <dl
                  className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] wght-450"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  <div>
                    <dt className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
                      날짜
                    </dt>
                    <dd className="mt-1 text-[var(--color-apple-ink)] tabular-nums">
                      {(() => {
                        const cd = parseDate(selected.date);
                        return `${cd.getMonth() + 1}월 ${cd.getDate()}일 (${KOREAN_WEEKDAYS[cd.getDay()]})`;
                      })()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
                      시간
                    </dt>
                    <dd className="mt-1 text-[var(--color-apple-ink)] tabular-nums">
                      {selected.time ?? "종일"}
                    </dd>
                  </div>
                  {selected.location && (
                    <div>
                      <dt className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
                        장소
                      </dt>
                      <dd className="mt-1 text-[var(--color-apple-ink)]">
                        {selected.location}
                        {selected.online && " · 온라인"}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
                      D-day
                    </dt>
                    <dd className="mt-1 text-[var(--color-apple-ink)] tabular-nums">
                      D-{Math.max(0, diffDays(TODAY_KEY, selected.date))}
                    </dd>
                  </div>
                </dl>

                {/* Source quote */}
                <section className="mt-7">
                  <h4 className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
                    원문 근거
                  </h4>
                  <blockquote
                    className="mt-2 rounded-[10px] border border-[var(--color-apple-hairline)] bg-[var(--color-apple-pearl)] px-4 py-3 text-[13.5px] leading-[1.55] wght-450 text-[var(--color-apple-ink)]"
                    style={{ letterSpacing: "-0.012em" }}
                  >
                    “{selected.extracted}”
                  </blockquote>
                  <p className="mt-2 text-[11.5px] wght-450 text-[var(--color-apple-muted)]">
                    출처: {selected.source}
                  </p>
                </section>

                {/* Notes */}
                {selected.detail && (
                  <section className="mt-6">
                    <h4 className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
                      메모
                    </h4>
                    <p
                      className="mt-2 text-[13.5px] leading-[1.55] wght-450 text-[var(--color-apple-ink)]"
                      style={{ letterSpacing: "-0.012em" }}
                    >
                      {selected.detail}
                    </p>
                  </section>
                )}
              </div>

              {/* Footer actions */}
              <footer className="flex items-center justify-between gap-3 border-t border-[var(--color-apple-hairline)] bg-white px-6 py-4 sm:px-8">
                <button
                  type="button"
                  onClick={() => handleDismiss(selected.id)}
                  className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-[var(--color-apple-hairline)] bg-white px-4 text-[13px] wght-560 text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]"
                >
                  <Trash2 size={14} strokeWidth={2.2} />
                  거부
                </button>
                <button
                  type="button"
                  onClick={() => onAdd(selected)}
                  className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[var(--color-apple-action)] px-5 text-[13px] wght-620 text-white transition-colors hover:bg-[var(--color-apple-action-hover)]"
                >
                  <Plus size={14} strokeWidth={2.4} />
                  일정으로 추가
                </button>
              </footer>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function EventDetailPanel({
  event,
  creating,
  onClose,
  onSave,
}: {
  event: CalendarEvent;
  creating: boolean;
  onClose: () => void;
  onSave: (event: CalendarEvent) => void;
}) {
  const [title, setTitle] = useState(event.title);
  const [eventDate, setEventDate] = useState(event.date);
  const [time, setTime] = useState(event.allDay ? "종일" : (event.time ?? ""));
  const [location, setLocation] = useState(event.online ? "온라인" : (event.location ?? ""));
  const [calendar, setCalendar] = useState<CalendarKey>(event.calendar);
  const [detail, setDetail] = useState(event.detail);
  const selectedCalendar = CALENDARS.find((item) => item.id === calendar) ?? CALENDARS[0];
  const isAllDay = time.trim() === "종일" || time.trim() === "";

  function handleSave() {
    onSave({
      ...event,
      title: title.trim() || "(제목 없음)",
      date: eventDate.trim() || event.date,
      time: isAllDay ? undefined : time.trim(),
      allDay: isAllDay,
      location: location.trim() || undefined,
      online: event.online || location.includes("온라인"),
      calendar,
      color: selectedCalendar.color,
      detail: detail.trim() || "세부 내용 없음",
    });
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 p-4 sm:items-center"
      onClick={onClose}
    >
      <section
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[460px] overflow-hidden rounded-[16px] border border-[var(--color-apple-hairline)] bg-white shadow-[0_30px_60px_-30px_rgba(0,0,0,0.25)]"
      >
        <header className="flex items-center justify-between border-b border-[var(--color-apple-hairline)] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: selectedCalendar.color }}
              aria-hidden
            />
            <span className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
              {creating ? "일정 만들기" : "일정 상세"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {!creating && <PanelIconButton label="삭제" icon={Trash2} onClick={onClose} />}
            <PanelIconButton label="닫기" icon={X} onClick={onClose} />
          </div>
        </header>

        <div className="px-5 py-5">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border-b border-[var(--color-apple-hairline)] bg-transparent pb-2 text-[22px] wght-560 text-[var(--color-apple-ink)] outline-none focus:border-[var(--color-apple-action)]"
            style={{ letterSpacing: "-0.012em" }}
            placeholder="제목"
          />

          <div className="mt-5 space-y-3">
            <DetailRow icon={Clock}>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="h-10 rounded-[10px] border border-[var(--color-apple-hairline)] bg-[var(--color-apple-pearl)] px-3 text-[13px] wght-450 text-[var(--color-apple-ink)] outline-none focus:border-[var(--color-apple-action)] focus:bg-white"
                />
                <input
                  type="text"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  placeholder="종일"
                  className="h-10 rounded-[10px] border border-[var(--color-apple-hairline)] bg-[var(--color-apple-pearl)] px-3 text-[13px] wght-450 text-[var(--color-apple-ink)] outline-none focus:border-[var(--color-apple-action)] focus:bg-white"
                />
              </div>
            </DetailRow>

            <DetailRow icon={MapPin}>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="장소 추가"
                className="h-10 w-full rounded-[10px] border border-[var(--color-apple-hairline)] bg-[var(--color-apple-pearl)] px-3 text-[13px] wght-450 text-[var(--color-apple-ink)] placeholder:text-[var(--color-apple-muted)] outline-none focus:border-[var(--color-apple-action)] focus:bg-white"
              />
            </DetailRow>

            <DetailRow icon={Video}>
              <div className="flex flex-wrap gap-1.5">
                {CALENDARS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCalendar(item.id)}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2.5 text-[11.5px] wght-560 transition-colors",
                      calendar === item.id
                        ? "bg-[var(--color-apple-ink)] text-white"
                        : "border border-[var(--color-apple-hairline)] bg-white text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-pearl)]",
                    )}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: item.color }}
                      aria-hidden
                    />
                    {item.label}
                  </button>
                ))}
              </div>
            </DetailRow>

            <DetailRow icon={Edit3}>
              <textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="메모 (제출 조건, 범위, 안건 등)"
                className="min-h-[84px] w-full resize-none rounded-[10px] border border-[var(--color-apple-hairline)] bg-[var(--color-apple-pearl)] px-3 py-2 text-[13px] leading-[1.5] wght-450 text-[var(--color-apple-ink)] placeholder:text-[var(--color-apple-muted)] outline-none focus:border-[var(--color-apple-action)] focus:bg-white"
              />
            </DetailRow>
          </div>

          <div className="mt-5 flex items-center justify-end">
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-[var(--color-apple-action)] px-5 text-[13px] wght-620 text-white transition-colors hover:bg-[var(--color-apple-action-hover)]"
            >
              <Check size={15} strokeWidth={2.4} />
              저장
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function PanelIconButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]"
    >
      <Icon size={16} strokeWidth={2.1} />
    </button>
  );
}

function DetailRow({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[24px_1fr] items-start gap-2">
      <Icon size={16} strokeWidth={2.1} className="mt-2.5 text-[var(--color-apple-muted)]" />
      {children}
    </div>
  );
}
