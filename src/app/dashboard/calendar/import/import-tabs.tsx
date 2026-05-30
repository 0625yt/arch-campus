"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SyllabusImportFlow } from "./syllabus-import-flow";
import { TimetableImportFlow } from "./timetable-import-flow";

type Kind = "timetable" | "syllabus";
type ResetScope = "timetable" | "syllabus" | "all";

const TABS: { id: Kind; label: string; hint: string }[] = [
  {
    id: "timetable",
    label: "시간표",
    hint: "한 학기 듣는 강의 한 번에",
  },
  {
    id: "syllabus",
    label: "강의계획서",
    hint: "시험·과제·발표 일정",
  },
];

export function ImportTabs({
  initialKind,
  existingCourseCount,
}: {
  initialKind: Kind;
  existingCourseCount: number;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>(initialKind);
  const [resetting, setResetting] = useState<ResetScope | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  async function resetImportedData(scope: ResetScope) {
    const label =
      scope === "timetable"
        ? "시간표 수업 일정"
        : scope === "syllabus"
          ? "강의계획서 일정"
          : "학교 자료 일정";
    const ok = window.confirm(
      `${label}을 초기화할까요?\n\n과목과 업로드한 파일은 남기고, 캘린더에 반영된 일정만 지웁니다.`,
    );
    if (!ok) return;

    setResetting(scope);
    setResetMessage(null);
    try {
      const res = await fetch("/api/calendar/imports/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        deletedEvents?: number;
        updatedCourses?: number;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setResetMessage(json.error ?? "초기화하지 못했어요.");
        return;
      }
      setResetMessage(`일정 ${json.deletedEvents ?? 0}개를 초기화했어요.`);
      router.refresh();
    } catch (e) {
      setResetMessage(e instanceof Error ? e.message : "초기화하지 못했어요.");
    } finally {
      setResetting(null);
    }
  }

  return (
    <>
      <PageAuraBackground />
      <Header />

      {existingCourseCount > 0 && (
        <div
          className="mt-6 fade-up fade-up-2 flex flex-wrap items-center gap-3 rounded-[14px] bg-white px-5 py-4"
          style={{ letterSpacing: "-0.012em" }}
        >
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-apple-action-soft)] text-[12px] wght-700 tabular-nums text-[var(--color-apple-action)]">
            {existingCourseCount}
          </span>
          <p className="flex-1 text-[13px] wght-450 text-[var(--color-apple-muted)]">
            이미{" "}
            <span className="wght-560 text-[var(--color-apple-ink)]">
              {existingCourseCount}과목
            </span>
            이 등록되어 있어요. 새 시간표를 올리면 같은 이름의 강의 일정은 확인 후 갈아끼워집니다.
          </p>
        </div>
      )}

      {existingCourseCount > 0 && (
        <ResetPanel resetting={resetting} message={resetMessage} onReset={resetImportedData} />
      )}

      <div className="mt-6 fade-up fade-up-2 sm:mt-8">
        <div
          role="tablist"
          aria-label="등록 종류"
          className="flex gap-2 rounded-full bg-white p-1.5"
        >
          {TABS.map((tab) => {
            const active = kind === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setKind(tab.id)}
                className={`flex-1 rounded-full px-4 py-2.5 text-[13.5px] wght-560 transition-all active:scale-[0.98] ${
                  active
                    ? "bg-[var(--color-apple-ink)] text-white"
                    : "text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]"
                }`}
                style={{ letterSpacing: "-0.012em" }}
              >
                <span className="block text-center">{tab.label}</span>
                <span
                  className={`mt-0.5 block text-center text-[11px] wght-450 ${
                    active ? "text-white/70" : "text-[var(--color-apple-muted)]"
                  }`}
                >
                  {tab.hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {kind === "timetable" ? <TimetableImportFlow /> : <SyllabusImportFlow />}
    </>
  );
}

function ResetPanel({
  resetting,
  message,
  onReset,
}: {
  resetting: ResetScope | null;
  message: string | null;
  onReset: (scope: ResetScope) => void;
}) {
  const actions: Array<{ scope: ResetScope; label: string; desc: string }> = [
    {
      scope: "timetable",
      label: "시간표 초기화",
      desc: "반복 수업 일정만 지우기",
    },
    {
      scope: "syllabus",
      label: "강의계획서 초기화",
      desc: "자료에서 넣은 시험·과제 일정 지우기",
    },
  ];

  return (
    <section className="mt-4 fade-up fade-up-2 rounded-[14px] border border-[var(--color-apple-hairline-soft)] bg-white px-5 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[13px] wght-700 text-[var(--color-apple-ink)]">등록 내용 초기화</p>
          <p className="mt-1 text-[12.5px] leading-[1.5] wght-450 text-[var(--color-apple-muted)]">
            요일이 잘못 들어갔거나 새 자료로 다시 잡고 싶을 때, 캘린더 반영분만 지울 수 있어요.
          </p>
          {message && (
            <p className="mt-2 text-[12px] wght-560 text-[var(--color-apple-action)]">{message}</p>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {actions.map((action) => (
            <button
              key={action.scope}
              type="button"
              onClick={() => onReset(action.scope)}
              disabled={resetting !== null}
              className="rounded-[10px] border border-[var(--color-apple-hairline)] bg-[var(--color-apple-pearl)] px-4 py-3 text-left transition-colors hover:bg-white disabled:opacity-50"
            >
              <span className="block text-[12.5px] wght-700 text-[var(--color-apple-ink)]">
                {resetting === action.scope ? "초기화 중…" : action.label}
              </span>
              <span className="mt-0.5 block text-[11.5px] wght-450 text-[var(--color-apple-muted)]">
                {action.desc}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function Header() {
  return (
    <>
      <nav
        className="fade-up flex items-center gap-1.5 text-[12px] wght-450 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        <Link href="/dashboard/calendar" className="hover:text-[var(--color-apple-ink)]">
          캘린더
        </Link>
        <span aria-hidden className="text-[var(--color-apple-hairline)]">
          ›
        </span>
        <span className="wght-560 text-[var(--color-apple-ink)]">학교 자료 등록</span>
      </nav>

      <header className="mt-10 fade-up fade-up-1 sm:mt-14">
        <p
          className="text-[12px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-action)]"
          style={{ letterSpacing: "0.06em" }}
        >
          한 학기를 5분 안에
        </p>
        <h1
          className="mt-4 max-w-[820px] text-[34px] leading-[1.07] wght-620 text-[var(--color-apple-ink)] sm:text-[46px] md:text-[54px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          시간표·강의계획서, <br className="hidden sm:block" />
          <span className="text-[var(--color-apple-muted)]">올리면 끝납니다</span>
        </h1>
      </header>
    </>
  );
}

function PageAuraBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[640px] overflow-hidden"
      style={{
        background:
          "radial-gradient(900px 360px at 22% 12%, rgba(0,113,227,0.07), transparent 70%), radial-gradient(720px 320px at 82% 22%, rgba(160,139,196,0.08), transparent 70%), radial-gradient(560px 240px at 62% 0%, rgba(122,166,214,0.06), transparent 70%)",
      }}
    />
  );
}
