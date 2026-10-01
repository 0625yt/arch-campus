"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { academicTermLabel } from "@/lib/academic";
import {
  courseGradient,
  courseInkColor,
  courseInkColorDark,
  courseLinearGradient,
  courseLinearGradientDark,
} from "@/lib/course-palette";
import type { QuizListItem } from "@/lib/data/quizzes";
import { useJob } from "@/lib/hooks/use-job";
import { QuizContextWrapper } from "./quiz-context-wrapper";

/**
 * 내 문제 grid — client 컴포넌트.
 *
 * server page에서 quizzes를 fetch해서 props로 전달.
 * 우클릭/long-press/⋯ 시 메뉴 (QuizContextWrapper) — 추가 요청·삭제.
 *
 * 상태 두 가지를 이 목록이 들고 있다:
 *   - hiddenIds: 삭제 optimistic 숨김 (server refresh 도착 전까지 안 보임)
 *   - pendingJobs: "추가 요청"으로 생성 중인 job들 → 상단에 "생성 중…" placeholder 카드.
 *     모달은 요청 즉시 닫히고(사용자는 자유 이동), 생성은 여기서 백그라운드로 감시한다.
 *     완료되면 placeholder 제거 + router.refresh()로 진짜 카드가 fetch돼 자리를 잇는다.
 */

interface PendingJob {
  jobId: string;
  /** placeholder 카드에 보일 라벨 — 원본 퀴즈/강의명 */
  label: string;
  courseName: string | null;
  courseColor: string | null;
}

export function QuizzesGrid({ quizzes }: { quizzes: QuizListItem[] }) {
  const router = useRouter();
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [pendingJobs, setPendingJobs] = useState<PendingJob[]>([]);
  const visible = quizzes.filter((q) => !hiddenIds.has(q.id));

  function hide(id: string) {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }
  function unhide(id: string) {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  const addPending = useCallback((job: PendingJob) => {
    setPendingJobs((prev) => (prev.some((p) => p.jobId === job.jobId) ? prev : [job, ...prev]));
  }, []);

  const resolvePending = useCallback(
    (jobId: string, navigateTo?: string) => {
      setPendingJobs((prev) => prev.filter((p) => p.jobId !== jobId));
      // 새 퀴즈가 생겼으니 목록을 다시 fetch — placeholder 자리를 진짜 카드가 잇는다.
      router.refresh();
      if (navigateTo) router.push(navigateTo);
    },
    [router],
  );

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {pendingJobs.map((p) => (
        <PendingQuizCard key={p.jobId} pending={p} onResolve={resolvePending} />
      ))}
      {visible.map((q) => (
        <QuizContextWrapper
          key={q.id}
          quizId={q.id}
          quizTitle={q.title}
          materialId={q.materialId}
          courseName={q.courseName}
          courseColor={q.courseColor}
          onHide={hide}
          onUnhide={unhide}
          onPending={addPending}
        >
          {({ openMenu }) => <QuizCard quiz={q} onOpenMenu={openMenu} />}
        </QuizContextWrapper>
      ))}
    </ul>
  );
}

/**
 * 생성 중 placeholder — "추가 요청"으로 만드는 퀴즈가 준비될 때까지 자리를 지킨다.
 * job 상태를 직접 감시: done이면 그 자리에서 새 퀴즈로 이동, error면 사라지고 알림.
 * 클릭은 막아둔다(아직 아무 데도 못 감).
 */
function PendingQuizCard({
  pending,
  onResolve,
}: {
  pending: PendingJob;
  onResolve: (jobId: string, navigateTo?: string) => void;
}) {
  const { job } = useJob(pending.jobId);

  useEffect(() => {
    if (job?.status === "done") {
      const newQuizId = (job.result as { quizId?: string } | null)?.quizId;
      onResolve(pending.jobId, newQuizId ? `/dashboard/quiz/${newQuizId}` : undefined);
    } else if (job?.status === "error" || job?.status === "cancelled") {
      onResolve(pending.jobId);
    }
  }, [job?.status, job?.result, pending.jobId, onResolve]);

  const seedName = pending.courseName ?? pending.label;
  const linearWash = courseLinearGradient(seedName, pending.courseColor, 0.22);
  const linearWashDark = courseLinearGradientDark(seedName, pending.courseColor);
  const inkColor = courseInkColor(seedName, pending.courseColor);
  const inkColorDark = courseInkColorDark(seedName, pending.courseColor);

  return (
    <li>
      <div
        className="dark-surface-card course-wash elev-1 relative block overflow-hidden rounded-[14px] bg-white px-4 py-3.5"
        style={
          {
            "--card-wash": linearWash,
            "--card-wash-dark": linearWashDark,
          } as React.CSSProperties
        }
        aria-busy="true"
      >
        {/* 좌→우 흐르는 sheen — "작업 중"을 정적 텍스트보다 분명하게 */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 animate-[quiz-shimmer_1.4s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/45 to-transparent dark:via-white/10"
          style={{ backgroundSize: "200% 100%" }}
        />
        <div className="relative flex items-baseline justify-between gap-2">
          <p
            className="min-w-0 flex-1 truncate text-[10.5px] wght-700 uppercase tracking-[0.06em]"
            style={{ color: `light-dark(${inkColor}, ${inkColorDark})` }}
          >
            {pending.courseName ?? "자료"}
          </p>
          <span className="shrink-0 text-[10.5px] wght-560 tabular-nums text-[var(--color-apple-action)]">
            생성 중…
          </span>
        </div>
        <p
          className="relative mt-2 flex items-center gap-2 text-[14px] leading-[1.3] wght-620 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          <span
            aria-hidden
            className="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-[var(--color-apple-action)] border-t-transparent"
          />
          새 문제를 만들고 있어요
        </p>
        <p
          className="relative mt-2.5 text-[11.5px] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          다른 화면으로 가도 돼요. 다 되면 여기 떠요.
        </p>
      </div>
    </li>
  );
}

function QuizCard({
  quiz,
  onOpenMenu,
}: {
  quiz: QuizListItem;
  onOpenMenu: (pos: { x: number; y: number }) => void;
}) {
  const seedName = quiz.courseName ?? quiz.title;
  const linearWash = courseLinearGradient(seedName, quiz.courseColor, 0.22);
  const linearWashDark = courseLinearGradientDark(seedName, quiz.courseColor);
  const hoverGrad = courseGradient(seedName, quiz.courseColor);
  const inkColor = courseInkColor(seedName, quiz.courseColor);
  const inkColorDark = courseInkColorDark(seedName, quiz.courseColor);

  // 이미 풀었고 마지막 시도에서 못 맞힌 문제가 있으면 → 카드 클릭은 "오답만 다시 풀기".
  // 그래야 틀린 것만 빠르게 복습. 전부 맞혔거나 안 풀었으면 처음부터.
  // wrongCount는 wrong_items_v 뷰 기준 실제 남은 오답 수 — 빼셈(안 푼 문제까지 셈)을 쓰지 않는다.
  const wrongCount = quiz.wrongCount;
  const hasWrong = quiz.attemptCount > 0 && wrongCount > 0;
  const href = hasWrong ? `/dashboard/quiz/${quiz.id}/wrong` : `/dashboard/quiz/${quiz.id}`;

  return (
    <li
      className="card-glow-ribbon dark-surface-card course-wash elev-1 group relative overflow-hidden rounded-[14px] bg-white transition-shadow hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
      style={
        {
          "--card-wash": linearWash,
          "--card-wash-dark": linearWashDark,
        } as React.CSSProperties
      }
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: hoverGrad }}
      />
      <Link
        href={href}
        className={`spring-press relative block px-4 pt-3.5 ${hasWrong ? "pb-2.5" : "pb-3.5"}`}
      >
        <div className="relative flex items-baseline justify-between gap-2">
          <p
            className="min-w-0 flex-1 truncate text-[10.5px] wght-700 uppercase tracking-[0.06em]"
            style={{ color: `light-dark(${inkColor}, ${inkColorDark})` }}
          >
            {quiz.courseName ?? "자료"}
          </p>
          {/* 시간 — ⋯ 버튼이 위에 떠 있으므로 오른쪽에 패딩 확보 */}
          <span
            className="shrink-0 pr-7 text-[10.5px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {formatRelative(quiz.createdAt)}
          </span>
        </div>
        <p
          className="mt-2 line-clamp-2 text-[14px] leading-[1.3] wght-620 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {quiz.title}
        </p>
        <div
          className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          <span className="tabular-nums">{quiz.questionCount}문제</span>
          <span className="dot-sep">·</span>
          <span>{quiz.difficulty}</span>
          {quiz.semesterYear && quiz.semesterTerm ? (
            <>
              <span className="dot-sep">·</span>
              <span>{academicTermLabel(quiz.semesterYear, quiz.semesterTerm)}</span>
            </>
          ) : null}
          <span className="dot-sep">·</span>
          {quiz.attemptCount === 0 ? (
            <span className="wght-620 text-[var(--color-apple-action)]">새 세트</span>
          ) : quiz.lastScore !== null && quiz.lastAttemptTotal !== null ? (
            <span className="tabular-nums">
              {quiz.lastScore}/{quiz.lastAttemptTotal} · {quiz.attemptCount}회
            </span>
          ) : (
            <span className="tabular-nums">{quiz.attemptCount}회 풀이</span>
          )}
        </div>
      </Link>

      {hasWrong && (
        <div className="relative z-10 mx-4 flex items-center justify-between gap-2 border-t border-[var(--color-apple-hairline)] py-2.5">
          <Link
            href={`/dashboard/quiz/${quiz.id}/wrong`}
            className="inline-flex min-h-11 items-center text-[11.5px] wght-620 text-[var(--color-urgent)] hover:underline"
          >
            오답 {wrongCount}문제 복습 →
          </Link>
          <Link
            href={`/dashboard/quiz/${quiz.id}`}
            className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-[var(--color-apple-pearl)] px-3 text-[10.5px] wght-560 text-[var(--color-apple-muted)] transition-colors hover:text-[var(--color-apple-ink)]"
          >
            전체 다시
          </Link>
        </div>
      )}

      <button
        type="button"
        aria-label="문제 메뉴"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          onOpenMenu({ x: r.right, y: r.bottom });
        }}
        className="absolute right-1 top-1 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <title>문제 메뉴</title>
          <circle cx="3" cy="8" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="13" cy="8" r="1.4" />
        </svg>
      </button>
    </li>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "최근";
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}일 전`;
  const mon = Math.round(day / 30);
  return `${mon}개월 전`;
}
