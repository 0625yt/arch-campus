"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Dot } from "@/components/primitives";
import { ACTIVITIES, type Activity } from "../history/data";

const COURSE_COLOR: Record<string, string> = {
  운영체제: "#7aa6d6",
  자료구조: "#7fb38c",
  데이터베이스: "#cca06b",
  알고리즘: "#a08bc4",
};

/**
 * Study 라우트 좌측 히스토리 패널.
 * - /dashboard/study           → 전체 활동
 * - /dashboard/study/[course]  → 그 강의의 활동만
 * - /dashboard/study/[c]/[m]   → 그 자료의 활동만
 *
 * xl 이상에서만 노출 (lg 이하는 콘텐츠가 좁아져서 별도 페이지로 폴백).
 */
export function HistoryPanel() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  // ['dashboard', 'study', course?, material?]
  const course = segments[2] ? decodeURIComponent(segments[2]) : null;
  const materialId = segments[3] ? decodeURIComponent(segments[3]) : null;

  const scope = useMemo(() => buildScope(course, materialId), [course, materialId]);

  // 상대 시각은 클라이언트에서만 계산 — SSR과 hydrate 시점이 달라 mismatch 발생
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <aside className="sticky top-0 hidden h-screen-safe w-[260px] shrink-0 flex-col overflow-y-auto border-r border-[var(--color-line)] bg-[var(--color-bg)] xl:flex">
      {/* 헤더 */}
      <div className="border-b border-[var(--color-line)] px-4 py-4">
        <h2 className="text-[10px] wght-700 kerning-mono uppercase text-[var(--color-fg-subtle)]">
          {scope.label}
        </h2>
        <p className="mt-1 text-[12.5px] wght-560 kerning-tight text-[var(--color-fg-strong)]">
          {scope.title}
        </p>
        {scope.hint && (
          <p className="mt-0.5 text-[11px] wght-450 kerning-tight text-[var(--color-fg-muted)]">
            {scope.hint}
          </p>
        )}
      </div>

      {/* 활동 리스트 */}
      <div className="flex-1 px-2 py-3">
        {scope.items.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12px] wght-450 kerning-tight text-[var(--color-fg-subtle)]">
            아직 이 자료에서 활동이 없어요
          </p>
        ) : (
          <ul className="flex flex-col gap-px">
            {scope.items.map((a) => (
              <li key={a.id}>
                <ActivityRow activity={a} mounted={mounted} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 풋터 — 전체 보기 */}
      <div className="border-t border-[var(--color-line)] px-4 py-3">
        <Link
          href="/dashboard/history"
          className="group inline-flex items-baseline gap-1 text-[11.5px] wght-500 kerning-tight text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
        >
          전체 활동 보기
          <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </Link>
      </div>
    </aside>
  );
}

/* ─────────── row ─────────── */

function ActivityRow({ activity, mounted }: { activity: Activity; mounted: boolean }) {
  return (
    <Link
      href={activity.href}
      className="group flex flex-col gap-0.5 rounded-md px-3 py-2 transition-colors hover:bg-[var(--color-surface)]"
    >
      {/* 라벨 줄 */}
      <div className="flex items-baseline gap-1.5">
        <span className="shrink-0 text-[9.5px] wght-700 kerning-mono uppercase text-[var(--color-fg-subtle)]">
          {activity.kind}
        </span>
        {activity.course && (
          <Dot color={COURSE_COLOR[activity.course]} size={4} className="self-center" />
        )}
        {activity.course && (
          <span className="shrink-0 text-[9.5px] wght-560 kerning-mono uppercase text-[var(--color-fg-subtle)]">
            {activity.course}
          </span>
        )}
        <span
          suppressHydrationWarning
          className="ml-auto shrink-0 text-[10px] wght-450 kerning-tight tabular-nums text-[var(--color-fg-subtle)]"
        >
          {mounted ? relativeTime(activity.at) : ""}
        </span>
      </div>

      {/* 제목 */}
      <p className="truncate text-[12.5px] wght-500 kerning-tight text-[var(--color-fg)] group-hover:text-[var(--color-fg-strong)]">
        {activity.title}
      </p>

      {/* 결과 */}
      {activity.result && (
        <p
          className={cn(
            "truncate text-[10.5px] wght-500 kerning-tight",
            activity.result.tone === "good" && "text-[var(--color-success)]",
            activity.result.tone === "bad" && "text-[var(--color-urgent)]",
            activity.result.tone === "neutral" && "text-[var(--color-fg-subtle)]"
          )}
        >
          {activity.result.label}
        </p>
      )}
    </Link>
  );
}

/* ─────────── helpers ─────────── */

function buildScope(course: string | null, materialId: string | null) {
  if (course && materialId) {
    return {
      label: "이 자료의 활동",
      title: shortMaterialTitle(materialId),
      hint: course,
      items: ACTIVITIES.filter(
        (a) => a.course === course && a.href.includes(`/${materialId}`)
      ),
    };
  }
  if (course) {
    return {
      label: "이 강의의 활동",
      title: course,
      hint: undefined,
      items: ACTIVITIES.filter((a) => a.course === course),
    };
  }
  return {
    label: "최근 활동",
    title: "전체",
    hint: `${ACTIVITIES.length}건`,
    items: ACTIVITIES,
  };
}

function shortMaterialTitle(id: string) {
  // mock id를 사람이 읽을 수 있는 형태로
  const map: Record<string, string> = {
    "process-sync": "프로세스 동기화",
    "memory": "메모리 관리",
    "scheduling": "프로세스 스케줄링",
    "bst": "이진 탐색 트리",
    "balanced": "균형 트리",
    "norm": "정규화 1~3NF",
    "dp": "동적 계획법 입문",
  };
  return map[id] ?? id;
}

function relativeTime(d: Date) {
  const diff = Math.max(0, Date.now() - d.getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일`;
  return `${Math.floor(day / 7)}주`;
}
