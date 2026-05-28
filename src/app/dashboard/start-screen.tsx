"use client";

import { CalendarRange, Library, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Dashboard 1급 진입 — "막힌 걸 그대로 적으면 공부 순서로 바꿔드려요" 카피의 챗 입구.
 *
 * 2026-05-23 — 캘린더 AI entry 톤(typing placeholder + gradient orb + glow) 흡수.
 * 첫 화면이 살아 있는 듯한 인상을 주는 것이 목표. shadcn 박스 톤 X, Apple/Linear 톤 O.
 */

const PROMPT_CHIPS: { label: string; prompt: string; tint: string }[] = [
  {
    label: "시험 전 뭐부터 볼지",
    prompt: "운영체제 중간고사 전까지 뭐부터 보면 좋을지 정리해줘",
    tint: "#e0445e",
  },
  {
    label: "과제 3단계로 쪼개기",
    prompt: "자료구조 과제를 오늘 끝낼 수 있게 3단계로 쪼개줘",
    tint: "#cca06b",
  },
  {
    label: "발표 흐름 잡기",
    prompt: "데이터베이스 발표를 슬라이드 흐름과 예상 질문으로 정리해줘",
    tint: "#7aa6d6",
  },
  {
    label: "이번 주 위험 일정",
    prompt: "이번 주 마감과 시험 중 위험한 것부터 알려줘",
    tint: "#a08bc4",
  },
];

const TYPING_PROMPTS = [
  "운영체제 시험이 4일 남았는데 뭐부터 볼까",
  "내일 발표인데 첫 장이 안 잡혀",
  "리포트 주제는 정했는데 목차가 막혀",
  "이번 주 과제·시험 위험한 것부터 알려줘",
] as const;

export function StartScreen() {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // typing placeholder cycle — draft 비어있을 때만 동작
  const [typed, setTyped] = useState("");
  const [promptIdx, setPromptIdx] = useState(0);
  const [phase, setPhase] = useState<"typing" | "hold" | "deleting">("typing");

  useEffect(() => {
    if (draft.length > 0) return;
    const current = TYPING_PROMPTS[promptIdx];
    if (phase === "typing") {
      if (typed.length < current.length) {
        const t = setTimeout(() => setTyped(current.slice(0, typed.length + 1)), 55);
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => setPhase("hold"), 1600);
      return () => clearTimeout(t);
    }
    if (phase === "hold") {
      const t = setTimeout(() => setPhase("deleting"), 0);
      return () => clearTimeout(t);
    }
    if (typed.length > 0) {
      const t = setTimeout(() => setTyped(typed.slice(0, -1)), 24);
      return () => clearTimeout(t);
    }
    setPromptIdx((i) => (i + 1) % TYPING_PROMPTS.length);
    setPhase("typing");
  }, [typed, phase, promptIdx, draft]);

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    router.push(`/dashboard/chat?q=${encodeURIComponent(trimmed)}`);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(draft);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit(draft);
    }
  };

  const showTyping = draft.length === 0;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[980px] flex-col justify-start px-5 pb-10 pt-10 sm:px-7 sm:py-12 md:px-10 md:py-14">
      <section className="fade-up fade-up-1 relative overflow-hidden rounded-[20px] border border-[var(--color-apple-hairline)] bg-[#0b1220] p-5 shadow-[0_28px_80px_-44px_rgba(4,16,40,0.75)] sm:p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(100% 120% at 8% 10%, rgba(0,163,255,.26), transparent 55%), radial-gradient(80% 100% at 96% 0%, rgba(164,105,255,.22), transparent 48%), linear-gradient(180deg, rgba(255,255,255,.04) 0%, rgba(255,255,255,0) 22%)",
          }}
        />

        <div className="relative z-10 grid gap-3 sm:grid-cols-3">
          <PreviewTile
            href="/dashboard"
            title="학기 대시보드"
            subtitle="위험 일정·핵심 우선순위"
            icon={<Sparkles className="h-[14px] w-[14px]" strokeWidth={2.1} />}
          />
          <PreviewTile
            href="/dashboard/calendar"
            title="캘린더"
            subtitle="시간표·강의계획서 통합"
            icon={<CalendarRange className="h-[14px] w-[14px]" strokeWidth={2.1} />}
          />
          <PreviewTile
            href="/dashboard/study"
            title="스터디"
            subtitle="요약·퀴즈·오답 루프"
            icon={<Library className="h-[14px] w-[14px]" strokeWidth={2.1} />}
          />
        </div>
      </section>

      {/* eyebrow — Sparkles 톤. 헤드라인이 살아있다는 신호. */}
      <p className="fade-up mt-8 flex items-center gap-1.5 text-[12px] wght-560 text-[var(--color-apple-muted)]">
        <Sparkles
          className="h-[12px] w-[12px] text-[var(--color-apple-action)]"
          strokeWidth={2.4}
        />
        <span style={{ letterSpacing: "-0.012em" }}>새로 물어보기</span>
      </p>

      <h1
        className="mt-3 fade-up fade-up-1 text-[27px] leading-[1.24] wght-700 text-[var(--color-apple-ink)] sm:text-[32px] md:text-[36px]"
        style={{ letterSpacing: "-0.018em" }}
      >
        막힌 걸 그대로 적으면, 공부 순서로 바꿔드려요
      </h1>
      <p
        className="mt-3 fade-up fade-up-1 max-w-[520px] text-[13.5px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        “뭘 해야 할지 모르겠다” 같은 말도 괜찮아요. 과제·시험·발표 중 지금 행동으로 옮길 수 있는
        형태로 쪼갭니다.
      </p>

      <form onSubmit={onSubmit} className="relative mt-7 fade-up fade-up-2 w-full max-w-[720px]">
        {/* gradient glow — 카드 뒤로 번지는 컬러. focus·hover 시 강해짐 */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-px rounded-[18px] opacity-50 blur-xl transition-opacity duration-500"
          style={{
            background:
              "linear-gradient(120deg, color-mix(in oklab, var(--color-apple-action) 22%, transparent), color-mix(in oklab, #a08bc4 18%, transparent), color-mix(in oklab, #7fb38c 14%, transparent))",
          }}
        />

        <div className="relative flex items-end gap-2 rounded-[16px] border border-[var(--color-apple-hairline)] bg-white px-3 py-2.5 transition-all duration-200 focus-within:-translate-y-px focus-within:border-[var(--color-apple-action)]/40 focus-within:shadow-[0_10px_30px_-14px_rgba(0,113,227,0.28)] hover:border-[var(--color-apple-action)]/30">
          {/* Sparkles orb — 캘린더 AI 카드와 같은 그라데이션 원형 */}
          <span
            aria-hidden
            className="mb-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white shadow-[0_2px_8px_-2px_rgba(0,113,227,0.4)]"
            style={{
              background:
                "linear-gradient(135deg, var(--color-apple-action) 0%, #7aa6d6 60%, #a08bc4 100%)",
            }}
          >
            <Sparkles className="h-[16px] w-[16px]" strokeWidth={2.2} />
          </span>

          <div className="relative flex-1">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => {
                const el = e.target;
                setDraft(el.value);
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
              }}
              onKeyDown={onKeyDown}
              rows={1}
              className="relative z-10 w-full resize-none bg-transparent px-2 py-1.5 text-[14.5px] wght-450 text-[var(--color-apple-ink)] focus:outline-none focus-visible:outline-none"
              style={{ letterSpacing: "-0.012em" }}
            />
            {showTyping && (
              <span
                aria-hidden
                className="pointer-events-none absolute left-2 top-1.5 truncate text-[14.5px] wght-450 text-[var(--color-apple-muted)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                {typed}
                <span className="ml-px inline-block h-[14px] w-[1.5px] -translate-y-[1px] animate-pulse bg-[var(--color-apple-muted)] align-middle" />
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={!draft.trim()}
            className="mb-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-apple-ink)] text-white transition-all hover:scale-105 disabled:scale-100 disabled:opacity-30"
            aria-label="전송"
          >
            <SendIcon />
          </button>
        </div>
      </form>

      <ul className="mt-6 fade-up fade-up-3 grid w-full max-w-[720px] grid-cols-1 gap-2 sm:grid-cols-2">
        {PROMPT_CHIPS.map((c) => (
          <li key={c.label}>
            <button
              type="button"
              onClick={() => submit(c.prompt)}
              className="group relative flex w-full items-center gap-2.5 overflow-hidden rounded-[12px] border border-[var(--color-apple-hairline)] bg-white px-3.5 py-3 text-left text-[12.5px] wght-450 text-[var(--color-apple-muted)] transition-all hover:-translate-y-px hover:border-[var(--color-apple-hairline)] hover:text-[var(--color-apple-ink)] hover:shadow-[0_8px_20px_-12px_rgba(0,0,0,0.12)]"
            >
              {/* 좌측 컬러 점 — 카테고리 단서 (캘린더 EventChip의 좌측 bar 톤) */}
              <span
                aria-hidden
                className="inline-block h-[10px] w-[2px] shrink-0 rounded-full transition-all duration-300 group-hover:h-[16px]"
                style={{ backgroundColor: c.tint }}
              />
              <span className="flex-1" style={{ letterSpacing: "-0.012em" }}>
                {c.label}
              </span>
              <span
                aria-hidden
                className="text-[12px] text-[var(--color-apple-hairline)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--color-apple-action)]"
              >
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PreviewTile({
  href,
  title,
  subtitle,
  icon,
}: {
  href: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-[12px] border border-white/15 bg-white/[0.06] p-3.5 transition-all hover:-translate-y-px hover:bg-white/[0.1]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-white">
          {icon}
        </div>
        <span className="text-[11px] wght-620 text-white/55 transition-colors group-hover:text-white/80">
          열기
        </span>
      </div>
      <p className="mt-3 text-[14px] wght-620 text-white" style={{ letterSpacing: "-0.012em" }}>
        {title}
      </p>
      <p
        className="mt-1.5 text-[12px] leading-[1.45] wght-450 text-white/72"
        style={{ letterSpacing: "-0.01em" }}
      >
        {subtitle}
      </p>
    </Link>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <title>전송</title>
      <path
        d="M8 13V3M8 3L4 7M8 3l4 4"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
