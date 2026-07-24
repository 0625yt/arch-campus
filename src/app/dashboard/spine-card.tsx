"use client";

import { useMemo } from "react";
import {
  courseAccentRgb,
  courseInkColor,
  courseLinearGradient,
  courseLinearGradientDark,
} from "@/lib/course-palette";
import type { CourseListItem } from "@/lib/data/materials";
import {
  buildTimetable,
  type CourseSlot,
  findNowAndNext,
  formatUntil,
  minutesUntilSlot,
} from "@/lib/timetable-grid";
import { NowDot } from "./now-banner";
import { useIsDark } from "./use-mobile";

/**
 * 스파인 카드 — 대시보드의 "지금" 결정 라인.
 *
 * 컨셉(물드는 시간표): 검증된 시간표 그리드 위에 이 카드 한 장만 얹어,
 * "다음 수업까지 N분"을 큰 숫자로 보여주고 그 강의의 색으로 카드 배경을 물들인다.
 * 같은 색이 아래 그리드의 그 강의 셀에서 다시 빛나 "지금→다음"을 색 한 줄기로 잇는다.
 *
 * 상태 3분기 (campus-desk 붕괴 회피 — 가로 2-zone으로 텍스트 겹침 원천 차단):
 *   - current 있음: "지금 · {과목}" + "{끝시각}까지" + 끝시각 칩
 *   - next 있음:    "다음 · {과목}" + "{N분 후}" + 시작시각 칩
 *   - 둘 다 없음:   "오늘 일정 마무리" (wash 빠지고 중립 pearl)
 *
 * variant:
 *   - "card" (모바일/기본): h-24 세로 카드
 *   - "bar"  (데스크탑): h-[72px] 가로 바
 */
export function SpineCard({
  courses,
  now,
  variant = "card",
  className = "",
}: {
  courses: CourseListItem[];
  now: Date;
  variant?: "card" | "bar";
  className?: string;
}) {
  const isDark = useIsDark();
  const data = useMemo(() => {
    const semester = courses.filter((c) => c.category === "semester");
    return buildTimetable(
      semester.map((c) => ({
        id: c.id,
        name: c.name,
        professor: c.professor,
        location: c.location ?? null,
        color: c.color,
        schedule: c.schedule,
      })),
    );
  }, [courses]);

  const { current, next } = useMemo(() => findNowAndNext(data, now), [data, now]);

  // 시간표 없는 사용자는 카드 자체를 숨김 (그리드도 EmptyTimetableHero로 빠짐).
  if (data.slots.length === 0) return null;

  // 색을 물들일 기준 강의 — 진행 중이면 그것, 아니면 다음.
  const focusSlot: CourseSlot | null = current ?? next;
  const idle = !current && !next;

  // 과목색 wash — 라이트/다크 분기 (var 스왑 대신 직접 — isDark 클라이언트 확정 후라 깜빡임 없음).
  const washStyle =
    focusSlot && !idle
      ? {
          // 스파인은 대시보드 주인공 — 셀(0.45 tint)보다 또렷하게 좌측 0.42 wash.
          backgroundImage: isDark
            ? courseLinearGradientDark(focusSlot.courseName, focusSlot.color)
            : courseLinearGradient(focusSlot.courseName, focusSlot.color, 0.42),
        }
      : undefined;

  const minutesUntil = next ? minutesUntilSlot(next, now) : null;

  // 강의명 잉크색 (다크는 흰색 — 대비 보장).
  const inkColor =
    focusSlot && !isDark ? courseInkColor(focusSlot.courseName, focusSlot.color) : undefined;

  const isBar = variant === "bar";

  // 좌측 과목색 세로 바 — wash가 연한 과목도 정체성을 또렷이. 진한 accent 색.
  const accentBar =
    focusSlot && !idle
      ? (() => {
          const { r, g, b } = courseAccentRgb(focusSlot.courseName, focusSlot.color);
          return `rgb(${r}, ${g}, ${b})`;
        })()
      : null;

  return (
    <div
      className={`course-wash relative flex items-center justify-between gap-3 overflow-hidden rounded-[20px] border border-[var(--color-apple-hairline-soft)] bg-[var(--color-apple-pearl)] elev-1 ${
        isBar ? "h-[72px] pr-5 pl-5" : idle ? "h-16 py-3 pr-4 pl-4" : "h-24 py-3.5 pr-4 pl-4"
      } ${className}`}
      style={washStyle}
    >
      {accentBar && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px] rounded-l-[20px]"
          style={{ backgroundColor: accentBar }}
        />
      )}
      {/* 좌측 zone — 라벨 + 카운트다운/과목 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {current ? (
            <>
              <NowDot />
              <span
                className="text-[11px] uppercase wght-700 text-[var(--color-apple-action)]"
                style={{ letterSpacing: "0.08em" }}
              >
                지금
              </span>
            </>
          ) : next ? (
            <span
              className="text-[11px] uppercase wght-620 text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "0.08em" }}
            >
              다음
            </span>
          ) : null}
          {focusSlot && (
            <span
              className="line-clamp-1 text-[14px] wght-700"
              style={{
                color: inkColor ?? "var(--color-apple-ink)",
                letterSpacing: "-0.018em",
              }}
            >
              {focusSlot.courseName}
            </span>
          )}
        </div>

        {/* 2행 — 큰 카운트다운 또는 끝시각 또는 마무리 */}
        <div className="mt-1">
          {idle ? (
            <span
              className="text-[17px] wght-700 text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "-0.02em" }}
            >
              오늘 일정 마무리
            </span>
          ) : current ? (
            <span
              className={`tabular-nums wght-700 text-[var(--color-apple-ink)] ${
                isBar ? "text-[24px]" : "text-[26px]"
              } leading-none`}
              style={{ letterSpacing: "-0.022em" }}
            >
              {current.slot.endLabel}
              <span className="ml-1 text-[14px] wght-560 text-[var(--color-apple-muted)]">
                까지
              </span>
            </span>
          ) : minutesUntil !== null && minutesUntil >= 0 ? (
            <span
              className={`tabular-nums wght-700 text-[var(--color-apple-ink)] ${
                isBar ? "text-[24px]" : "text-[26px]"
              } leading-none`}
              style={{ letterSpacing: "-0.022em" }}
            >
              {formatUntil(minutesUntil)}
            </span>
          ) : null}
        </div>
      </div>

      {/* 우측 zone — 다음 강의 시작시각 칩 (의미색 코발트).
          current일 땐 좌측 큰 텍스트에 끝시각이 이미 있어 칩 생략(중복 방지). */}
      {next && !current && (
        <div className="shrink-0">
          <span
            className="inline-flex h-8 min-w-[44px] items-center justify-center rounded-[10px] bg-[var(--color-apple-action-soft)] px-2 text-[14px] wght-700 tabular-nums text-[var(--color-apple-action)]"
            style={{ letterSpacing: "-0.018em" }}
          >
            {next.slot.startLabel}
          </span>
        </div>
      )}
    </div>
  );
}
