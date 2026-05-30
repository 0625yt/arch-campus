"use client";

import Link from "next/link";
import { useEffect } from "react";
import type { CourseListItem } from "@/lib/data/materials";
import { parseScheduleString, weekdayKoShort } from "@/lib/timetable-grid";

/**
 * Dashboard에서 강의 칸 클릭 시 우측에서 spring up되는 시트.
 *
 * 페이지 이동 없이 강의 메타·시간표·자료 카운트를 보여주고,
 * "자료 보기·새 자료 올리기"로 study 페이지·업로드 흐름으로 진입.
 *
 * 디자인:
 *   - 우측 sheet (md↑) / 하단 sheet (모바일)
 *   - 뒤 배경: blur + 어둡게 + 클릭으로 닫기
 *   - 콘텐츠는 sheet-stagger로 시차 진입
 */
export function CourseSheet({
  course,
  onClose,
}: {
  course: CourseListItem | null;
  onClose: () => void;
}) {
  // ESC 닫기
  useEffect(() => {
    if (!course) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [course, onClose]);

  // 시트 열렸을 때 body scroll lock
  useEffect(() => {
    if (!course) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [course]);

  if (!course) return null;

  const slots = (course.schedule ?? [])
    .map(parseScheduleString)
    .filter((s): s is NonNullable<typeof s> => s !== null);

  const courseHref = `/dashboard/study/${encodeURIComponent(course.name)}`;
  const dotColor = course.color ?? "#0071e3";

  return (
    <>
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="backdrop-in fixed inset-0 z-40 bg-black/30 backdrop-blur-[6px]"
      />
      <aside
        className="sheet-up fixed z-50 flex flex-col bg-white shadow-[0_30px_80px_-20px_rgba(15,23,42,0.35)]
          inset-x-0 bottom-0 max-h-[88dvh] rounded-t-[24px]
          md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[440px] md:rounded-none md:rounded-l-[24px]"
        role="dialog"
        aria-label={`${course.name} 상세`}
      >
        {/* Drag handle (모바일) */}
        <div className="flex justify-center pt-3 md:hidden">
          <span aria-hidden className="h-1 w-10 rounded-full bg-[var(--color-apple-hairline)]" />
        </div>

        {/* Header */}
        <header className="flex items-start justify-between gap-3 px-7 pt-7 pb-5">
          <div className="min-w-0 flex-1 sheet-item-in">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: dotColor }}
              />
              <p
                className="text-[11px] uppercase tracking-[0.08em] wght-560 text-[var(--color-apple-muted)]"
                style={{ letterSpacing: "0.08em" }}
              >
                강의
              </p>
            </div>
            <h2
              className="mt-2 text-[24px] leading-[1.18] wght-700 text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "-0.022em" }}
            >
              {course.name}
            </h2>
            {course.professor && (
              <p
                className="mt-1 text-[13.5px] wght-450 text-[var(--color-apple-muted)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                {course.professor}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="spring-press flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-apple-pearl)] text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-apple-hairline)] hover:text-[var(--color-apple-ink)]"
            aria-label="닫기"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="sheet-stagger flex flex-1 flex-col gap-6 overflow-y-auto px-7 pb-10">
          {/* 시간 슬롯 */}
          {slots.length > 0 && (
            <section className="sheet-item-in">
              <SectionLabel>강의 시간</SectionLabel>
              <ul className="mt-3 flex flex-col gap-1.5">
                {slots.map((s, i) => (
                  <li
                    key={`${s.weekday}-${s.startMinute}-${i}`}
                    className="flex items-baseline justify-between rounded-[10px] bg-[var(--color-apple-pearl)] px-4 py-2.5"
                  >
                    <span
                      className="text-[13.5px] wght-560 text-[var(--color-apple-ink)]"
                      style={{ letterSpacing: "-0.012em" }}
                    >
                      {weekdayKoShort(s.weekday)}요일
                    </span>
                    <span
                      className="text-[13px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
                      style={{ letterSpacing: "-0.012em" }}
                    >
                      {s.startLabel} – {s.endLabel}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 장소 */}
          {course.location && (
            <section className="sheet-item-in">
              <SectionLabel>강의실</SectionLabel>
              <p
                className="mt-2 text-[15px] wght-560 text-[var(--color-apple-ink)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                {course.location}
              </p>
            </section>
          )}

          {/* 자료 카운트 */}
          <section className="sheet-item-in">
            <SectionLabel>자료</SectionLabel>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className="text-[36px] leading-none wght-700 tabular-nums text-[var(--color-apple-ink)]"
                style={{ letterSpacing: "-0.022em" }}
              >
                {course.materialCount}
              </span>
              <span
                className="text-[13.5px] wght-450 text-[var(--color-apple-muted)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                개 등록됨
              </span>
            </div>
            <p
              className="mt-2 text-[12.5px] wght-450 leading-[1.5] text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              {course.materialCount === 0
                ? "자료 없음. 강의자료 한 장이면 요약·문제까지 한 번에 생성."
                : "강의로 들어가면 자료별 요약·기출형 문제·오답 분석 확인."}
            </p>
          </section>

          {/* CTA */}
          <div className="sheet-item-in mt-auto flex flex-col gap-2 pt-2 sm:flex-row">
            <Link
              href={courseHref}
              onClick={onClose}
              className="spring-press inline-flex h-[48px] flex-1 items-center justify-center gap-1 rounded-full bg-[var(--color-apple-ink)] px-5 text-[14px] wght-560 text-white transition-opacity hover:opacity-90"
              style={{ letterSpacing: "-0.012em" }}
            >
              강의로 들어가기
              <span aria-hidden>›</span>
            </Link>
            <Link
              href={`/dashboard/study/${encodeURIComponent(course.name)}#upload-zone`}
              onClick={onClose}
              className="spring-press inline-flex h-[48px] flex-1 items-center justify-center rounded-full border border-[var(--color-apple-hairline)] bg-white px-5 text-[14px] wght-560 text-[var(--color-apple-ink)] transition-colors hover:bg-[var(--color-apple-pearl)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              자료 올리기
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[11px] uppercase tracking-[0.08em] wght-560 text-[var(--color-apple-muted)]"
      style={{ letterSpacing: "0.08em" }}
    >
      {children}
    </p>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden fill="none">
      <path
        d="M3 3l8 8M11 3l-8 8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
