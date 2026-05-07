"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
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
import { cn } from "@/lib/utils";

type CalendarKey = "내 일정" | "과제·마감" | "개인" | "공휴일";
type ViewMode = "월" | "주" | "일";

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

interface MonthCell {
  key: string;
  label: string;
  currentMonth?: boolean;
  today?: boolean;
  monthLabel?: string;
}

const WEEK_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;
const VIEW_MODES: ViewMode[] = ["월", "주", "일"];
const TODAY_KEY = "2026-05-05";

const CALENDARS: { id: CalendarKey; label: string; color: string }[] = [
  { id: "내 일정", label: "내 일정", color: "#3b82ff" },
  { id: "과제·마감", label: "과제·마감", color: "#ff6b7d" },
  { id: "개인", label: "개인", color: "#27d6a3" },
  { id: "공휴일", label: "공휴일", color: "#45c989" },
];

function hexToRgba(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function eventTintStyle(color: string, alpha = 0.12): CSSProperties {
  return {
    "--event-color": color,
    "--event-bg": hexToRgba(color, alpha),
    "--event-border": hexToRgba(color, 0.22),
    "--event-text": `color-mix(in srgb, ${color} 72%, #1d1d1f)`,
  } as CSSProperties;
}

const MONTH_CELLS: MonthCell[] = [
  { key: "2026-04-26", label: "26" },
  { key: "2026-04-27", label: "27" },
  { key: "2026-04-28", label: "28" },
  { key: "2026-04-29", label: "29" },
  { key: "2026-04-30", label: "30" },
  { key: "2026-05-01", label: "1", currentMonth: true, monthLabel: "5월 1일" },
  { key: "2026-05-02", label: "2", currentMonth: true },
  { key: "2026-05-03", label: "3", currentMonth: true },
  { key: "2026-05-04", label: "4", currentMonth: true },
  { key: "2026-05-05", label: "5", currentMonth: true, today: true },
  { key: "2026-05-06", label: "6", currentMonth: true },
  { key: "2026-05-07", label: "7", currentMonth: true },
  { key: "2026-05-08", label: "8", currentMonth: true },
  { key: "2026-05-09", label: "9", currentMonth: true },
  { key: "2026-05-10", label: "10", currentMonth: true },
  { key: "2026-05-11", label: "11", currentMonth: true },
  { key: "2026-05-12", label: "12", currentMonth: true },
  { key: "2026-05-13", label: "13", currentMonth: true },
  { key: "2026-05-14", label: "14", currentMonth: true },
  { key: "2026-05-15", label: "15", currentMonth: true },
  { key: "2026-05-16", label: "16", currentMonth: true },
  { key: "2026-05-17", label: "17", currentMonth: true },
  { key: "2026-05-18", label: "18", currentMonth: true },
  { key: "2026-05-19", label: "19", currentMonth: true },
  { key: "2026-05-20", label: "20", currentMonth: true },
  { key: "2026-05-21", label: "21", currentMonth: true },
  { key: "2026-05-22", label: "22", currentMonth: true },
  { key: "2026-05-23", label: "23", currentMonth: true },
  { key: "2026-05-24", label: "24", currentMonth: true },
  { key: "2026-05-25", label: "25", currentMonth: true },
  { key: "2026-05-26", label: "26", currentMonth: true },
  { key: "2026-05-27", label: "27", currentMonth: true },
  { key: "2026-05-28", label: "28", currentMonth: true },
  { key: "2026-05-29", label: "29", currentMonth: true },
  { key: "2026-05-30", label: "30", currentMonth: true },
  { key: "2026-05-31", label: "31", currentMonth: true },
  { key: "2026-06-01", label: "1", monthLabel: "6월 1일" },
  { key: "2026-06-02", label: "2" },
  { key: "2026-06-03", label: "3" },
  { key: "2026-06-04", label: "4" },
  { key: "2026-06-05", label: "5" },
  { key: "2026-06-06", label: "6" },
];

const EVENTS: CalendarEvent[] = [
  {
    id: "labor-day",
    date: "2026-05-01",
    title: "노동절",
    color: "#45c989",
    calendar: "공휴일",
    detail: "휴일 일정입니다.",
    allDay: true,
  },
  {
    id: "ds-start",
    date: "2026-05-04",
    title: "자료구조 과제 시작",
    time: "오전 10:30",
    color: "#3b82ff",
    calendar: "과제·마감",
    detail: "BST 구현 시작. 제출 파일명은 학번.txt로 확인.",
    location: "과제",
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
    title: "인설진 수업",
    time: "오전 6:30",
    color: "#3b82ff",
    calendar: "내 일정",
    detail: "수업 전 자료 확인.",
    online: true,
  },
  {
    id: "db-rehearsal",
    date: "2026-05-07",
    title: "DB 발표 리허설",
    time: "오후 2:00",
    color: "#27d6a3",
    calendar: "내 일정",
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
    detail: "DP 기본 점화식 퀴즈. 제출 전 풀이 캡처 확인.",
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
    title: "쉬는 날 부처님오신날",
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
];

const MINI_MONTH_DAYS = [
  { label: "26", muted: true },
  { label: "27", muted: true },
  { label: "28", muted: true },
  { label: "29", muted: true },
  { label: "30", muted: true },
  { label: "1" },
  { label: "2" },
  { label: "3" },
  { label: "4" },
  { label: "5", selected: true },
  { label: "6" },
  { label: "7" },
  { label: "8" },
  { label: "9" },
  { label: "10" },
  { label: "11" },
  { label: "12" },
  { label: "13" },
  { label: "14" },
  { label: "15" },
  { label: "16" },
  { label: "17" },
  { label: "18" },
  { label: "19" },
  { label: "20" },
  { label: "21" },
  { label: "22" },
  { label: "23" },
  { label: "24" },
  { label: "25" },
  { label: "26" },
  { label: "27" },
  { label: "28" },
  { label: "29" },
  { label: "30" },
  { label: "31" },
  { label: "1", muted: true },
  { label: "2", muted: true },
  { label: "3", muted: true },
  { label: "4", muted: true },
  { label: "5", muted: true },
  { label: "6", muted: true },
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

const CAMPUS_STATS = [
  { label: "오늘", value: "2", meta: "수업 1 · 휴일" },
  { label: "마감", value: "2", meta: "이번 주" },
  { label: "팀플", value: "1", meta: "목 14:00" },
] as const;

const FLOW_RAILS = [
  { label: "수업", value: "2개", meta: "온라인 1", color: "#3b82ff" },
  { label: "과제·마감", value: "2개", meta: "제출명 확인", color: "#ff6b7d" },
  { label: "팀플", value: "1개", meta: "리허설", color: "#27d6a3" },
] as const;

const SOURCE_SCHEDULE_CANDIDATES: SourceScheduleCandidate[] = [
  {
    id: "candidate-ds-deadline",
    date: "2026-05-12",
    title: "자료구조 BST 과제 마감",
    time: "오후 11:59",
    color: "#ff6b7d",
    calendar: "과제·마감",
    detail: "과제 안내 PDF에서 찾았어요. 제출 파일명은 학번.txt, 실행 캡처 포함.",
    location: "LMS 과제함",
    source: "자료구조_과제안내.pdf",
    extracted: "제출: 5월 12일 23:59 / 파일명: 학번.txt",
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
    extracted: "중간고사 5월 18일 10:00 / 공학관 302호",
    confidence: "높음",
  },
  {
    id: "candidate-db-meeting",
    date: "2026-05-09",
    title: "DB 팀플 회의",
    time: "오후 7:00",
    color: "#27d6a3",
    calendar: "개인",
    detail: "팀플 메모에서 회의 시간 후보를 찾았어요. 안건: 발표 역할, ERD 수정.",
    location: "온라인",
    online: true,
    source: "DB팀플_회의메모.txt",
    extracted: "금요일 7시 온라인 회의 / 발표 역할 정하기",
    confidence: "보통",
  },
] as const;

export default function CalendarPage() {
  const [userEvents, setUserEvents] = useState<CalendarEvent[]>([]);
  const [visibleCalendars, setVisibleCalendars] = useState<CalendarKey[]>(
    CALENDARS.map((calendar) => calendar.id),
  );
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draftDate, setDraftDate] = useState(TODAY_KEY);
  const [draftPreset, setDraftPreset] = useState<CalendarEvent | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("월");
  const [sourcePanelOpen, setSourcePanelOpen] = useState(false);

  const savedEvents = [...EVENTS, ...userEvents];
  const visibleEvents = savedEvents.filter((event) => visibleCalendars.includes(event.calendar));
  const draftBase = draftPreset ?? DRAFT_EVENT;
  const draftEvent = { ...draftBase, id: `draft-${draftDate}`, date: draftDate };
  const calendarEvents = creating ? [...visibleEvents, draftEvent] : visibleEvents;
  const selectedEvent = creating
    ? draftEvent
    : savedEvents.find((event) => event.id === selectedEventId) ?? null;

  function toggleCalendar(calendar: CalendarKey) {
    setVisibleCalendars((items) =>
      items.includes(calendar)
        ? items.filter((item) => item !== calendar)
        : [...items, calendar],
    );
  }

  function openEvent(event: CalendarEvent) {
    setSourcePanelOpen(false);
    setCreating(false);
    setSelectedEventId(event.id);
  }

  function openCreate(date = TODAY_KEY, preset?: CalendarEvent) {
    setDraftDate(preset?.date ?? date);
    setDraftPreset(preset ?? null);
    setSourcePanelOpen(false);
    setSelectedEventId(null);
    setCreating(true);
  }

  function openSourcePanel() {
    setCreating(false);
    setSelectedEventId(null);
    setSourcePanelOpen(true);
  }

  function closePanel() {
    setCreating(false);
    setSelectedEventId(null);
    setDraftPreset(null);
  }

  function saveEvent(event: CalendarEvent) {
    if (creating) {
      setUserEvents((items) => [
        ...items,
        {
          ...event,
          id: `user-${Date.now()}`,
          color: CALENDARS.find((calendar) => calendar.id === event.calendar)?.color ?? event.color,
        },
      ]);
    }
    closePanel();
  }

  return (
    <div className="flex min-h-full flex-col bg-[linear-gradient(180deg,#fbfbfd_0%,#f5f5f7_100%)] text-[#1d1d1f] md:h-full md:overflow-hidden">
      <CalendarTopBar
        viewMode={viewMode}
        onViewMode={setViewMode}
        onCreate={openCreate}
        onToday={() => setViewMode("일")}
      />
      <div className="flex min-h-0 flex-1">
        <CalendarSidebar
          visibleCalendars={visibleCalendars}
          onToggleCalendar={toggleCalendar}
          onCreate={openCreate}
          onOpenSourcePanel={openSourcePanel}
        />
        <main className="relative min-w-0 flex-1 overflow-hidden border-l border-[#e5e5ea] bg-[#fbfbfd]">
          <div className="h-full overflow-auto">
            <MobileCalendarSurface
              viewMode={viewMode}
              events={calendarEvents}
              onSelectEvent={openEvent}
              onCreateDate={openCreate}
              onOpenSourcePanel={openSourcePanel}
            />
            <div className="hidden h-full md:block">
              {viewMode === "월" && (
                <MonthCalendar
                  events={calendarEvents}
                  onSelectEvent={openEvent}
                  onCreateDate={openCreate}
                />
              )}
              {viewMode === "주" && (
                <WeekCalendar
                  events={calendarEvents}
                  onSelectEvent={openEvent}
                  onCreateDate={openCreate}
                />
              )}
              {viewMode === "일" && (
                <DayCalendar
                  events={calendarEvents}
                  onSelectEvent={openEvent}
                  onCreateDate={openCreate}
                />
              )}
            </div>
          </div>
          {selectedEvent && (
            <EventDetailPanel
              key={selectedEvent.id}
              event={selectedEvent}
              creating={creating}
              onClose={closePanel}
              onSave={saveEvent}
            />
          )}
          {sourcePanelOpen && (
            <SourceSchedulePanel
              candidates={SOURCE_SCHEDULE_CANDIDATES}
              onClose={() => setSourcePanelOpen(false)}
              onAddCandidate={(candidate) => openCreate(candidate.date, candidate)}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function CalendarTopBar({
  viewMode,
  onViewMode,
  onCreate,
  onToday,
}: {
  viewMode: ViewMode;
  onViewMode: (mode: ViewMode) => void;
  onCreate: () => void;
  onToday: () => void;
}) {
  return (
    <header className="z-20 flex min-h-[64px] shrink-0 items-center gap-3 border-b border-[#e5e5ea] bg-white/72 px-3 backdrop-blur-xl md:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <ArchCalendarMark />
        <span className="hidden text-[20px] wght-620 kerning-tight text-[#1d1d1f] sm:block">
          Campus Flow
        </span>
      </div>

      <button
        type="button"
        onClick={onToday}
        className="ml-1 hidden h-10 shrink-0 items-center rounded-lg border border-[#d2d2d7] bg-white/70 px-5 text-[14px] wght-560 text-[#1d1d1f] shadow-[0_1px_1px_rgba(0,0,0,0.03)] transition-colors hover:bg-white md:inline-flex"
      >
        오늘
      </button>
      <h1 className="min-w-0 flex-1 truncate text-[20px] wght-620 kerning-tight text-[#1d1d1f] sm:text-[25px]">
        2026년 5월 학기 흐름
      </h1>
      <span className="hidden shrink-0 rounded-lg bg-white/72 px-3 py-2 text-[12px] wght-620 text-[#6e6e73] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)] xl:inline-flex">
        봄학기 5주차
      </span>

      <div className="flex h-9 shrink-0 overflow-hidden rounded-lg border border-[#d8d8de] bg-[#f2f2f7] p-0.5 sm:h-10">
        {VIEW_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onViewMode(mode)}
            aria-pressed={viewMode === mode}
            className={cn(
              "inline-flex min-w-9 items-center justify-center rounded-md px-2 text-[13px] wght-620 transition-all sm:min-w-12 sm:px-3 sm:text-[14px]",
              viewMode === mode
                ? "bg-white text-[#1d1d1f] shadow-[0_1px_4px_rgba(0,0,0,0.12)]"
                : "text-[#6e6e73] hover:text-[#1d1d1f]",
            )}
          >
            {mode}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onCreate()}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#0a84ff] text-white shadow-[0_6px_16px_-8px_rgba(10,132,255,0.8)] transition-colors hover:bg-[#0071e3] md:hidden"
        aria-label="일정 만들기"
      >
        <Plus size={22} strokeWidth={2.4} />
      </button>
    </header>
  );
}

function CalendarSidebar({
  visibleCalendars,
  onToggleCalendar,
  onCreate,
  onOpenSourcePanel,
}: {
  visibleCalendars: CalendarKey[];
  onToggleCalendar: (calendar: CalendarKey) => void;
  onCreate: () => void;
  onOpenSourcePanel: () => void;
}) {
  const [myCalendarsOpen, setMyCalendarsOpen] = useState(true);
  const [otherCalendarsOpen, setOtherCalendarsOpen] = useState(true);

  return (
    <aside className="hidden w-[256px] shrink-0 flex-col overflow-y-auto bg-white/46 px-3 py-4 backdrop-blur-xl lg:flex">
      <button
        type="button"
        onClick={() => onCreate()}
        className="mb-6 inline-flex h-[54px] w-[190px] items-center justify-between rounded-lg border border-white/70 bg-white/82 px-5 text-[15px] wght-620 text-[#1d1d1f] shadow-[0_14px_34px_-24px_rgba(0,0,0,0.55)] transition-all hover:-translate-y-px hover:bg-white"
      >
        <span className="inline-flex items-center gap-4">
          <Plus size={28} strokeWidth={2.1} />
          만들기
        </span>
        <ChevronDown size={17} strokeWidth={2} />
      </button>

      <MiniMonth />

      <button
        type="button"
        onClick={onOpenSourcePanel}
        className="mt-5 w-full rounded-lg border border-white/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.88)_0%,rgba(235,244,255,0.72)_52%,rgba(238,255,249,0.62)_100%)] p-3 text-left text-[#1d1d1f] shadow-[0_18px_38px_-30px_rgba(47,124,246,0.72)] backdrop-blur-xl transition-all hover:-translate-y-px hover:border-[#c8ddff]"
      >
        <span className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-[#3b82ff]/10 px-2 py-1 text-[10.5px] wght-750 text-[#3b82ff]">
            <Sparkles size={12} strokeWidth={2.4} />
            AI 일정 추출
          </span>
          <span className="rounded-md border border-white/80 bg-white/70 px-2 py-1 text-[10.5px] wght-800 text-[#40739e]">
            3개 후보
          </span>
        </span>
        <span className="mt-3 block text-[15px] leading-tight wght-800">
          자료에서 일정 만들기
        </span>
        <span className="mt-1.5 block text-[11.5px] leading-[1.45] wght-520 text-[#5f6f83]">
          과제 안내와 강의계획서에서 마감일, 시험, 팀플 시간을 찾아 바로 추가
        </span>
      </button>

      <SidebarSection
        title="내 캘린더"
        open={myCalendarsOpen}
        onToggle={() => setMyCalendarsOpen((open) => !open)}
      >
        {CALENDARS.slice(0, 3).map((calendar) => (
          <CalendarCheckbox
            key={calendar.id}
            calendar={calendar}
            checked={visibleCalendars.includes(calendar.id)}
            onToggle={() => onToggleCalendar(calendar.id)}
          />
        ))}
      </SidebarSection>
      <SidebarSection
        title="다른 캘린더"
        open={otherCalendarsOpen}
        onToggle={() => setOtherCalendarsOpen((open) => !open)}
      >
        <CalendarCheckbox
          calendar={CALENDARS[3]}
          checked={visibleCalendars.includes(CALENDARS[3].id)}
          onToggle={() => onToggleCalendar(CALENDARS[3].id)}
        />
      </SidebarSection>

      <div className="mt-6 pb-1 text-[11px] wght-450 text-[#8e8e93]">
        이용약관 - 개인정보처리방침
      </div>
    </aside>
  );
}

function MobileCalendarSurface({
  viewMode,
  events,
  onSelectEvent,
  onCreateDate,
  onOpenSourcePanel,
}: {
  viewMode: ViewMode;
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  onCreateDate: (date: string) => void;
  onOpenSourcePanel: () => void;
}) {
  const todayEvents = events.filter((event) => event.date === TODAY_KEY);
  const upcomingEvents = events
    .filter((event) => event.date >= TODAY_KEY)
    .slice(0, 6);
  const currentMonthCells = MONTH_CELLS.filter((cell) => cell.currentMonth);
  const weekCells = MONTH_CELLS.slice(7, 14);

  return (
    <section className="grid gap-4 p-3 md:hidden">
      <div className="rounded-lg border border-white/70 bg-white/72 p-4 shadow-[0_18px_44px_-34px_rgba(0,0,0,0.56)] backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[12px] wght-620 text-[#8e8e93]">Campus Flow</p>
            <h2 className="mt-1 text-[23px] leading-tight wght-700 text-[#1d1d1f]">
              오늘 놓치면 손해 보는 것
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onCreateDate(TODAY_KEY)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#0a84ff] text-white shadow-[0_10px_22px_-14px_rgba(10,132,255,0.9)]"
            aria-label="오늘 일정 추가"
          >
            <Plus size={20} strokeWidth={2.4} />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {CAMPUS_STATS.map((item) => (
            <div key={item.label} className="rounded-lg bg-[#f2f2f7]/86 px-3 py-2">
              <p className="text-[11px] wght-620 text-[#8e8e93]">{item.label}</p>
              <p className="mt-1 text-[20px] leading-none wght-700 text-[#1d1d1f]">
                {item.value}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg bg-[#1d1d1f] p-3 text-white">
          <div className="flex items-center justify-between">
            <span className="text-[12px] wght-700">자료에서 찾은 일정</span>
            <span className="rounded-md bg-white/12 px-2 py-1 text-[10.5px] wght-700 text-white/80">
              제출 조건
            </span>
          </div>
          <p className="mt-2 text-[11.5px] leading-[1.45] text-white/68">
            제출 파일명은 학번.txt. 일정 상세에서 바로 수정할 수 있어요.
          </p>
          <button
            type="button"
            onClick={onOpenSourcePanel}
            className="mt-3 inline-flex h-8 items-center rounded-md bg-white px-3 text-[11.5px] wght-700 text-[#1d1d1f]"
          >
            후보 보기
          </button>
        </div>
      </div>

      {viewMode === "월" && (
        <>
          <div className="rounded-lg border border-white/70 bg-white/72 p-3 shadow-[0_18px_44px_-34px_rgba(0,0,0,0.56)] backdrop-blur-xl">
            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEK_LABELS.map((day) => (
                <span key={day} className="py-1 text-[10.5px] wght-620 text-[#8e8e93]">
                  {day}
                </span>
              ))}
              {currentMonthCells.map((cell) => {
                const dayEvents = events.filter((event) => event.date === cell.key);
                return (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => onCreateDate(cell.key)}
                    className={cn(
                      "min-h-[46px] rounded-lg px-1 py-1 transition-colors",
                      cell.today ? "bg-[#f4f8ff]" : "hover:bg-[#f2f2f7]",
                    )}
                  >
                    <span
                      className={cn(
                        "mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[12px] wght-700",
                        cell.today
                          ? "bg-white/70 text-[#3b82ff] shadow-[inset_0_0_0_1px_rgba(59,130,255,0.22)]"
                          : "text-[#1d1d1f]",
                      )}
                    >
                      {cell.label}
                    </span>
                    <span className="mt-1 flex h-2 items-center justify-center gap-0.5">
                      {dayEvents.slice(0, 3).map((event) => (
                        <span
                          key={event.id}
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: event.color }}
                        />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <MobileAgendaList
            title="다가오는 일정"
            events={upcomingEvents}
            onSelectEvent={onSelectEvent}
          />
        </>
      )}

      {viewMode === "주" && (
        <div className="grid gap-2">
          {weekCells.map((cell, index) => {
            const dayEvents = events.filter((event) => event.date === cell.key);
            return (
              <div
                key={cell.key}
                onClick={() => onCreateDate(cell.key)}
                className="rounded-lg border border-white/70 bg-white/72 p-3 shadow-[0_18px_44px_-34px_rgba(0,0,0,0.56)] backdrop-blur-xl"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[13px] wght-700 text-[#1d1d1f]">
                    {WEEK_LABELS[index]} · {cell.label}일
                  </span>
                  <span className="text-[11px] wght-560 text-[#8e8e93]">
                    {dayEvents.length || "빈"} 일정
                  </span>
                </div>
                <div className="grid gap-1.5">
                  {dayEvents.length > 0 ? (
                    dayEvents.map((event) => (
                      <MobileEventRow
                        key={event.id}
                        event={event}
                        onSelectEvent={onSelectEvent}
                      />
                    ))
                  ) : (
                    <p className="rounded-lg border border-dashed border-[#d8d8de] px-3 py-3 text-[12px] text-[#8e8e93]">
                      비어 있어요. 누르면 이 날짜에 추가돼요.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewMode === "일" && (
        <MobileAgendaList
          title="오늘 일정"
          events={todayEvents}
          empty="오늘은 비어 있어요. 빈 공간을 누르면 일정 추가가 열려요."
          onEmptyClick={() => onCreateDate(TODAY_KEY)}
          onSelectEvent={onSelectEvent}
        />
      )}
    </section>
  );
}

function MobileAgendaList({
  title,
  events,
  empty = "표시할 일정이 없어요.",
  onEmptyClick,
  onSelectEvent,
}: {
  title: string;
  events: CalendarEvent[];
  empty?: string;
  onEmptyClick?: () => void;
  onSelectEvent: (event: CalendarEvent) => void;
}) {
  return (
    <section className="rounded-lg border border-white/70 bg-white/72 p-3 shadow-[0_18px_44px_-34px_rgba(0,0,0,0.56)] backdrop-blur-xl">
      <h3 className="mb-3 text-[14px] wght-700 text-[#1d1d1f]">{title}</h3>
      <div className="grid gap-2">
        {events.length > 0 ? (
          events.map((event) => (
            <MobileEventRow
              key={event.id}
              event={event}
              onSelectEvent={onSelectEvent}
            />
          ))
        ) : (
          <button
            type="button"
            onClick={onEmptyClick}
            className="rounded-lg border border-dashed border-[#d8d8de] px-3 py-6 text-[12.5px] wght-450 text-[#8e8e93]"
          >
            {empty}
          </button>
        )}
      </div>
    </section>
  );
}

function MobileEventRow({
  event,
  onSelectEvent,
}: {
  event: CalendarEvent;
  onSelectEvent: (event: CalendarEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={(clickEvent) => {
        clickEvent.stopPropagation();
        onSelectEvent(event);
      }}
      className="flex min-h-[54px] items-center gap-3 rounded-lg bg-[#f8f8fb] px-3 py-2 text-left"
    >
      <span
        className="h-9 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: event.color }}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] wght-700 text-[#1d1d1f]">
          {event.title}
        </span>
        <span className="mt-1 block truncate text-[11.5px] wght-450 text-[#8e8e93]">
          {event.time ?? "종일"} · {event.calendar}
        </span>
      </span>
    </button>
  );
}

function PlannerHeader() {
  return (
    <div className="grid shrink-0 gap-3 border-b border-[#e5e5ea] bg-white/74 px-4 py-3 lg:grid-cols-[minmax(180px,0.72fr)_1.28fr] lg:items-center">
      <div>
        <p className="text-[11px] wght-620 text-[#8e8e93]">학기 플로우</p>
        <h2 className="mt-0.5 text-[15px] wght-700 text-[#1d1d1f]">
          자료에서 일정까지 이어지는 한 판
        </h2>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {FLOW_RAILS.map((rail) => (
          <div
            key={rail.label}
            className="min-w-0 rounded-lg bg-[#f2f2f7]/88 px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: rail.color }}
              />
              <span className="truncate text-[11px] wght-700 text-[#1d1d1f]">
                {rail.label}
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-2">
              <span className="text-[15px] wght-700 text-[#1d1d1f]">{rail.value}</span>
              <span className="truncate text-[10.5px] wght-450 text-[#8e8e93]">
                {rail.meta}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthCalendar({
  events,
  onSelectEvent,
  onCreateDate,
}: {
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  onCreateDate: (date: string) => void;
}) {
  return (
    <section className="flex h-full min-h-[780px] min-w-0 flex-col p-3 lg:p-4">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[#e5e5ea] bg-white/92 shadow-[0_24px_70px_-54px_rgba(0,0,0,0.48)] backdrop-blur-xl">
        <PlannerHeader />
        <div className="grid h-10 shrink-0 grid-cols-7 border-b border-[#e5e5ea] bg-[#fbfbfd]/92">
          {WEEK_LABELS.map((day) => (
            <div
              key={day}
              className="flex items-center justify-center border-r border-[#ececf1] text-[13px] wght-620 text-[#8e8e93] last:border-r-0"
            >
              {day}
            </div>
          ))}
        </div>
        <div className="grid flex-1 grid-cols-7 grid-rows-6">
          {MONTH_CELLS.map((cell, index) => {
            const cellEvents = events.filter((event) => event.date === cell.key);
            return (
              <MonthCell
                key={cell.key}
                cell={cell}
                events={cellEvents}
                lastColumn={(index + 1) % 7 === 0}
                onSelectEvent={onSelectEvent}
                onCreateDate={onCreateDate}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

function MonthCell({
  cell,
  events,
  lastColumn,
  onSelectEvent,
  onCreateDate,
}: {
  cell: MonthCell;
  events: CalendarEvent[];
  lastColumn: boolean;
  onSelectEvent: (event: CalendarEvent) => void;
  onCreateDate: (date: string) => void;
}) {
  return (
    <div
      onClick={() => onCreateDate(cell.key)}
      className={cn(
        "min-h-[122px] cursor-pointer border-b border-r border-[#ececf1] bg-white/90 px-2 py-2 transition-colors hover:bg-[#f7f8fb]",
        lastColumn && "border-r-0",
        !cell.currentMonth && "bg-[#f8f8fb] text-[#8e8e93]",
      )}
    >
      <div className="flex h-7 justify-center">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onCreateDate(cell.key);
          }}
          className={cn(
            "inline-flex min-w-7 items-center justify-center rounded-full px-1 text-[14px] wght-560",
            cell.today
              ? "bg-[#f4f8ff] text-[#3b82ff] shadow-[inset_0_0_0_1px_rgba(59,130,255,0.22)]"
              : cell.currentMonth
                ? "text-[#1d1d1f] hover:bg-[#f2f2f7]"
                : "text-[#8e8e93] hover:bg-[#f2f2f7]",
          )}
        >
          {cell.monthLabel ?? cell.label}
        </button>
      </div>
      <div className="mt-1 grid gap-1">
        {events.map((event) => (
          <button
            key={event.id}
            type="button"
            onClick={(clickEvent) => {
              clickEvent.stopPropagation();
              onSelectEvent(event);
            }}
            className={cn(
              "min-h-[24px] w-full overflow-hidden rounded-md text-left text-[12px] leading-[1.2] wght-560 transition-colors",
              event.allDay
                ? "bg-[var(--event-bg)] px-2 text-[#1d1d1f]"
                : "flex items-center gap-1.5 bg-transparent px-1.5 text-[#5f6368] hover:bg-[#f7f8fb]",
            )}
            style={eventTintStyle(event.color, event.allDay ? 0.24 : 0.1)}
          >
            {event.allDay ? (
              <span className="block truncate">{event.title}</span>
            ) : (
              <>
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: event.color }}
                  aria-hidden
                />
                <span className="min-w-0 truncate">
                  {event.time} {event.title}
                </span>
              </>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function WeekCalendar({
  events,
  onSelectEvent,
  onCreateDate,
}: {
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  onCreateDate: (date: string) => void;
}) {
  const weekCells = MONTH_CELLS.slice(7, 14);

  return (
    <section className="flex h-full min-h-[720px] min-w-0 flex-col p-3 lg:p-4">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[#e5e5ea] bg-white/92 shadow-[0_24px_70px_-54px_rgba(0,0,0,0.48)] backdrop-blur-xl">
        <PlannerHeader />
        <div className="grid h-[84px] shrink-0 grid-cols-7 border-b border-[#e5e5ea] bg-[#fbfbfd]/92">
          {weekCells.map((cell, index) => (
            <button
              key={cell.key}
              type="button"
              onClick={() => onCreateDate(cell.key)}
              className="flex flex-col items-center justify-center border-r border-[#ececf1] transition-colors last:border-r-0 hover:bg-[#f2f2f7]"
            >
              <span className="text-[12px] wght-620 text-[#8e8e93]">
                {WEEK_LABELS[index]}
              </span>
              <span
                className={cn(
                  "mt-1 inline-flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-[18px] wght-700",
                  cell.today
                    ? "bg-[#f4f8ff] text-[#3b82ff] shadow-[inset_0_0_0_1px_rgba(59,130,255,0.22)]"
                    : "text-[#1d1d1f]",
                )}
              >
                {cell.label}
              </span>
            </button>
          ))}
        </div>
        <div className="grid flex-1 grid-cols-7">
          {weekCells.map((cell, index) => {
            const dayEvents = events.filter((event) => event.date === cell.key);
            return (
              <div
                key={cell.key}
                onClick={() => onCreateDate(cell.key)}
                className="min-h-[560px] cursor-pointer border-r border-[#ececf1] bg-white/90 p-2 transition-colors hover:bg-[#f7f8fb] last:border-r-0"
              >
                <div className="grid gap-1.5">
                  {dayEvents.length === 0 ? (
                    <div className="mt-2 rounded-lg border border-dashed border-[#d8d8de] bg-[#fbfbfd]/80 px-2 py-3 text-center text-[12px] wght-450 text-[#8e8e93]">
                      빈 시간
                    </div>
                  ) : (
                    dayEvents.map((event) => (
                      <EventChip
                        key={event.id}
                        event={event}
                        density={index === 0 || index === 6 ? "compact" : "normal"}
                        onSelectEvent={onSelectEvent}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function DayCalendar({
  events,
  onSelectEvent,
  onCreateDate,
}: {
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  onCreateDate: (date: string) => void;
}) {
  const todayCell = MONTH_CELLS.find((cell) => cell.key === TODAY_KEY) ?? MONTH_CELLS[9];
  const dayEvents = events.filter((event) => event.date === todayCell.key);

  return (
    <section className="flex h-full min-h-[720px] flex-col p-3 lg:p-4">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[#e5e5ea] bg-white/92 shadow-[0_24px_70px_-54px_rgba(0,0,0,0.48)] backdrop-blur-xl">
        <header className="flex h-[84px] shrink-0 items-center justify-between border-b border-[#e5e5ea] bg-[#fbfbfd]/92 px-5">
          <div>
            <p className="text-[12px] wght-620 text-[#8e8e93]">화요일</p>
            <h2 className="mt-1 text-[26px] wght-700 text-[#1d1d1f]">
              5월 {todayCell.label}일
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onCreateDate(todayCell.key)}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0a84ff] px-4 text-[13px] wght-700 text-white shadow-[0_10px_22px_-14px_rgba(10,132,255,0.9)] transition-colors hover:bg-[#0071e3]"
          >
            <Plus size={16} strokeWidth={2.4} />
            일정 추가
          </button>
        </header>
        <div
          onClick={() => onCreateDate(todayCell.key)}
          className="min-h-0 flex-1 cursor-pointer overflow-y-auto p-4 transition-colors hover:bg-[#f7f8fb]"
        >
          <div className="mx-auto grid max-w-[680px] gap-3">
            {dayEvents.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#d8d8de] bg-[#fbfbfd]/80 px-4 py-10 text-center text-[13px] wght-450 text-[#8e8e93]">
                이 날은 비어 있어요. 빈 공간을 누르면 바로 일정 추가 팝업이 열려요.
              </div>
            ) : (
              dayEvents.map((event) => (
                <EventChip
                  key={event.id}
                  event={event}
                  density="roomy"
                  onSelectEvent={onSelectEvent}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function EventChip({
  event,
  density = "normal",
  onSelectEvent,
}: {
  event: CalendarEvent;
  density?: "compact" | "normal" | "roomy";
  onSelectEvent: (event: CalendarEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={(clickEvent) => {
        clickEvent.stopPropagation();
        onSelectEvent(event);
      }}
      className={cn(
        "w-full overflow-hidden rounded-lg text-left text-[#1d1d1f] transition-colors",
        event.allDay
          ? "bg-[var(--event-bg)]"
          : "bg-transparent hover:bg-[#f7f8fb]",
        density === "roomy" ? "min-h-[52px] px-3 py-2.5" : "min-h-[30px] px-2 py-1.5",
      )}
      style={eventTintStyle(event.color, event.allDay ? 0.24 : 0.1)}
    >
      <span className="flex min-w-0 items-center gap-2">
        {!event.allDay && (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: event.color }}
            aria-hidden
          />
        )}
        <span
          className={cn(
            "min-w-0 truncate wght-560",
            density === "roomy" ? "text-[15px]" : "text-[12.5px]",
          )}
        >
          {event.title}
        </span>
        {!event.allDay && (
          <span className="shrink-0 text-[11.5px] wght-450 text-[#8e8e93]">
            {event.time ?? "시간 없음"}
          </span>
        )}
      </span>
    </button>
  );
}

function MiniMonth() {
  return (
    <section className="px-2">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[16px] wght-620 text-[#1d1d1f]">2026년 5월</h2>
        <span className="rounded-md bg-white/72 px-2 py-1 text-[11px] wght-620 text-[#8e8e93]">
          5주차
        </span>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEK_LABELS.map((day) => (
          <span key={day} className="py-1 text-[11px] wght-560 text-[#8e8e93]">
            {day}
          </span>
        ))}
        {MINI_MONTH_DAYS.map((day, index) => (
          <button
            key={`${day.label}-${index}`}
            type="button"
            className={cn(
              "mx-auto flex h-7 w-7 items-center justify-center rounded-full text-[12px] wght-560",
              day.selected
                ? "bg-[#f4f8ff] text-[#3b82ff] shadow-[inset_0_0_0_1px_rgba(59,130,255,0.22)]"
                : day.muted
                  ? "text-[#b0b0b5] hover:bg-white/70"
                  : "text-[#1d1d1f] hover:bg-white/70",
            )}
          >
            {day.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function SourceSchedulePanel({
  candidates,
  onClose,
  onAddCandidate,
}: {
  candidates: readonly SourceScheduleCandidate[];
  onClose: () => void;
  onAddCandidate: (candidate: SourceScheduleCandidate) => void;
}) {
  return (
    <section className="fixed inset-x-3 bottom-[72px] z-50 max-h-[78vh] overflow-y-auto rounded-lg border border-white/70 bg-white/90 shadow-[0_30px_90px_-34px_rgba(0,0,0,0.68)] backdrop-blur-2xl md:absolute md:bottom-auto md:left-5 md:right-auto md:top-[92px] md:w-[460px]">
      <header className="sticky top-0 z-10 border-b border-[#e5e5ea] bg-white/92 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles size={16} strokeWidth={2.2} className="text-[#0a84ff]" />
              <p className="text-[12px] wght-700 text-[#0a84ff]">
                자료에서 찾은 일정
              </p>
            </div>
            <h2 className="mt-1 text-[20px] leading-tight wght-700 text-[#1d1d1f]">
              추가할 만한 후보를 확인해요
            </h2>
            <p className="mt-1 text-[12.5px] leading-[1.5] wght-450 text-[#6e6e73]">
              올린 자료에서 날짜, 장소, 제출 조건을 뽑았어요. 추가 전에 직접 수정할 수 있어요.
            </p>
          </div>
          <PanelIconButton label="닫기" icon={X} onClick={onClose} />
        </div>
      </header>

      <div className="grid gap-2.5 p-3">
        {candidates.map((candidate) => (
          <article
            key={candidate.id}
            className="rounded-lg border border-[#e5e5ea] bg-white/82 p-3 shadow-[0_14px_36px_-30px_rgba(0,0,0,0.52)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: candidate.color }}
                    aria-hidden
                  />
                  <h3 className="truncate text-[15px] wght-700 text-[#1d1d1f]">
                    {candidate.title}
                  </h3>
                </div>
                <p className="mt-1 text-[12px] wght-560 text-[#6e6e73]">
                  {candidate.date} · {candidate.time ?? "종일"} · {candidate.calendar}
                </p>
              </div>
              <span className="shrink-0 rounded-md bg-[#f2f2f7] px-2 py-1 text-[10.5px] wght-700 text-[#6e6e73]">
                {candidate.confidence}
              </span>
            </div>

            <p className="mt-3 rounded-md bg-[#f8f8fb] px-3 py-2 text-[12px] leading-[1.45] wght-450 text-[#1d1d1f]">
              {candidate.extracted}
            </p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-[11.5px] wght-450 text-[#8e8e93]">
                출처: {candidate.source}
              </span>
              <button
                type="button"
                onClick={() => onAddCandidate(candidate)}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#0a84ff] px-3 text-[12px] wght-700 text-white shadow-[0_10px_22px_-14px_rgba(10,132,255,0.9)] transition-colors hover:bg-[#0071e3]"
              >
                <Plus size={14} strokeWidth={2.4} />
                추가
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
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
  const [time, setTime] = useState(event.allDay ? "종일" : event.time ?? "");
  const [location, setLocation] = useState(event.online ? "온라인 수업" : event.location ?? "");
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
    <section className="fixed inset-x-3 bottom-[72px] z-40 max-h-[74vh] overflow-y-auto rounded-lg border border-white/70 bg-white/88 shadow-[0_26px_80px_-34px_rgba(0,0,0,0.62)] backdrop-blur-2xl md:absolute md:bottom-auto md:left-auto md:right-5 md:top-[96px] md:w-[380px]">
      <div className="flex items-center justify-between border-b border-[#e5e5ea] px-4 py-3">
        <div className="flex items-center gap-3">
          <span
            className="h-4 w-4 rounded-sm"
            style={{ backgroundColor: selectedCalendar.color }}
            aria-hidden
          />
          <span className="text-[13px] wght-560 text-[#6e6e73]">
            {creating ? "일정 만들기" : "일정 상세"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {!creating && <PanelIconButton label="삭제" icon={Trash2} onClick={onClose} />}
          <PanelIconButton label="닫기" icon={X} onClick={onClose} />
        </div>
      </div>

      <div className="px-5 py-4">
        <label className="block">
          <span className="sr-only">일정 제목</span>
          <input
            type="text"
            value={title}
            onChange={(inputEvent) => setTitle(inputEvent.target.value)}
            className="w-full border-b border-[#d8d8de] bg-transparent pb-2 text-[22px] wght-560 text-[#1d1d1f] outline-none focus:border-[#0a84ff]"
          />
        </label>

        <div className="mt-5 grid gap-3">
          <DetailRow icon={Clock}>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={eventDate}
                onChange={(inputEvent) => setEventDate(inputEvent.target.value)}
                className="h-10 rounded-lg border border-[#e5e5ea] bg-[#f2f2f7]/78 px-3 text-[13px] wght-450 text-[#1d1d1f]"
              />
              <input
                type="text"
                value={time}
                onChange={(inputEvent) => setTime(inputEvent.target.value)}
                className="h-10 rounded-lg border border-[#e5e5ea] bg-[#f2f2f7]/78 px-3 text-[13px] wght-450 text-[#1d1d1f]"
              />
            </div>
          </DetailRow>

          <DetailRow icon={MapPin}>
            <input
              type="text"
              value={location}
              onChange={(inputEvent) => setLocation(inputEvent.target.value)}
              placeholder="장소 추가"
              className="h-10 w-full rounded-lg border border-[#e5e5ea] bg-[#f2f2f7]/78 px-3 text-[13px] wght-450 text-[#1d1d1f] placeholder:text-[#8e8e93]"
            />
          </DetailRow>

          <DetailRow icon={Video}>
            <button
              type="button"
              className={cn(
                "inline-flex h-10 items-center rounded-md px-3 text-[13px] wght-560",
                event.online
                  ? "bg-[#e9f3ff] text-[#0071e3]"
                  : "border border-[#e5e5ea] bg-[#f2f2f7]/78 text-[#6e6e73]",
              )}
            >
              {event.online ? "온라인 링크 열기" : "화상 회의 추가"}
            </button>
          </DetailRow>

          <DetailRow icon={CalendarDays}>
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#e5e5ea] bg-[#f2f2f7]/78 px-3 text-[13px] wght-560 text-[#1d1d1f]"
            >
              <span
                className="h-3 w-3 rounded-sm"
                style={{ backgroundColor: selectedCalendar.color }}
                aria-hidden
              />
              {calendar}
            </button>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {CALENDARS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCalendar(item.id)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[11.5px] wght-620 transition-colors",
                    calendar === item.id
                      ? "bg-[#1d1d1f] text-white"
                      : "bg-[#f2f2f7]/78 text-[#6e6e73] hover:bg-white",
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
              onChange={(inputEvent) => setDetail(inputEvent.target.value)}
              className="min-h-[84px] w-full resize-none rounded-lg border border-[#e5e5ea] bg-[#f2f2f7]/78 px-3 py-2 text-[13px] leading-[1.5] wght-450 text-[#1d1d1f]"
            />
          </DetailRow>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#e9f3ff] px-4 text-[13px] wght-700 text-[#0071e3]"
          >
            <Sparkles size={15} strokeWidth={2.2} />
            빈 시간 추천
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0a84ff] px-5 text-[13px] wght-700 text-white shadow-[0_10px_22px_-14px_rgba(10,132,255,0.9)] transition-colors hover:bg-[#0071e3]"
          >
            <Check size={15} strokeWidth={2.4} />
            저장
          </button>
        </div>
      </div>
    </section>
  );
}

function SidebarSection({
  title,
  children,
  open,
  onToggle,
}: {
  title: string;
  children?: ReactNode;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="mt-6 px-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="mb-2 flex h-8 w-full items-center justify-between rounded-lg text-left transition-colors hover:bg-white/60"
      >
        <h3 className="text-[15px] wght-620 text-[#1d1d1f]">{title}</h3>
        <ChevronDown
          size={18}
          strokeWidth={2.2}
          className={cn(
            "text-[#6e6e73] transition-transform",
            !open && "-rotate-90",
          )}
        />
      </button>
      {open && children && <div className="grid gap-1">{children}</div>}
    </section>
  );
}

function CalendarCheckbox({
  calendar,
  checked,
  onToggle,
}: {
  calendar: { id: CalendarKey; label: string; color: string };
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex h-9 items-center gap-3 rounded-lg px-1 text-left text-[14px] wght-450 text-[#6e6e73] transition-colors hover:bg-white/72"
    >
      <span
        className="inline-flex h-[18px] w-[18px] items-center justify-center rounded-[3px] text-white"
        style={{
          backgroundColor: checked ? calendar.color : "transparent",
          border: `2px solid ${calendar.color}`,
        }}
      >
        {checked && <Check size={14} strokeWidth={2.8} />}
      </span>
      <span>{calendar.label}</span>
    </button>
  );
}

function ArchCalendarMark() {
  return (
    <div
      className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-[#1d1d1f] shadow-[0_10px_20px_-16px_rgba(0,0,0,0.9)]"
      aria-hidden
    >
      <div className="absolute inset-x-2 top-2 h-[3px] rounded-full bg-white/35" />
      <div className="relative mt-1 text-[17px] wght-700 text-white">
        5
      </div>
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
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#6e6e73] transition-colors hover:bg-[#f2f2f7]"
    >
      <Icon size={18} strokeWidth={2.1} />
    </button>
  );
}

function DetailRow({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[28px_1fr] items-start gap-2">
      <Icon size={18} strokeWidth={2.1} className="mt-2.5 text-[#8e8e93]" />
      {children}
    </div>
  );
}
