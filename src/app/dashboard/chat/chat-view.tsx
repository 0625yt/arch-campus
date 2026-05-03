"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Arrow, Dot } from "@/components/primitives";
import { COURSES, COURSE_COLOR } from "@/app/dashboard/study/data";

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
  /* assistant 메시지는 본문 뒤에 시작점 카드 0~3개 노출 */
  suggestions?: Suggestion[];
  /* 스트리밍 같은 typing 효과 (assistant 첫 진입) */
  pending?: boolean;
};

/* ───────── mock 라우터 ─────────
 * 실제 §4-2 4-Layer 갖춰지기 전까지 키워드 분기로 GPT 톤 흉내.
 * 사용자 입력에서 강의명·위저드 키워드·일정 키워드를 보고 답변 + 시작점 카드 구성. */

const COURSE_KEYWORDS: Record<string, string[]> = {
  운영체제: ["운영체제", "os", "프로세스", "스레드", "스케줄", "동기화"],
  자료구조: ["자료구조", "트리", "그래프", "스택", "큐", "해시"],
  선형대수: ["선형대수", "행렬", "벡터", "고유값", "선형"],
  데이터베이스: ["데이터베이스", "디비", "db", "sql", "정규화", "트랜잭션"],
};

const TOOL_KEYWORDS: { match: string[]; href: string; label: string }[] = [
  { match: ["발표", "ppt", "슬라이드", "프레젠테이션"], href: "/dashboard/tools/presentation", label: "발표 위저드" },
  { match: ["과제", "리포트", "보고서"], href: "/dashboard/tools", label: "과제 위저드 (전체)" },
  { match: ["자기소개서", "자소서"], href: "/dashboard/tools", label: "자기소개서 위저드 (전체)" },
];

function generateMockReply(input: string): { text: string; suggestions?: Suggestion[] } {
  const q = input.toLowerCase();

  // 강의 매칭
  for (const c of COURSES) {
    const keys = COURSE_KEYWORDS[c.slug] ?? [c.slug.toLowerCase()];
    if (keys.some((k) => q.includes(k))) {
      return {
        text: `${c.slug} 관련해서 도와드릴게요. 지금 학기에 업로드된 자료가 ${c.materials.length}개 있어요. 어떤 걸 펼쳐볼까요?`,
        suggestions: [
          ...c.materials.slice(0, 2).map((m) => ({
            label: m.title,
            href: `/dashboard/study/${c.slug}/${m.id}`,
            meta: c.slug,
            dot: COURSE_COLOR[c.slug],
          })),
          { label: `${c.slug} 강의 페이지로`, href: `/dashboard/study/${c.slug}`, meta: "강의" },
        ],
      };
    }
  }

  // 위저드 매칭
  for (const t of TOOL_KEYWORDS) {
    if (t.match.some((k) => q.includes(k))) {
      return {
        text: `${t.label}로 안내드릴게요. 5단계 입력만 거치면 슬라이드·대본·예상 질문까지 정리해 드려요. 학습 보조용 출력이라 본인이 검토·수정해서 쓰셔야 해요.`,
        suggestions: [{ label: `${t.label} 시작`, href: t.href, meta: "위저드" }],
      };
    }
  }

  // 일정·마감
  if (/(일정|마감|언제|시험|과제 마감|캘린더)/.test(q)) {
    return {
      text: "이번 주 마감은 오늘 화면에서 바로 보고, 학기 전체 흐름은 마감 레이더에서 위험한 순서로 볼 수 있어요. 강의계획서를 올리면 시험·과제·발표가 먼저 정리돼요.",
      suggestions: [
        { label: "오늘 마감 보기", href: "/dashboard/today", meta: "오늘" },
        { label: "마감 레이더", href: "/dashboard/calendar", meta: "마감" },
      ],
    };
  }

  // 활동·기록
  if (/(히스토리|기록|활동|뭐했|뭐 했)/.test(q)) {
    return {
      text: "지금까지 만든 요약·문제·발표 자료를 시간순으로 보실 수 있어요.",
      suggestions: [{ label: "히스토리 열기", href: "/dashboard/history", meta: "활동" }],
    };
  }

  // 막연한 요청·인사
  return {
    text: "네, 이렇게 해보면 어떨까요. 지금 학기 자료를 업로드해 두셨다면 강의명을 알려주시면 거기 자료로 요약·문제 만들어 드릴 수 있어요. 발표·과제 위저드도 바로 시작할 수 있어요.",
    suggestions: [
      { label: "오늘 마감 보기", href: "/dashboard/today", meta: "오늘" },
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

  const listEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const submittedInitial = useRef(false);

  // 초기 query 자동 제출
  useEffect(() => {
    if (submittedInitial.current) return;
    if (!initialQ) return;
    submittedInitial.current = true;
    void send(initialQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ]);

  // 새 메시지 들어오면 하단 스크롤
  useLayoutEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // textarea 자동 높이
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [draft]);

  const send = useCallback(async (text: string) => {
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

    // 살짝 지연 후 mock 응답 — 타이핑 느낌
    await new Promise((r) => setTimeout(r, 520));
    const reply = generateMockReply(trimmed);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === aid
          ? { ...m, text: reply.text, suggestions: reply.suggestions, pending: false }
          : m
      )
    );
    setSubmitting(false);
  }, [submitting]);

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
    <div className="relative mx-auto flex min-h-full w-full max-w-[760px] flex-col px-5 sm:px-7 md:px-10">
      <div className="flex-1 pt-8 pb-[180px] sm:pt-12">
        {messages.length === 0 ? (
          <EmptyHint />
        ) : (
          <ul className="space-y-7">
            {messages.map((m, i) => (
              <li key={m.id} className="fade-up" style={{ animationDelay: `${Math.min(i * 30, 120)}ms` }}>
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
        className="pointer-events-none sticky bottom-0 left-0 right-0 -mx-5 sm:-mx-7 md:-mx-10"
      >
        <div className="pointer-events-auto bg-gradient-to-t from-[var(--color-bg)] via-[var(--color-bg)]/95 to-[var(--color-bg)]/0 px-5 pb-5 pt-8 sm:px-7 md:px-10">
          <div className="mx-auto flex w-full items-end gap-2 rounded-2xl border border-[var(--color-line-strong)] bg-[var(--color-bg)] px-3 py-2.5 shadow-[var(--shadow-soft)] transition-shadow duration-[var(--duration-base)] focus-within:shadow-[var(--shadow-lift)]">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="무엇이든 물어보세요"
              className="flex-1 resize-none bg-transparent px-2 py-1.5 text-[14.5px] wght-450 kerning-tight text-[var(--color-fg-strong)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none focus-visible:outline-none"
            />
            <button
              type="submit"
              disabled={!draft.trim() || submitting}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-fg-strong)] text-white transition-opacity disabled:opacity-30"
              aria-label="전송"
            >
              <SendIcon />
            </button>
          </div>
          <p className="mt-2 text-center text-[10.5px] wght-380 kerning-tight text-[var(--color-fg-subtle)]">
            학습 보조용입니다. 결과는 본인이 검토·수정해 사용하세요.
          </p>
        </div>
      </form>
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center text-center">
      <p className="text-[12.5px] wght-560 kerning-mono uppercase text-[var(--color-fg-subtle)]">
        대화 시작
      </p>
      <h1 className="mt-2 text-[24px] leading-[1.25] kerning-tight wght-700 text-[var(--color-fg-strong)] sm:text-[28px]">
        무엇이든 물어보세요
      </h1>
      <p className="mt-2 max-w-[420px] text-[13px] wght-450 kerning-tight text-[var(--color-fg-muted)]">
        강의명을 말씀하시면 자료로 요약·문제를 만들고, 일정·발표·과제도 안내해 드려요.
      </p>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[88%] rounded-2xl bg-[var(--color-surface-strong)] px-4 py-2.5 text-[14px] leading-[1.55] wght-450 kerning-tight text-[var(--color-fg-strong)] sm:max-w-[78%] sm:text-[14.5px]">
        {text}
      </div>
    </div>
  );
}

function AssistantBubble({ m }: { m: Message }) {
  return (
    <div className="flex gap-3">
      <AssistantAvatar />
      <div className="min-w-0 flex-1 pt-1">
        {m.pending ? (
          <TypingDots />
        ) : (
          <p className="whitespace-pre-wrap text-[14px] leading-[1.65] wght-450 kerning-tight text-[var(--color-fg-strong)] sm:text-[14.5px]">
            {m.text}
          </p>
        )}
        {!m.pending && m.suggestions && m.suggestions.length > 0 && (
          <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {m.suggestions.map((s) => (
              <li key={s.href + s.label}>
                <Link
                  href={s.href}
                  className="group flex items-baseline gap-2.5 rounded-xl border border-[var(--color-line)] bg-[var(--color-bg)] px-3.5 py-2.5 transition-all duration-[var(--duration-base)] hover:-translate-y-px hover:border-[var(--color-line-strong)] hover:shadow-[var(--shadow-soft)]"
                >
                  {s.dot ? (
                    <Dot color={s.dot} size={6} className="translate-y-[-1px]" />
                  ) : (
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full bg-[var(--color-fg-disabled)]"
                    />
                  )}
                  <div className="flex min-w-0 flex-1 items-baseline gap-2">
                    <span className="truncate text-[13px] wght-560 kerning-tight text-[var(--color-fg-strong)]">
                      {s.label}
                    </span>
                    {s.meta && (
                      <span className="shrink-0 text-[9.5px] wght-700 kerning-mono uppercase text-[var(--color-fg-subtle)]">
                        {s.meta}
                      </span>
                    )}
                  </div>
                  <Arrow className="reveal-right shrink-0 self-baseline text-[12px] text-[var(--color-fg-subtle)]" />
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
    <div className="relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-[var(--color-fg-strong)]">
      <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent" />
      <span className="relative wght-700 kerning-tight text-[11px] text-white">a</span>
    </div>
  );
}

function TypingDots() {
  return (
    <span aria-label="응답 생성 중" className="inline-flex items-center gap-1 py-2">
      <Dot1 />
      <Dot2 />
      <Dot3 />
    </span>
  );
}
function Dot1() {
  return <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-fg-subtle)] pulse-dot" />;
}
function Dot2() {
  return <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-fg-subtle)] pulse-dot" style={{ animationDelay: "200ms" }} />;
}
function Dot3() {
  return <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-fg-subtle)] pulse-dot" style={{ animationDelay: "400ms" }} />;
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
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
