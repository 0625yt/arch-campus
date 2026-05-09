"use client";

import { BookOpen, CalendarDays, Check, CloudUpload, Sparkles } from "lucide-react";
import { type DragEvent, useEffect, useState } from "react";
import { COURSE_COLOR } from "@/app/dashboard/study/data";
import { Dot } from "@/components/primitives";
import { cn } from "@/lib/utils";

type Destination = "study" | "calendar" | "auto";

const COURSES = ["자료구조", "운영체제", "데이터베이스", "알고리즘", "새 과목"] as const;
type Course = (typeof COURSES)[number];

const STUDY_KINDS = [
  { id: "lecture", label: "강의 노트", meta: "수업 자료" },
  { id: "assignment", label: "과제 안내", meta: "제출 형식·마감" },
  { id: "exam", label: "시험 범위", meta: "공부 우선순위" },
  { id: "team", label: "팀플 메모", meta: "역할·회의" },
] as const;
type StudyKind = (typeof STUDY_KINDS)[number]["id"];

const CALENDAR_KINDS = [
  { id: "syllabus", label: "강의계획서", meta: "학기 일정 자동 추출" },
  { id: "notice", label: "학사·공지", meta: "장학금·행사" },
] as const;
type CalendarKind = (typeof CALENDAR_KINDS)[number]["id"];

interface AiGuess {
  destination: Exclude<Destination, "auto">;
  kind: StudyKind | CalendarKind;
  course?: Course;
  confidence: "높음" | "보통" | "낮음";
  reason: string;
}

/**
 * 파일명만으로 destination/kind/course를 추측하는 mock.
 * 실제 API 연결 전엔 이 로직이 사용자에게 분류 hint 제공.
 */
function guessFromFilename(name: string): AiGuess | null {
  if (!name) return null;
  const lower = name.toLowerCase();

  let course: Course | undefined;
  if (/(자료구조|datastructure|ds_)/i.test(name)) course = "자료구조";
  else if (/(운영체제|os_|operating)/i.test(name)) course = "운영체제";
  else if (/(데이터베이스|database|db_)/i.test(name)) course = "데이터베이스";
  else if (/(알고리즘|algorithm|algo)/i.test(name)) course = "알고리즘";

  // syllabus / 강의계획서
  if (/(강의계획서|syllabus|커리큘럼)/i.test(name)) {
    return {
      destination: "calendar",
      kind: "syllabus",
      course,
      confidence: "높음",
      reason: "파일명에 '강의계획서' 포함 → 학기 일정으로 추출 가능해요.",
    };
  }
  // 학사 공지
  if (/(공지|학사|장학|행사|notice)/i.test(name)) {
    return {
      destination: "calendar",
      kind: "notice",
      course,
      confidence: "보통",
      reason: "파일명이 학사·공지에 가까워요. 일정만 뽑아 캘린더에 추가할게요.",
    };
  }
  // 과제
  if (/(과제|assignment|hw_|homework)/i.test(name)) {
    return {
      destination: "study",
      kind: "assignment",
      course,
      confidence: course ? "높음" : "보통",
      reason: course
        ? `${course} 과목 과제 안내로 보여요. 마감일이 있으면 캘린더에도 같이 추가돼요.`
        : "과제 안내로 보여요. 어느 과목인지 골라주세요.",
    };
  }
  // 시험
  if (/(시험|exam|midterm|final|중간|기말)/i.test(name)) {
    return {
      destination: "study",
      kind: "exam",
      course,
      confidence: course ? "높음" : "보통",
      reason: "시험 범위 자료로 보여요.",
    };
  }
  // 팀플
  if (/(팀플|회의|meeting|team)/i.test(name)) {
    return {
      destination: "study",
      kind: "team",
      course,
      confidence: "보통",
      reason: "팀플 메모로 보여요. 회의 시간이 있으면 캘린더에 추가할게요.",
    };
  }
  // 기본: 강의 노트
  if (course || /(노트|강의|lecture|chapter|ch\d)/i.test(lower)) {
    return {
      destination: "study",
      kind: "lecture",
      course,
      confidence: course ? "보통" : "낮음",
      reason: course
        ? `${course} 강의 노트로 보여요.`
        : "강의 자료로 보이는데, 어느 과목인지 골라주세요.",
    };
  }
  return null;
}

export function UploadIntake({ className }: { className?: string }) {
  const [over, setOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const [destination, setDestination] = useState<Destination>("auto");
  const [course, setCourse] = useState<Course>("자료구조");
  const [studyKind, setStudyKind] = useState<StudyKind>("lecture");
  const [calendarKind, setCalendarKind] = useState<CalendarKind>("syllabus");

  // 파일이 바뀌면 AI 추측을 갱신하고, destination이 auto면 자동으로 적용
  const [guess, setGuess] = useState<AiGuess | null>(null);
  useEffect(() => {
    if (!fileName) {
      setGuess(null);
      return;
    }
    const next = guessFromFilename(fileName);
    setGuess(next);
    if (next && destination === "auto") {
      setDestination(next.destination);
      if (next.destination === "study") setStudyKind(next.kind as StudyKind);
      else setCalendarKind(next.kind as CalendarKind);
      if (next.course) setCourse(next.course);
    }
  }, [fileName]); // eslint-disable-line react-hooks/exhaustive-deps

  function onDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setOver(true);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) setFileName(file.name);
  }

  const ready = !!fileName;
  const showGuessBanner = ready && guess && destination !== "auto";
  const showAutoState = !ready || destination === "auto";

  return (
    <div className={className}>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-stretch lg:gap-12">
        {/* 좌 — 드롭존 */}
        <label
          id="upload-zone"
          htmlFor="campus-upload"
          onDragOver={onDragOver}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          className={cn(
            "flex min-h-[280px] scroll-mt-24 cursor-pointer flex-col items-center justify-center rounded-[12px] border border-dashed px-8 py-12 text-center transition-colors",
            over
              ? "border-[var(--color-apple-action)] bg-[var(--color-apple-action-soft)]"
              : "border-[var(--color-apple-hairline)] bg-[var(--color-apple-pearl)] hover:bg-[var(--color-apple-pearl)]",
          )}
        >
          <input
            id="campus-upload"
            type="file"
            accept=".pdf,.hwpx,.hwp,.pptx,.docx,.txt,.md,.png,.jpg,.jpeg"
            className="sr-only"
            onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
          />
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-[var(--color-apple-ink)]">
            <CloudUpload size={20} strokeWidth={1.6} />
          </span>
          <p
            className="mt-5 text-[17px] leading-[1.3] wght-560 text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {fileName ?? "클릭하거나 끌어다 놓기"}
          </p>
          <p
            className="mt-2 max-w-[280px] text-[13px] leading-[1.5] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.022em" }}
          >
            {fileName ? "오른쪽에서 어디로 보낼지 정해주세요." : "PDF · HWPX · 이미지 · 문서"}
          </p>
        </label>

        {/* 우 — 분류 패널 */}
        <div className="flex flex-col gap-6">
          {/* AI 추측 배너 */}
          {showGuessBanner && (
            <div
              className="flex items-start gap-2.5 rounded-[10px] border border-[var(--color-apple-hairline)] bg-[var(--color-apple-pearl)] px-3.5 py-3"
              style={{ letterSpacing: "-0.012em" }}
            >
              <Sparkles
                size={14}
                strokeWidth={2.4}
                className="mt-0.5 shrink-0"
                style={{ color: "var(--color-apple-cobalt)" }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] wght-560 text-[var(--color-apple-ink)]">
                  AI 분류 — 확신도 {guess.confidence}
                </p>
                <p className="mt-0.5 text-[12px] leading-[1.5] wght-450 text-[var(--color-apple-muted)]">
                  {guess.reason}
                </p>
              </div>
            </div>
          )}

          {/* 1. 어디로 보낼까 */}
          <ChoiceBlock label="어디로 보낼까">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <DestinationCard
                active={destination === "study"}
                icon={<BookOpen size={16} strokeWidth={1.8} />}
                label="공부"
                meta="자료로 저장"
                onClick={() => setDestination("study")}
              />
              <DestinationCard
                active={destination === "calendar"}
                icon={<CalendarDays size={16} strokeWidth={1.8} />}
                label="일정"
                meta="캘린더로"
                onClick={() => setDestination("calendar")}
              />
              <DestinationCard
                active={destination === "auto"}
                icon={
                  <Sparkles
                    size={16}
                    strokeWidth={1.8}
                    style={{
                      color: destination === "auto" ? undefined : "var(--color-apple-cobalt)",
                    }}
                  />
                }
                label="AI에게"
                meta={ready ? "추측 사용" : "잘 모르겠음"}
                onClick={() => setDestination("auto")}
              />
            </div>
            {showAutoState && (
              <p
                className="mt-2 text-[12px] wght-450 text-[var(--color-apple-muted)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                {ready
                  ? guess
                    ? "분석 시작 누르면 위 추측대로 분류해요. 다른 곳으로 옮기고 싶으면 좌·중간 카드를 클릭."
                    : "파일명만으로는 판단이 어려워요. 직접 골라주거나 분석 시작을 눌러주세요."
                  : "파일을 올리면 AI가 어디로 보낼지 추측해드려요."}
              </p>
            )}
          </ChoiceBlock>

          {/* 2. destination 별 컨텍스트 */}
          {destination === "study" && (
            <>
              <ChoiceBlock label="과목">
                <div className="flex flex-wrap gap-1.5">
                  {COURSES.map((item) => {
                    const active = course === item;
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setCourse(item)}
                        className={cn(
                          "inline-flex h-[30px] items-center gap-1.5 rounded-full border px-3 text-[13px] wght-450 transition-colors",
                          active
                            ? "border-[var(--color-apple-ink)] bg-[var(--color-apple-ink)] text-white"
                            : "border-[var(--color-apple-hairline)] bg-white text-[var(--color-apple-muted)] hover:text-[var(--color-apple-ink)]",
                        )}
                        style={{ letterSpacing: "-0.012em" }}
                      >
                        {item !== "새 과목" && (
                          <Dot
                            color={COURSE_COLOR[item]}
                            size={5}
                            className={active ? "bg-white" : undefined}
                          />
                        )}
                        {item}
                      </button>
                    );
                  })}
                </div>
              </ChoiceBlock>

              <ChoiceBlock label="자료 종류">
                <div className="grid grid-cols-2 gap-2">
                  {STUDY_KINDS.map((item) => (
                    <KindCard
                      key={item.id}
                      active={studyKind === item.id}
                      label={item.label}
                      meta={item.meta}
                      onClick={() => setStudyKind(item.id)}
                    />
                  ))}
                </div>
              </ChoiceBlock>
            </>
          )}

          {destination === "calendar" && (
            <ChoiceBlock label="일정 종류">
              <div className="grid grid-cols-2 gap-2">
                {CALENDAR_KINDS.map((item) => (
                  <KindCard
                    key={item.id}
                    active={calendarKind === item.id}
                    label={item.label}
                    meta={item.meta}
                    onClick={() => setCalendarKind(item.id)}
                  />
                ))}
              </div>
            </ChoiceBlock>
          )}

          {/* 3. CTA */}
          <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-2 pt-2">
            <button
              type="button"
              disabled={!ready}
              className={cn(
                "inline-flex h-[48px] items-center justify-center rounded-full px-8 text-[17px] wght-560 transition-all duration-150",
                ready
                  ? "bg-[var(--color-apple-action)] text-white hover:bg-[var(--color-apple-action-hover)] active:scale-[0.97]"
                  : "cursor-not-allowed bg-[var(--color-apple-hairline)] text-white",
              )}
              style={{ letterSpacing: "-0.012em" }}
            >
              자료 분석 시작
              <span className="ml-1.5">›</span>
            </button>
            <span
              className="text-[13px] wght-450 text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              {!ready
                ? "파일을 먼저 올려주세요"
                : destination === "study"
                  ? `${course} · ${STUDY_KINDS.find((k) => k.id === studyKind)?.label}로 저장돼요`
                  : destination === "calendar"
                    ? `${CALENDAR_KINDS.find((k) => k.id === calendarKind)?.label}에서 일정을 뽑아 캘린더에 추가해요`
                    : "AI가 알아서 분류할게요"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function DestinationCard({
  active,
  icon,
  label,
  meta,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-1.5 rounded-[10px] border px-3.5 py-3 text-left transition-colors",
        active
          ? "border-[var(--color-apple-action)] bg-[var(--color-apple-action-soft)]"
          : "border-[var(--color-apple-hairline)] bg-white hover:bg-[var(--color-apple-pearl)]",
      )}
    >
      <span
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-[8px]",
          active
            ? "bg-[var(--color-apple-action)] text-white"
            : "bg-[var(--color-apple-pearl)] text-[var(--color-apple-ink)]",
        )}
      >
        {icon}
      </span>
      <span
        className={cn(
          "text-[14px] wght-560",
          active ? "text-[var(--color-apple-action)]" : "text-[var(--color-apple-ink)]",
        )}
        style={{ letterSpacing: "-0.012em" }}
      >
        {label}
      </span>
      <span
        className="text-[11px] wght-450 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {meta}
      </span>
    </button>
  );
}

function KindCard({
  active,
  label,
  meta,
  onClick,
}: {
  active: boolean;
  label: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative flex items-start justify-between gap-2 rounded-[10px] border px-3.5 py-2.5 text-left transition-colors",
        active
          ? "border-[var(--color-apple-action)] bg-[var(--color-apple-action-soft)]"
          : "border-[var(--color-apple-hairline)] bg-white hover:bg-[var(--color-apple-pearl)]",
      )}
    >
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-[13px] wght-560",
            active ? "text-[var(--color-apple-action)]" : "text-[var(--color-apple-ink)]",
          )}
          style={{ letterSpacing: "-0.012em" }}
        >
          {label}
        </span>
        <span
          className="mt-0.5 block text-[11px] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {meta}
        </span>
      </span>
      {active && (
        <span
          aria-hidden
          className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-apple-action)] text-white"
        >
          <Check size={10} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

function ChoiceBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2.5 text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
        {label}
      </p>
      {children}
    </div>
  );
}
