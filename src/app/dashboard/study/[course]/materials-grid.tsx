"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { MaterialActionsMenu } from "./material-actions-menu";

const TYPE_LABEL = {
  lecture: "강의",
  assignment: "과제",
  exam: "시험",
  team: "팀플",
  syllabus: "강의계획서",
  notice: "공지",
} as const;

interface MaterialItem {
  id: string;
  title: string;
  type: keyof typeof TYPE_LABEL;
  pageCount: number | null;
  uploadedAt: string;
  hasSummary: boolean;
}

/**
 * 자료 카드 그리드 + 일괄 선택·삭제. 선택 모드 토글 시 카드 체크박스 노출.
 *
 * 일괄 삭제는 별도 API 만들지 않고 Promise.all로 단건 DELETE 묶음 — 자료 수십 개 단위
 * 라 부담 없음. 실패한 것은 실패 카운트로 사용자에게 알리되 부분 성공도 받아들임.
 */
export function MaterialsGrid({
  courseName,
  materials,
  dotColor,
  moveTargets,
  currentCourseId,
}: {
  courseName: string;
  materials: MaterialItem[];
  dotColor: string;
  moveTargets: { id: string; name: string }[];
  currentCourseId: string;
}) {
  const router = useRouter();
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(materials.map((m) => m.id)));
  }
  function clearAll() {
    setSelected(new Set());
  }
  function exitSelectMode() {
    setSelectMode(false);
    clearAll();
  }

  async function handleBulkDelete() {
    const ids = Array.from(selected);
    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/materials/${id}`, { method: "DELETE" }).then(async (res) => {
          const j = await res.json();
          if (!res.ok || !j.ok) throw new Error(j.error ?? "삭제 실패");
        }),
      ),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      alert(`${ids.length - failed}개 삭제됨, ${failed}개 실패`);
    }
    setConfirmDelete(false);
    exitSelectMode();
    router.refresh();
  }

  if (materials.length === 0) {
    return (
      <div className="elev-1 mt-6 rounded-[18px] bg-white px-7 py-12 text-center sm:py-16">
        <p
          className="text-[16px] wght-560 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          아직 자료가 없어요
        </p>
        <p
          className="mt-2 text-[13px] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.022em" }}
        >
          아래에서 PDF·HWPX·PPTX·이미지를 끌어다 놓으면 60초 안에 요약과 첫 문제가 만들어져요.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* 선택 모드 툴바 */}
      <div className="mt-4 flex items-center justify-between gap-3">
        {selectMode ? (
          <>
            <div className="flex items-center gap-2">
              <span
                className="text-[12.5px] wght-560 tabular-nums text-[var(--color-apple-ink)]"
                style={{ letterSpacing: "-0.012em" }}
              >
                {selected.size}개 선택됨
              </span>
              <button
                type="button"
                onClick={selected.size === materials.length ? clearAll : selectAll}
                className="rounded-full px-2.5 py-1 text-[11.5px] wght-560 text-[var(--color-apple-action)] hover:bg-[var(--color-apple-pearl)]"
              >
                {selected.size === materials.length ? "전체 해제" : "전체 선택"}
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={exitSelectMode}
                className="rounded-full px-3 py-1.5 text-[12.5px] wght-560 text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => selected.size > 0 && setConfirmDelete(true)}
                disabled={selected.size === 0}
                className="rounded-full bg-[var(--color-urgent)] px-3 py-1.5 text-[12.5px] wght-620 text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                선택 삭제
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setSelectMode(true)}
            className="ml-auto rounded-full px-3 py-1 text-[11.5px] wght-560 text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]"
          >
            선택 모드
          </button>
        )}
      </div>

      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {materials.map((m) => {
          const isSelected = selected.has(m.id);
          return (
            <li key={m.id} className="relative">
              {/* 우상단 ⋯ 메뉴 — 선택 모드에선 숨김 */}
              {!selectMode && (
                <div className="absolute right-3 top-3 z-10">
                  <MaterialActionsMenu
                    materialId={m.id}
                    initialTitle={m.title}
                    currentCourseId={currentCourseId}
                    courses={moveTargets}
                  />
                </div>
              )}

              {selectMode ? (
                <button
                  type="button"
                  onClick={() => toggle(m.id)}
                  aria-pressed={isSelected}
                  className={`group flex h-full w-full flex-col rounded-[12px] bg-white p-6 text-left transition-all ${
                    isSelected
                      ? "ring-2 ring-[var(--color-apple-action)]"
                      : "hover:-translate-y-0.5"
                  }`}
                >
                  <CardInner m={m} dotColor={dotColor} selectMode />
                  <span
                    aria-hidden
                    className={`absolute right-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-md border text-[11px] wght-700 transition-colors ${
                      isSelected
                        ? "border-[var(--color-apple-action)] bg-[var(--color-apple-action)] text-white"
                        : "border-[var(--color-apple-hairline)] bg-white text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                </button>
              ) : (
                <Link
                  href={`/dashboard/study/${encodeURIComponent(courseName)}/${m.id}`}
                  className="group flex h-full flex-col rounded-[12px] bg-white p-6 transition-transform duration-200 hover:-translate-y-0.5"
                >
                  <CardInner m={m} dotColor={dotColor} />
                </Link>
              )}
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={confirmDelete}
        title={`자료 ${selected.size}개 삭제`}
        description={`선택한 자료와 원본 파일이 모두 사라져요. 되돌릴 수 없어요.`}
        confirmLabel="삭제"
        destructive
        onConfirm={handleBulkDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  );
}

function CardInner({
  m,
  dotColor,
  selectMode,
}: {
  m: MaterialItem;
  dotColor: string;
  selectMode?: boolean;
}) {
  return (
    <>
      <div className={`flex items-center justify-between gap-2 ${selectMode ? "pr-8" : "pr-8"}`}>
        <span
          className="text-[11px] wght-560 uppercase tracking-[0.06em]"
          style={{ color: dotColor }}
        >
          {TYPE_LABEL[m.type]}
          {m.hasSummary ? " · 요약 OK" : ""}
        </span>
        <span
          className="text-[11px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {m.pageCount != null ? `${m.pageCount}쪽` : ""}
        </span>
      </div>

      <h3
        className="mt-3 text-[16px] leading-[1.3] wght-560 text-[var(--color-apple-ink)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {m.title}
      </h3>

      <div className="mt-auto pt-5 flex items-center justify-between">
        <span
          className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {formatRelative(m.uploadedAt)}
        </span>
        {!selectMode && (
          <span className="text-[14px] text-[var(--color-apple-muted)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--color-apple-action)]">
            ›
          </span>
        )}
      </div>
    </>
  );
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
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
