"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

type Role = "user" | "assistant";

type Suggestion = {
  label: string;
  href: string;
  meta?: string;
  dot?: string;
};

type Message = {
  id: string;
  role: Role;
  text: string;
  suggestions?: Suggestion[];
  pending?: boolean;
};

interface ChatCourse {
  id: string;
  name: string;
  color: string | null;
  materialCount: number;
}

const COURSE_KEYWORDS: Record<string, string[]> = {
  운영체제: ["운영체제", "os", "프로세스", "스레드", "스케줄", "동기화"],
  자료구조: ["자료구조", "트리", "그래프", "스택", "큐", "해시"],
  선형대수: ["선형대수", "행렬", "벡터", "고유값", "선형"],
  데이터베이스: ["데이터베이스", "디비", "db", "sql", "정규화", "트랜잭션"],
};

const TOOL_KEYWORDS: { match: string[]; href: string; label: string }[] = [
  {
    match: ["발표", "ppt", "슬라이드", "프레젠테이션"],
    href: "/dashboard/tools/presentation",
    label: "발표 위저드",
  },
  { match: ["과제", "리포트", "보고서"], href: "/dashboard/tools", label: "과제 위저드 (전체)" },
  { match: ["자기소개서", "자소서"], href: "/dashboard/tools", label: "자기소개서 위저드 (전체)" },
];

function generateMockReply(
  input: string,
  courses: ChatCourse[],
): { text: string; suggestions?: Suggestion[] } {
  const q = input.toLowerCase();

  for (const c of courses) {
    const keys = COURSE_KEYWORDS[c.name] ?? [c.name.toLowerCase()];
    if (keys.some((k) => q.includes(k))) {
      return {
        text: `${c.name} 관련해서 도와드릴게요. 지금 학기에 업로드된 자료가 ${c.materialCount}개 있어요.`,
        suggestions: [
          {
            label: `${c.name} 강의 페이지로`,
            href: `/dashboard/study/${encodeURIComponent(c.name)}`,
            meta: "강의",
            dot: c.color ?? undefined,
          },
        ],
      };
    }
  }

  for (const t of TOOL_KEYWORDS) {
    if (t.match.some((k) => q.includes(k))) {
      return {
        text: `${t.label}로 안내드릴게요. 5단계 입력만 거치면 슬라이드·대본·예상 질문까지 정리해 드려요. 학습 보조용 출력이라 본인이 검토·수정해서 쓰셔야 해요.`,
        suggestions: [{ label: `${t.label} 시작`, href: t.href, meta: "위저드" }],
      };
    }
  }

  if (/(일정|마감|언제|시험|과제 마감|캘린더)/.test(q)) {
    return {
      text: "이번 주 일정은 수업, 과제, 시험, 팀플, 개인 약속을 한 화면에서 볼 수 있어요. 강의계획서와 과제 안내를 올리면 시험·과제·발표 일정이 먼저 정리돼요.",
      suggestions: [
        { label: "지금 할 일 보기", href: "/dashboard/today", meta: "지금" },
        { label: "일정 보기", href: "/dashboard/calendar", meta: "일정" },
      ],
    };
  }

  if (/(히스토리|기록|활동|뭐했|뭐 했)/.test(q)) {
    return {
      text: "지금까지 만든 요약·문제·발표 자료를 시간순으로 보실 수 있어요.",
      suggestions: [{ label: "기록 열기", href: "/dashboard/history", meta: "활동" }],
    };
  }

  return {
    text: "네, 이렇게 해보면 어떨까요. 지금 학기 자료를 업로드해 두셨다면 강의명을 알려주시면 거기 자료로 요약·문제 만들어 드릴 수 있어요. 발표·과제 위저드도 바로 시작할 수 있어요.",
    suggestions: [
      { label: "지금 할 일 보기", href: "/dashboard/today", meta: "지금" },
      { label: "발표 흐름 잡기", href: "/dashboard/tools/presentation", meta: "도구" },
      { label: "공부 상태 보기", href: "/dashboard/study", meta: "공부" },
    ],
  };
}

export function ChatView() {
  const params = useSearchParams();
  const initialQ = params.get("q")?.trim() ?? "";

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [courses, setCourses] = useState<ChatCourse[]>([]);

  const listEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const submittedInitial = useRef(false);

  useEffect(() => {
    let aborted = false;
    fetch("/api/courses")
      .then((r) => r.json())
      .then((j) => {
        if (!aborted && j?.ok && Array.isArray(j.courses)) setCourses(j.courses);
      })
      .catch(() => {});
    return () => {
      aborted = true;
    };
  }, []);

  useEffect(() => {
    if (submittedInitial.current) return;
    if (!initialQ) return;
    submittedInitial.current = true;
    void send(initialQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ]);

  useLayoutEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [draft]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || submitting) return;

      const uid = crypto.randomUUID();
      const aid = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        { id: uid, role: "user", text: trimmed },
        { id: aid, role: "assistant", text: "", pending: true },
      ]);
      setDraft("");
      setSubmitting(true);

      await new Promise((r) => setTimeout(r, 520));
      const reply = generateMockReply(trimmed, courses);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aid
            ? { ...m, text: reply.text, suggestions: reply.suggestions, pending: false }
            : m,
        ),
      );
      setSubmitting(false);
    },
    [submitting, courses],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void send(draft);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(draft);
    }
  };

  return (
    <div className="relative min-h-full bg-[var(--color-apple-pearl)]">
      <div className="mx-auto flex w-full max-w-[820px] flex-col px-4 sm:px-10 md:px-12">
        <div className="flex-1 pb-[200px] pt-10 sm:pt-14">
          {messages.length === 0 ? (
            <EmptyHint
              onPick={(q) => {
                setDraft(q);
                inputRef.current?.focus();
              }}
            />
          ) : (
            <ul className="space-y-8">
              {messages.map((m, i) => (
                <li
                  key={m.id}
                  className="fade-up"
                  style={{ animationDelay: `${Math.min(i * 30, 120)}ms` }}
                >
                  {m.role === "user" ? <UserBubble text={m.text} /> : <AssistantBubble m={m} />}
                </li>
              ))}
            </ul>
          )}
          <div ref={listEndRef} />
        </div>

        {/* 하단 고정 입력창 */}
        <form
          onSubmit={onSubmit}
          className="pointer-events-none sticky bottom-0 left-0 right-0 -mx-6 sm:-mx-10 md:-mx-12"
        >
          <div className="pointer-events-auto bg-gradient-to-t from-[var(--color-apple-pearl)] via-[var(--color-apple-pearl)] via-70% to-transparent px-6 pb-6 pt-10 sm:px-10 md:px-12">
            <div className="mx-auto flex w-full items-end gap-2 rounded-[18px] border border-[var(--color-apple-hairline-soft)] bg-white px-4 py-3 transition-colors focus-within:border-[var(--color-apple-action)]">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="무엇이든 물어보세요"
                className="flex-1 resize-none bg-transparent px-1 py-1 text-[15px] wght-450 text-[var(--color-apple-ink)] placeholder:text-[var(--color-apple-muted)] focus:outline-none focus-visible:outline-none"
                style={{ letterSpacing: "-0.012em" }}
              />
              <button
                type="submit"
                disabled={!draft.trim() || submitting}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-apple-action)] text-white transition-all duration-150 hover:bg-[var(--color-apple-action-hover)] active:scale-[0.95] disabled:opacity-30"
                aria-label="전송"
              >
                <SendIcon />
              </button>
            </div>
            <p
              className="mt-3 text-center text-[11px] wght-450 text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              학습 보조용입니다. 결과는 본인이 검토·수정해 사용하세요.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

const STARTER_QUESTIONS = [
  "이번 주 마감 알려줘",
  "운영체제 시험이 4일 남았는데 뭐부터 볼까",
  "발표 준비, 어떤 순서로 만들면 좋을까",
  "이 자료 요약해줘",
] as const;

function EmptyHint({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1
        className="text-[28px] leading-[1.1] wght-620 text-[var(--color-apple-ink)] sm:text-[36px]"
        style={{ letterSpacing: "-0.012em" }}
      >
        무엇이든 물어보세요.
      </h1>
      <p
        className="mt-4 max-w-[440px] text-[15px] leading-[1.55] wght-450 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.022em" }}
      >
        강의명을 말씀하시면 자료로 요약·문제를 만들고, 일정·발표·과제도 안내해 드려요.
      </p>

      {/* 칩 — 클릭하면 입력창에 자동 입력. 사용자가 첫 질문을 떠올리는 비용을 0으로. */}
      <ul className="mt-7 flex flex-wrap items-center justify-center gap-1.5">
        {STARTER_QUESTIONS.map((q) => (
          <li key={q}>
            <button
              type="button"
              onClick={() => onPick(q)}
              className="inline-flex items-center rounded-full border border-[var(--color-apple-hairline)] bg-white px-3.5 py-2 text-[12.5px] wght-560 text-[var(--color-apple-ink)] transition-colors hover:border-[var(--color-apple-action)] hover:text-[var(--color-apple-action)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              {q}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[88%] rounded-[18px] bg-[var(--color-apple-action)] px-4 py-2.5 text-[14.5px] leading-[1.55] wght-450 text-white sm:max-w-[78%]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {text}
      </div>
    </div>
  );
}

function AssistantBubble({ m }: { m: Message }) {
  return (
    <div className="flex gap-3">
      <AssistantAvatar />
      <div className="min-w-0 flex-1 pt-0.5">
        {m.pending ? (
          <TypingDots />
        ) : (
          <p
            className="whitespace-pre-wrap text-[15px] leading-[1.65] wght-450 text-[var(--color-apple-ink)] sm:text-[15.5px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {m.text}
          </p>
        )}
        {!m.pending && m.suggestions && m.suggestions.length > 0 && (
          <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {m.suggestions.map((s) => (
              <li key={s.href + s.label}>
                <Link
                  href={s.href}
                  className="group flex items-center gap-3 rounded-[12px] bg-white px-4 py-3 transition-transform duration-200 hover:-translate-y-0.5"
                >
                  {s.dot ? (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: s.dot }}
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-apple-hairline)]"
                    />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span
                      className="truncate text-[13.5px] wght-560 text-[var(--color-apple-ink)]"
                      style={{ letterSpacing: "-0.012em" }}
                    >
                      {s.label}
                    </span>
                    {s.meta && (
                      <span className="text-[10.5px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]">
                        {s.meta}
                      </span>
                    )}
                  </div>
                  <span className="shrink-0 text-[14px] text-[var(--color-apple-muted)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--color-apple-action)]">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AssistantAvatar() {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-apple-ink)]">
      <span className="text-[11px] wght-620 text-white" style={{ letterSpacing: "-0.012em" }}>
        a
      </span>
    </div>
  );
}

function TypingDots() {
  return (
    <span aria-label="응답 생성 중" className="inline-flex items-center gap-1 py-2">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-apple-muted)] pulse-dot" />
      <span
        className="h-1.5 w-1.5 rounded-full bg-[var(--color-apple-muted)] pulse-dot"
        style={{ animationDelay: "200ms" }}
      />
      <span
        className="h-1.5 w-1.5 rounded-full bg-[var(--color-apple-muted)] pulse-dot"
        style={{ animationDelay: "400ms" }}
      />
    </span>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 13V3M8 3L4 7M8 3l4 4"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
