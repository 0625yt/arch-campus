"use client";

import Link from "next/link";
import { useState } from "react";
import { SyllabusImportFlow } from "./syllabus-import-flow";
import { TimetableImportFlow } from "./timetable-import-flow";

type Kind = "timetable" | "syllabus";

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

export function ImportTabs({ initialKind }: { initialKind: Kind }) {
  const [kind, setKind] = useState<Kind>(initialKind);

  return (
    <>
      <PageAuraBackground />
      <Header />

      <div className="mt-10 fade-up fade-up-2 sm:mt-12">
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
                className={`flex-1 rounded-full px-4 py-2.5 text-[13.5px] wght-560 transition-colors ${
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
          <span className="text-[var(--color-apple-muted)]">올리면 끝나요.</span>
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
