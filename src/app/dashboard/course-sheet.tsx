"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { CourseListItem } from "@/lib/data/materials";
import { parseScheduleString, weekdayKoShort, type Weekday } from "@/lib/timetable-grid";

/**
 * Dashboard에서 강의 칸 클릭 시 우측에서 spring up되는 시트.
 *
 * 페이지 이동 없이 강의 메타·시간표·자료 카운트를 보여주고,
 * "자료 보기·새 자료 올리기"로 study 페이지·업로드 흐름으로 진입.
 *
 * 인라인 편집 (사용자 요청 2026-05-30):
 *  - "수정" 버튼 → 강의명·강의실·시간 slots 인라인 input
 *  - 저장 → PATCH /api/courses/[id], 성공 시 router.refresh()로 대시보드+캘린더 동시 갱신
 *  - 캐시 무효화는 API 안에서 revalidatePath 처리 (study + dashboard + calendar)
 */
export function CourseSheet({
  course,
  onClose,
}: {
  course: CourseListItem | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!course) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !editing) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [course, onClose, editing]);

  useEffect(() => {
    if (!course) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [course]);

  // 새 course 열릴 때 편집 모드 reset
  useEffect(() => {
    setEditing(false);
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
        onClick={editing ? undefined : onClose}
        className="backdrop-in fixed inset-0 z-40 bg-black/30 backdrop-blur-[6px]"
      />
      <aside
        className="sheet-up fixed z-50 flex flex-col bg-white shadow-[0_30px_80px_-20px_rgba(15,23,42,0.35)]
          inset-x-0 bottom-0 max-h-[88dvh] rounded-t-[24px]
          md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[440px] md:rounded-none md:rounded-l-[24px]"
        role="dialog"
        aria-label={`${course.name} 상세`}
      >
        <div className="flex justify-center pt-3 md:hidden">
          <span aria-hidden className="h-1 w-10 rounded-full bg-[var(--color-apple-hairline)]" />
        </div>

        <header className="flex items-start justify-between gap-3 px-7 pt-7 pb-5">
          <div className="min-w-0 flex-1 sheet-item-in">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: dotColor }}
              />
              <p
                className="text-[11px] uppercase tracking-[0.08em] wght-700 text-[var(--color-apple-muted)]"
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
          <div className="flex items-center gap-1.5">
            {!editing && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="spring-press inline-flex h-9 items-center gap-1 rounded-full bg-[var(--color-apple-ink)] px-3.5 text-[12px] wght-620 text-white transition-opacity hover:opacity-90"
                style={{ letterSpacing: "-0.012em" }}
                aria-label="강의 수정"
              >
                <PencilIcon />
                수정
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="spring-press flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-apple-pearl)] text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-apple-hairline)] hover:text-[var(--color-apple-ink)]"
              aria-label="닫기"
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        <div className="sheet-stagger flex flex-1 flex-col gap-6 overflow-y-auto px-7 pb-10">
          {editing ? (
            <EditForm
              course={course}
              initialSlots={slots.map((s) => ({
                weekday: s.weekday,
                start: s.startLabel,
                end: s.endLabel,
              }))}
              onCancel={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                router.refresh();
                onClose();
              }}
            />
          ) : (
            <>
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
            </>
          )}
        </div>
      </aside>
    </>
  );
}

/* ─────────────────────────── Edit Form ─────────────────────────── */

interface SlotDraft {
  weekday: Weekday;
  start: string; // "HH:MM"
  end: string;
}

const WEEKDAYS_KO: Record<Weekday, string> = {
  MON: "월",
  TUE: "화",
  WED: "수",
  THU: "목",
  FRI: "금",
  SAT: "토",
  SUN: "일",
};

const TIME_RE = /^([0-1]?\d|2[0-3]):([0-5]\d)$/;

function EditForm({
  course,
  initialSlots,
  onCancel,
  onSaved,
}: {
  course: CourseListItem;
  initialSlots: SlotDraft[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(course.name);
  const [location, setLocation] = useState(course.location ?? "");
  const [slots, setSlots] = useState<SlotDraft[]>(
    initialSlots.length > 0 ? initialSlots : [{ weekday: "MON", start: "09:00", end: "10:50" }],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateSlot = (idx: number, patch: Partial<SlotDraft>) => {
    setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const removeSlot = (idx: number) => {
    setSlots((prev) => prev.filter((_, i) => i !== idx));
  };
  const addSlot = () => {
    setSlots((prev) => [...prev, { weekday: "MON", start: "09:00", end: "10:50" }]);
  };

  const save = async () => {
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("강의명을 비울 수 없어요");
      return;
    }

    for (const s of slots) {
      if (!TIME_RE.test(s.start) || !TIME_RE.test(s.end)) {
        setError("시간은 HH:MM 형식이어야 해요 (예: 09:00)");
        return;
      }
      if (timeToMin(s.start) >= timeToMin(s.end)) {
        setError("끝 시간이 시작 시간보다 빨라요");
        return;
      }
    }

    const schedule = slots.map(
      (s) => `${WEEKDAYS_KO[s.weekday]} ${s.start}-${s.end}`,
    );

    setBusy(true);
    try {
      const res = await fetch(`/api/courses/${course.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: trimmedName !== course.name ? trimmedName : undefined,
          location: location.trim() !== (course.location ?? "") ? location.trim() || null : undefined,
          schedule,
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setError(json.error ?? "저장에 실패했어요");
        return;
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet-item-in flex flex-col gap-5">
      <Field label="강의명">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-[10px] border border-[var(--color-apple-hairline)] bg-white px-3.5 py-2.5 text-[14px] wght-560 text-[var(--color-apple-ink)] outline-none transition-colors focus:border-[var(--color-apple-action)]"
          style={{ letterSpacing: "-0.012em" }}
          maxLength={80}
        />
      </Field>

      <Field label="강의실 (선택)">
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="예: 백마관 201"
          className="w-full rounded-[10px] border border-[var(--color-apple-hairline)] bg-white px-3.5 py-2.5 text-[14px] wght-560 text-[var(--color-apple-ink)] outline-none transition-colors focus:border-[var(--color-apple-action)] placeholder:text-[var(--color-apple-muted)]/60"
          style={{ letterSpacing: "-0.012em" }}
          maxLength={120}
        />
      </Field>

      <div>
        <div className="flex items-baseline justify-between">
          <SectionLabel>강의 시간</SectionLabel>
          <button
            type="button"
            onClick={addSlot}
            className="text-[11.5px] wght-620 text-[var(--color-apple-action)] hover:underline"
            style={{ letterSpacing: "-0.012em" }}
          >
            + 시간 추가
          </button>
        </div>
        <ul className="mt-3 flex flex-col gap-2">
          {slots.map((s, idx) => (
            <li
              key={idx}
              className="flex items-center gap-2 rounded-[10px] bg-[var(--color-apple-pearl)] px-2.5 py-2"
            >
              <select
                value={s.weekday}
                onChange={(e) => updateSlot(idx, { weekday: e.target.value as Weekday })}
                className="h-8 rounded-[8px] border border-[var(--color-apple-hairline)] bg-white px-2 text-[12.5px] wght-620 text-[var(--color-apple-ink)] outline-none focus:border-[var(--color-apple-action)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                {(Object.keys(WEEKDAYS_KO) as Weekday[]).map((w) => (
                  <option key={w} value={w}>
                    {WEEKDAYS_KO[w]}요일
                  </option>
                ))}
              </select>
              <input
                type="time"
                value={s.start}
                onChange={(e) => updateSlot(idx, { start: e.target.value })}
                className="h-8 flex-1 rounded-[8px] border border-[var(--color-apple-hairline)] bg-white px-2 text-[12.5px] wght-560 tabular-nums text-[var(--color-apple-ink)] outline-none focus:border-[var(--color-apple-action)]"
              />
              <span className="text-[11px] text-[var(--color-apple-muted)]">–</span>
              <input
                type="time"
                value={s.end}
                onChange={(e) => updateSlot(idx, { end: e.target.value })}
                className="h-8 flex-1 rounded-[8px] border border-[var(--color-apple-hairline)] bg-white px-2 text-[12.5px] wght-560 tabular-nums text-[var(--color-apple-ink)] outline-none focus:border-[var(--color-apple-action)]"
              />
              {slots.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeSlot(idx)}
                  className="spring-press flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--color-apple-muted)] transition-colors hover:bg-white hover:text-[var(--color-urgent)]"
                  aria-label="이 시간 삭제"
                >
                  <CloseIcon />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {error && (
        <p
          className="rounded-[8px] bg-[var(--color-urgent)]/8 px-3 py-2 text-[12.5px] wght-560 text-[var(--color-urgent)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {error}
        </p>
      )}

      <div className="mt-auto flex flex-col gap-2 pt-2 sm:flex-row">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="spring-press inline-flex h-[44px] flex-1 items-center justify-center rounded-full bg-[var(--color-apple-ink)] px-5 text-[13.5px] wght-620 text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ letterSpacing: "-0.012em" }}
        >
          {busy ? "저장 중…" : "저장"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="spring-press inline-flex h-[44px] flex-1 items-center justify-center rounded-full border border-[var(--color-apple-hairline)] bg-white px-5 text-[13.5px] wght-620 text-[var(--color-apple-ink)] transition-colors hover:bg-[var(--color-apple-pearl)] disabled:opacity-50"
          style={{ letterSpacing: "-0.012em" }}
        >
          취소
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/* ─────────────────────────── Atoms ─────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[11px] uppercase tracking-[0.08em] wght-700 text-[var(--color-apple-muted)]"
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

function PencilIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden fill="none">
      <path
        d="M2 12l1-3 7-7 2 2-7 7-3 1z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
