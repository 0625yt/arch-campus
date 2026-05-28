"use client";

import { useState } from "react";
import { useSpeechInput } from "@/lib/hooks/use-speech-input";
import type { CourseOption } from "./calendar-board";

/**
 * 자연어 → 일정 draft → 사용자 검증 → 일괄 추가.
 *
 * 디자인 결정 (3차 — Cron/Notion Calendar 톤 SaaS):
 *   - DESIGN.md §10 위반 잔재 제거:
 *       · "AI" 단어 X · 마침표 카피 X · 좌측 ● 도트 X · generic shadcn 모달 X
 *       · pill segmented control 무분별 사용 X (예시 칩은 학습 어포던스로 정당화)
 *   - 1차/2차에서 사용자가 화났던 톤 ("AI 양산형", "Apple 미니멀 너무 비어있음") 둘 다 버림.
 *   - 입력 단계:
 *       · 헤더는 eyebrow X — 작은 sparkle 아이콘 1개 + 큰 헤드라인 1줄 (Cron 톤)
 *       · textarea = **확실한 그릇** (12px border + focus cobalt ring + 내부 패딩)
 *       · 예시 = **클릭 가능한 칩** (rounded-full + hairline + hover cobalt + 미세 라벨로 어포던스)
 *       · 첫 클릭은 replace, 이후는 newline append
 *   - 검토 단계:
 *       · 카드 그릇 살림 (rounded-xl + shadow-sm + 흰 배경)
 *       · 좌측 4px **kind color bar** — 도트 없이 색으로만 kind 표현 (§10 우회)
 *       · 우측 **D-day 큰 숫자** (32px tabular-nums wght-700) — 사용자 명시 1급 정보
 *       · D+0(오늘) / D-3 이내 → urgent · D-7 이내 → kind color · 그 외 → muted
 *       · 선택 시 lift + accent ring · 비선택 시 opacity 0.4 (의도 불명확 X)
 *       · 호버 시 우측에 편집·휴지통 작은 액션 (Linear/Granola 톤)
 *       · 인라인 편집은 명시적 "편집" 클릭으로 expand (focus-within implicit 폐기)
 *
 * 흐름:
 *   1) 자유 문장 입력 (예: "다음주 화 3시 영어 과제, 5/30 알바 6~10시")
 *   2) POST /api/events/draft → Haiku가 events[] 반환
 *   3) 각 draft 카드 — 행 클릭으로 선택 토글, 편집 아이콘으로 펼침
 *   4) "N개 캘린더에 추가" → POST /api/events 일괄 호출
 *
 * 사용자 검증을 강제로 두는 이유: confidence 0.7~0.9. 자동 추가 X.
 * CLAUDE.md §4 (학습 보조, 자동화 X) — 타이핑만 줄이고 결정은 본인이.
 */

type Kind = "exam" | "assignment" | "presentation" | "etc";

interface Draft {
  title: string;
  kind: Kind;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  weight_percent: number | null;
  notes: string | null;
  confidence: number;
  course_id: string | null;
  selected: boolean;
}

// kind를 작은 회색 캡션으로만. 컬러 pill·도트 X (§10).
const KIND_CAPTION: Record<Kind, string> = {
  exam: "시험",
  assignment: "과제",
  presentation: "발표",
  etc: "기타",
};

// kind별 좌측 bar 색 — calendar-board KIND_FALLBACK_COLOR와 일치.
// 도트가 아니라 카드 좌측 4px vertical bar로 변환 (§10 우회).
const KIND_BAR_COLOR: Record<Kind, string> = {
  exam: "#e0445e", // coral
  assignment: "#cca06b", // mustard
  presentation: "#7aa6d6", // cobalt
  etc: "#a08bc4", // mauve
};

export function EventAIDraftPanel({
  courses,
  onClose,
  onDone,
  onSwitchToManual,
}: {
  courses: CourseOption[];
  onClose: () => void;
  onDone: () => void;
  onSwitchToManual: () => void;
}) {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"input" | "review">("input");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 인라인 편집 펼침은 명시적 — focus-within implicit 패턴 폐기.
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  // 음성 입력 — 한국어 받아쓰기. 지원 안 되는 브라우저면 버튼 자체 안 보임.
  const speech = useSpeechInput("ko-KR");

  function handleToggleMic() {
    if (speech.listening) {
      speech.stop();
      return;
    }
    speech.start({
      onFinal: (transcript) => {
        // 입력란이 비었으면 그대로, 뭐가 있으면 줄바꿈 append.
        setText((prev) => {
          const cur = prev.trim();
          if (!cur) return transcript;
          return `${cur}\n${transcript}`;
        });
      },
      onError: (reason) => {
        if (reason) setError(reason);
      },
    });
  }

  async function handleParse() {
    if (busy) return;
    const trimmed = text.trim();
    if (!trimmed) {
      setError("일정을 자유롭게 적어주세요");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/events/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "정리에 실패했어요");
        return;
      }
      const arr = (json.events as Omit<Draft, "selected" | "course_id">[]) ?? [];
      if (arr.length === 0) {
        setError("일정으로 보이는 내용을 못 찾았어요");
        return;
      }
      setDrafts(
        arr.map((d) => ({
          ...d,
          course_id: guessCourseId(d.title, courses),
          selected: true,
        })),
      );
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (busy) return;
    const picked = drafts.filter((d) => d.selected);
    if (picked.length === 0) {
      setError("추가할 일정을 골라주세요");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // 순차 POST — batch endpoint가 없으므로.
      let added = 0;
      for (const d of picked) {
        const res = await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            course_id: d.course_id,
            kind: d.kind,
            title: d.title,
            notes: d.notes,
            // /api/events zod는 Z 종료 ISO만 받음.
            starts_at: toUtcIso(d.starts_at),
            ends_at: d.ends_at ? toUtcIso(d.ends_at) : null,
            all_day: d.all_day,
            weight_percent: d.weight_percent,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setError(`${added}/${picked.length}개 추가됨 · ${json.error ?? "오류"}`);
          if (added > 0) onDone();
          return;
        }
        added += 1;
      }
      onDone();
    } finally {
      setBusy(false);
    }
  }

  function updateDraft(idx: number, patch: Partial<Draft>) {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  }

  function removeDraft(idx: number) {
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
    setExpandedIdx((cur) => (cur === idx ? null : cur));
  }

  // ─── 검토 단계 ────────────────────────────────────────────────────────
  if (phase === "review") {
    const selectedCount = drafts.filter((d) => d.selected).length;
    return (
      <article className="relative">
        {/* 우상단 닫기 — popover 톤. EventDetailPanel InspectorIconButton과 같은 모양. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          title="닫기"
          className="absolute right-3 top-3 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path
              d="M3.5 3.5l7 7M10.5 3.5l-7 7"
              stroke="currentColor"
              strokeWidth={1.3}
              strokeLinecap="round"
            />
          </svg>
        </button>

        <div className="flex flex-col px-5 pb-5 pt-6 sm:px-6">
          {/* 헤드라인 — eyebrow X. Cron/Notion은 굵은 한 줄로 시작. */}
          <h3
            className="pr-10 text-[20px] leading-[1.25] wght-700 text-[var(--color-apple-ink)] sm:text-[22px]"
            style={{ letterSpacing: "-0.018em" }}
          >
            추가할 일정을 골라주세요
          </h3>
          <p
            className="mt-1.5 text-[13px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            <span className="tabular-nums wght-560 text-[var(--color-apple-ink)]">
              {drafts.length}개
            </span>
            <span className="mx-1.5 text-[var(--color-apple-hairline)]">·</span>
            <span className="tabular-nums wght-560 text-[var(--color-apple-action)]">
              {selectedCount}개 선택됨
            </span>
          </p>

          {/* 카드 리스트 — 그릇 살림. shadow-sm + rounded-xl + 흰 배경. */}
          <ul className="mt-5 flex flex-col gap-2.5">
            {drafts.map((d, i) => (
              <DraftCard
                key={i}
                draft={d}
                courses={courses}
                expanded={expandedIdx === i}
                onToggle={() => updateDraft(i, { selected: !d.selected })}
                onChange={(patch) => updateDraft(i, patch)}
                onExpand={() => setExpandedIdx((cur) => (cur === i ? null : i))}
                onRemove={() => removeDraft(i)}
              />
            ))}
          </ul>

          {error && (
            <p className="mt-4 rounded-[8px] bg-[var(--color-urgent-soft)] px-3 py-2 text-[12px] wght-560 text-[var(--color-urgent)]">
              {error}
            </p>
          )}

          {/* 워터마크 — §4 의무. 카드 리스트와 액션 바 사이 작게. */}
          <p
            className="mt-5 text-[11px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.006em" }}
          >
            본인 검토 후 추가
          </p>

          {/* 액션 — 우측 큰 cobalt 버튼. */}
          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setPhase("input");
                setDrafts([]);
                setExpandedIdx(null);
                setError(null);
              }}
              disabled={busy}
              className="rounded-[8px] px-3 py-2 text-[13px] wght-560 text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)] disabled:opacity-50"
              style={{ letterSpacing: "-0.012em" }}
            >
              다시 적기
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy || selectedCount === 0}
              className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--color-apple-action)] px-4 py-2.5 text-[13.5px] wght-620 text-white shadow-[0_1px_2px_rgba(0,0,0,0.06),0_4px_12px_-4px_rgba(0,113,227,0.32)] transition-all duration-200 hover:bg-[var(--color-apple-action-hover)] hover:shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_20px_-4px_rgba(0,113,227,0.42)] active:scale-[0.98] disabled:opacity-40 disabled:shadow-none disabled:hover:bg-[var(--color-apple-action)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              {busy ? (
                <>
                  <Spinner />
                  추가 중
                </>
              ) : (
                <>
                  <span className="tabular-nums">{selectedCount}</span>개 캘린더에 추가
                </>
              )}
            </button>
          </div>
        </div>
      </article>
    );
  }

  // ─── 입력 단계 ────────────────────────────────────────────────────────
  const trimmedReady = text.trim().length > 0;
  return (
    <article className="relative">
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        title="닫기"
        className="absolute right-3 top-3 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path
            d="M3.5 3.5l7 7M10.5 3.5l-7 7"
            stroke="currentColor"
            strokeWidth={1.3}
            strokeLinecap="round"
          />
        </svg>
      </button>

      <div className="flex flex-col px-5 pb-5 pt-6 sm:px-6">
        {/* 헤더 — Cron 톤. eyebrow X. 작은 sparkle 아이콘 + 큰 한 줄. */}
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-apple-action-soft)] text-[var(--color-apple-action)]"
          >
            <SparkleIcon />
          </span>
          <h3
            className="text-[20px] leading-[1.25] wght-700 text-[var(--color-apple-ink)] sm:text-[22px]"
            style={{ letterSpacing: "-0.018em" }}
          >
            어떤 일정을 추가할까요
          </h3>
        </div>
        <p
          className="mt-1.5 pl-8 text-[13px] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          한 줄에 하나씩 자유롭게 적어주세요
        </p>

        {/* textarea 그릇 — 12px rounded + border + focus-within cobalt ring + 패딩.
            placeholder가 곧 라벨 역할인 borderless 톤은 사용자가 비어있다고 화남 → 명시적 그릇.
            우측 하단에 mic 버튼 — 한국어 받아쓰기. 지원 안 되는 브라우저에선 자체적으로 안 보임. */}
        <label className="mt-4 flex flex-col rounded-[12px] border border-[var(--color-apple-hairline)] bg-white px-4 py-3 transition-all duration-150 focus-within:border-[var(--color-apple-action)] focus-within:shadow-[0_0_0_3px_rgba(0,113,227,0.15)]">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={2000}
            autoFocus
            placeholder={EXAMPLE_PLACEHOLDER}
            className="w-full resize-none border-0 bg-transparent p-0 text-[15px] leading-[1.55] wght-450 text-[var(--color-apple-ink)] outline-none placeholder:text-[var(--color-apple-muted)]/55"
            style={{ letterSpacing: "-0.012em" }}
          />
          {/* interim 미리보기 + mic 버튼. interim은 회색 italic으로 "지금 듣고 있어요" 느낌만. */}
          {(speech.supported || speech.interim) && (
            <div className="mt-2 flex items-end justify-between gap-3">
              <p
                className={`min-h-[16px] flex-1 text-[12.5px] italic wght-450 ${
                  speech.listening
                    ? "text-[var(--color-apple-action)]"
                    : "text-[var(--color-apple-muted)]/60"
                }`}
                style={{ letterSpacing: "-0.012em" }}
                aria-live="polite"
              >
                {speech.listening ? (speech.interim ? `“${speech.interim}”` : "듣고 있어요…") : ""}
              </p>
              {speech.supported && (
                <button
                  type="button"
                  onClick={handleToggleMic}
                  aria-pressed={speech.listening}
                  aria-label={speech.listening ? "음성 입력 중지" : "음성 입력 시작"}
                  className={
                    speech.listening
                      ? "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-urgent)] text-white shadow-[0_2px_8px_-2px_rgba(255,69,58,0.6)] transition-all duration-150 hover:scale-105"
                      : "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--color-apple-hairline)] bg-white text-[var(--color-apple-muted)] transition-all duration-150 hover:border-[var(--color-apple-action)] hover:text-[var(--color-apple-action)]"
                  }
                >
                  <MicIcon active={speech.listening} />
                </button>
              )}
            </div>
          )}
        </label>

        {/* 예시 칩 — 클릭 가능. 학습 어포던스를 미세 라벨로 분명히. */}
        <div className="mt-4 flex flex-col gap-2">
          <p
            className="text-[11px] wght-560 uppercase text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "0.06em" }}
          >
            눌러서 채우기
          </p>
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() =>
                  setText((prev) => {
                    const cur = prev.trim();
                    if (!cur) return ex;
                    // 이미 같은 예시가 들어있으면 토글로 빼주기 (학습용 칩 안전장치).
                    if (cur === ex || cur.split(/\n/).includes(ex)) return cur;
                    return `${cur}\n${ex}`;
                  })
                }
                className="inline-flex items-center gap-1 rounded-full border border-[var(--color-apple-hairline)] bg-white px-3 py-1.5 text-[12.5px] wght-450 text-[var(--color-apple-ink)] transition-all duration-150 hover:-translate-y-px hover:border-[var(--color-apple-action)] hover:text-[var(--color-apple-action)] hover:shadow-[0_1px_2px_rgba(0,113,227,0.12)] active:translate-y-0 active:scale-[0.98]"
                style={{ letterSpacing: "-0.012em" }}
              >
                <PlusIcon />
                <span>{ex}</span>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-[8px] bg-[var(--color-urgent-soft)] px-3 py-2 text-[12px] wght-560 text-[var(--color-urgent)]">
            {error}
          </p>
        )}

        {/* 액션. */}
        <div className="mt-6 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onSwitchToManual}
            disabled={busy}
            className="rounded-[8px] px-3 py-2 text-[13px] wght-560 text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)] disabled:opacity-50"
            style={{ letterSpacing: "-0.012em" }}
          >
            직접 적기
          </button>
          <button
            type="button"
            onClick={handleParse}
            disabled={busy || !trimmedReady}
            className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--color-apple-action)] px-4 py-2.5 text-[13.5px] wght-620 text-white shadow-[0_1px_2px_rgba(0,0,0,0.06),0_4px_12px_-4px_rgba(0,113,227,0.32)] transition-all duration-200 hover:bg-[var(--color-apple-action-hover)] hover:shadow-[0_1px_2px_rgba(0,0,0,0.06),0_8px_20px_-4px_rgba(0,113,227,0.42)] active:scale-[0.98] disabled:opacity-40 disabled:shadow-none disabled:hover:bg-[var(--color-apple-action)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {busy ? (
              <>
                <Spinner />
                정리 중
              </>
            ) : (
              "정리"
            )}
          </button>
        </div>
      </div>
    </article>
  );
}

/**
 * Draft 카드 — Cron/Notion Calendar 톤.
 *  - rounded-xl + 1px hairline + shadow-sm + 흰 배경 → 그릇 살림 (사용자 1·2차에서 평탄하다고 화남)
 *  - 좌측 4px **kind color bar** (§10 도트 우회) — 비선택 시 30% opacity로 옅게
 *  - 우측 **D-day 큰 숫자** (32px tabular-nums wght-700) — 사용자 명시 1급 정보
 *  - 선택 시: cobalt border + lift -1px + shadow-md
 *  - 비선택 시: opacity 0.45 (의도 명확)
 *  - 호버 시 우측 작은 편집·휴지통 아이콘 (Linear 톤)
 *  - 인라인 편집은 explicit "편집" 클릭으로 expand
 */
function DraftCard({
  draft,
  courses,
  expanded,
  onToggle,
  onChange,
  onExpand,
  onRemove,
}: {
  draft: Draft;
  courses: CourseOption[];
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<Draft>) => void;
  onExpand: () => void;
  onRemove: () => void;
}) {
  const localStart = isoToKstLocal(draft.starts_at);
  const lowConfidence = draft.confidence < 0.75;
  const courseName = courses.find((c) => c.id === draft.course_id)?.name;
  const barColor = KIND_BAR_COLOR[draft.kind];

  const dDay = computeDDay(draft.starts_at);
  const dDayTone = dDay.tone; // "urgent" | "warm" | "muted"
  const dDayColor =
    dDayTone === "urgent"
      ? "var(--color-urgent)"
      : dDayTone === "warm"
        ? barColor
        : "var(--color-apple-muted)";

  const meta = formatMetaLine(draft.starts_at, draft.ends_at, draft.all_day);

  return (
    <li
      className={`group relative rounded-[12px] border bg-white transition-all duration-150 ${
        draft.selected
          ? "border-[var(--color-apple-action)] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,113,227,0.28)]"
          : "border-[var(--color-apple-hairline-soft)] opacity-45 shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:opacity-70"
      } hover:-translate-y-px`}
    >
      {/* 좌측 4px kind color bar — §10 도트 우회. 카드 라운드와 같은 모양. */}
      <span
        aria-hidden
        className="absolute left-0 top-0 bottom-0 w-[4px] rounded-l-[12px] transition-opacity"
        style={{
          backgroundColor: barColor,
          opacity: draft.selected ? 1 : 0.3,
        }}
      />

      {/* 카드 본체 — 행 클릭으로 선택 토글. 내부 input·아이콘은 stopPropagation. */}
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={draft.selected}
        aria-label={draft.selected ? `${draft.title} 선택 해제` : `${draft.title} 선택`}
        className="absolute inset-0 z-0 cursor-pointer rounded-[12px]"
      />

      <div className="relative z-[1] flex items-center gap-3 px-4 py-3.5 pl-5">
        <div className="min-w-0 flex-1">
          {/* 상단: 제목 + (low confidence 시 우측 작은 캡션) */}
          <div className="flex items-baseline justify-between gap-3">
            <p
              className="truncate text-[15px] wght-700 text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "-0.014em" }}
            >
              {draft.title}
            </p>
            {lowConfidence && (
              <span
                className="shrink-0 text-[10.5px] wght-560 text-[#b27a00]"
                style={{ letterSpacing: "-0.006em" }}
                title={`자신감 ${Math.round(draft.confidence * 100)}%`}
              >
                확인 필요
              </span>
            )}
          </div>
          {/* 메타 — 시간 · kind · 강의 */}
          <p
            className="mt-1 truncate text-[12.5px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            <span className="tabular-nums">{meta}</span>
            <span className="mx-1.5 text-[var(--color-apple-hairline)]">·</span>
            <span>{KIND_CAPTION[draft.kind]}</span>
            {courseName && (
              <>
                <span className="mx-1.5 text-[var(--color-apple-hairline)]">·</span>
                <span>{courseName}</span>
              </>
            )}
          </p>
        </div>

        {/* 우측 D-day 큰 숫자 — 사용자 명시 1급 정보. */}
        <div className="flex shrink-0 flex-col items-end leading-none">
          <span
            className="text-[28px] tabular-nums wght-700 sm:text-[30px]"
            style={{ letterSpacing: "-0.024em", color: dDayColor }}
          >
            {dDay.label}
          </span>
          {dDay.sub && (
            <span
              className="mt-0.5 text-[10.5px] wght-560 uppercase text-[var(--color-apple-muted)]"
              style={{ letterSpacing: "0.06em" }}
            >
              {dDay.sub}
            </span>
          )}
        </div>

        {/* 호버 액션 — 편집·삭제. 카드 우상단에 absolute. */}
        <div className="absolute right-2 top-2 z-[2] flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
          <CardIconButton
            ariaLabel={expanded ? "편집 접기" : "편집"}
            onClick={(e) => {
              e.stopPropagation();
              onExpand();
            }}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path
                d="M9.5 2.5l2 2-7 7H2.5v-2l7-7z"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </CardIconButton>
          <CardIconButton
            ariaLabel="이 일정 빼기"
            destructive
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path
                d="M3 4h8M5.5 4V2.5h3V4M4 4l.5 8h5L10 4M6 6.5v3.5M8 6.5v3.5"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </CardIconButton>
        </div>
      </div>

      {/* 인라인 편집 트레이 — explicit expand. focus-within implicit 폐기. */}
      {expanded && (
        <div
          className="relative z-[2] flex flex-col gap-3 border-t border-[var(--color-apple-hairline-soft)] px-4 py-3 pl-5"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 제목 인라인 편집 */}
          <FieldRow label="제목">
            <input
              type="text"
              value={draft.title}
              onChange={(e) => onChange({ title: e.target.value })}
              className="w-full rounded-[6px] border border-[var(--color-apple-hairline)] bg-white px-2.5 py-1.5 text-[13px] wght-560 text-[var(--color-apple-ink)] outline-none transition-colors focus:border-[var(--color-apple-action)]"
              style={{ letterSpacing: "-0.012em" }}
            />
          </FieldRow>
          {/* 시간 + 강의 한 줄 */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <FieldRow label="시작">
              <input
                type="datetime-local"
                value={localStart}
                onChange={(e) => onChange({ starts_at: kstLocalToIso(e.target.value) })}
                className="w-full rounded-[6px] border border-[var(--color-apple-hairline)] bg-white px-2.5 py-1.5 text-[12.5px] tabular-nums wght-450 text-[var(--color-apple-ink)] outline-none transition-colors focus:border-[var(--color-apple-action)]"
                style={{ letterSpacing: "-0.012em" }}
              />
            </FieldRow>
            {courses.length > 0 && (
              <FieldRow label="강의">
                <select
                  value={draft.course_id ?? ""}
                  onChange={(e) => onChange({ course_id: e.target.value || null })}
                  className="w-full rounded-[6px] border border-[var(--color-apple-hairline)] bg-white px-2.5 py-1.5 text-[12.5px] wght-450 text-[var(--color-apple-ink)] outline-none transition-colors focus:border-[var(--color-apple-action)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  <option value="">강의 없음</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </FieldRow>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

/** 인라인 편집 라벨. */
function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-1 flex-col gap-1">
      <span
        className="text-[10.5px] wght-560 uppercase text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "0.06em" }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

/** 카드 우상단 작은 액션 아이콘 — EventDetailPanel InspectorIconButton 톤. */
function CardIconButton({
  ariaLabel,
  destructive = false,
  onClick,
  children,
}: {
  ariaLabel: string;
  destructive?: boolean;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/80 backdrop-blur-[2px] text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)] ${
        destructive ? "hover:bg-[var(--color-urgent-soft)] hover:text-[var(--color-urgent)]" : ""
      }`}
    >
      {children}
    </button>
  );
}

function SparkleIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M7 1.5l1.4 3.6L12 6.5l-3.6 1.4L7 11.5 5.6 7.9 2 6.5l3.6-1.4L7 1.5z"
        fill="currentColor"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
      <path d="M5 1.5v7M1.5 5h7" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" />
    </svg>
  );
}

/**
 * 마이크 아이콘 — 16px line + 받침대. active일 땐 살짝 펄스(녹화 중 시그널).
 */
function MicIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label={active ? "녹음 중" : "마이크"}
      className={active ? "animate-pulse" : ""}
    >
      <title>{active ? "녹음 중" : "마이크"}</title>
      <path
        d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 11a7 7 0 0 0 14 0M12 18v3"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className="animate-spin"
    >
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** 자유 문장에 "글로컬 영어" 같은 강의명이 포함되면 자동 매칭. */
function guessCourseId(title: string, courses: CourseOption[]): string | null {
  for (const c of courses) {
    if (title.includes(c.name)) return c.id;
    // 약식 매칭 — 강의명 첫 단어가 포함되면 (예: "글로컬 영어 I" → "글로컬")
    const first = c.name.split(/\s+/)[0];
    if (first && first.length >= 2 && title.includes(first)) return c.id;
  }
  return null;
}

/** ISO with offset → datetime-local input value ("YYYY-MM-DDTHH:mm"), KST 기준. */
function isoToKstLocal(iso: string): string {
  const d = new Date(iso);
  const kstMs = d.getTime() + 9 * 60 * 60 * 1000;
  const k = new Date(kstMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}T${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}`;
}

/** ISO → UTC ISO with trailing Z. /api/events zod가 Z만 받음. */
function toUtcIso(iso: string): string {
  return new Date(iso).toISOString();
}

/** datetime-local input value → ISO with +09:00 offset. */
function kstLocalToIso(local: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) {
    return new Date().toISOString();
  }
  return `${local}:00+09:00`;
}

/**
 * D-day 계산 — KST 자정 기준.
 *  - tone: "urgent" (D+0 또는 D-3 이내) · "warm" (D-7 이내, kind 색) · "muted" (그 외)
 *  - label: "오늘" / "D-3" / "D+1" 식
 *  - sub: 라벨 아래 microcaption (예: D-7 이상이면 "ㄴ월 ㄴ일" 같은 보조). 짧게.
 */
function computeDDay(iso: string): {
  label: string;
  sub: string | null;
  tone: "urgent" | "warm" | "muted";
} {
  const d = new Date(iso);
  const now = new Date();
  // KST 자정 기준으로 일수 계산
  const kstNowMs = now.getTime() + 9 * 60 * 60 * 1000;
  const kstNowDay = Math.floor(kstNowMs / 86400000);
  const kstDMs = d.getTime() + 9 * 60 * 60 * 1000;
  const kstDDay = Math.floor(kstDMs / 86400000);
  const days = kstDDay - kstNowDay;

  if (days === 0) return { label: "오늘", sub: null, tone: "urgent" };
  if (days < 0) {
    // 과거 (드물지만 사용자가 잘못 적었거나 어제 마감) — muted
    return { label: `D+${-days}`, sub: null, tone: "muted" };
  }
  if (days <= 3) return { label: `D-${days}`, sub: null, tone: "urgent" };
  if (days <= 7) return { label: `D-${days}`, sub: null, tone: "warm" };
  return { label: `D-${days}`, sub: null, tone: "muted" };
}

/** 메타 라인 — "5월 26일 화 · 오후 3:00" 또는 종일이면 "5월 26일 화 · 종일". */
function formatMetaLine(iso: string, _endsAt: string | null, allDay: boolean): string {
  void _endsAt;
  const d = new Date(iso);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  if (allDay) return `${month}월 ${day}일 ${weekday} · 종일`;
  const hour = d.getHours();
  const min = d.getMinutes();
  const ampm = hour < 12 ? "오전" : "오후";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const minLabel = min === 0 ? "" : `:${String(min).padStart(2, "0")}`;
  return `${month}월 ${day}일 ${weekday} · ${ampm} ${h12}${minLabel}`;
}

const EXAMPLES = [
  "다음 주 화 3시 영어 과제",
  "5월 30일 알바 6시~10시",
  "6월 9일 영어 기말고사 20%",
];

const EXAMPLE_PLACEHOLDER = `다음 주 화 3시 영어 과제
5/30 알바 6~10시
6월 9일 영어 기말고사 20%`;
