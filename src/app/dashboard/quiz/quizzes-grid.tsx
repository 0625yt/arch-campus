"use client";

import Link from "next/link";
import { useState } from "react";
import {
  courseGradient,
  courseInkColor,
  courseLinearGradient,
  courseLinearGradientDark,
} from "@/lib/course-palette";
import type { QuizListItem } from "@/lib/data/quizzes";
import { QuizContextWrapper } from "./quiz-context-wrapper";

/**
 * 내 문제 grid — client 컴포넌트.
 *
 * server page에서 quizzes를 fetch해서 props로 전달.
 * 우클릭/long-press 시 삭제 메뉴 (QuizContextWrapper).
 * optimistic 숨김: 메뉴 클릭 즉시 사라지고 server refresh 도착 전까지 안 보임.
 */
export function QuizzesGrid({ quizzes }: { quizzes: QuizListItem[] }) {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
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

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {visible.map((q) => (
        <QuizContextWrapper
          key={q.id}
          quizId={q.id}
          quizTitle={q.title}
          onHide={hide}
          onUnhide={unhide}
        >
          <QuizCard quiz={q} />
        </QuizContextWrapper>
      ))}
    </ul>
  );
}

function QuizCard({ quiz }: { quiz: QuizListItem }) {
  const href = `/dashboard/quiz/${quiz.id}`;
  const seedName = quiz.courseName ?? quiz.title;
  const linearWash = courseLinearGradient(seedName, quiz.courseColor, 0.22);
  const linearWashDark = courseLinearGradientDark(seedName, quiz.courseColor);
  const hoverGrad = courseGradient(seedName, quiz.courseColor);
  const inkColor = courseInkColor(seedName, quiz.courseColor);

  return (
    <li>
      <Link
        href={href}
        className="card-glow-ribbon dark-surface-card course-wash elev-1 spring-press group relative block overflow-hidden rounded-[14px] bg-white px-4 py-3.5 transition-shadow hover:-translate-y-px hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
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
        <div className="relative flex items-baseline justify-between gap-3">
          <p
            className="text-[10.5px] wght-700 uppercase tracking-[0.06em]"
            style={{ color: inkColor }}
          >
            {quiz.courseName ?? "자료"}
          </p>
          <span
            className="shrink-0 text-[10.5px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
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
          <span className="dot-sep">·</span>
          {quiz.attemptCount === 0 ? (
            <span className="wght-620 text-[var(--color-apple-action)]">새 세트</span>
          ) : quiz.lastScore !== null ? (
            <span className="tabular-nums">
              {quiz.lastScore}/{quiz.questionCount} · {quiz.attemptCount}회
            </span>
          ) : (
            <span className="tabular-nums">{quiz.attemptCount}회 풀이</span>
          )}
        </div>
      </Link>
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
