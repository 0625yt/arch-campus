"use client";

import {
  ArrowUpRight,
  Check,
  CheckCheck,
  FileText,
  LoaderCircle,
  Plus,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type CSSProperties, useState } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { pingSidebarCourses } from "@/components/sidebar";
import { useActiveJobs } from "@/lib/hooks/use-active-jobs";
import styles from "./course.module.css";
import { MaterialActionsMenu } from "./material-actions-menu";

const TYPE_LABEL = {
  lecture: "강의",
  assignment: "과제",
  exam: "시험",
  team: "팀플",
  syllabus: "강의계획서",
  notice: "공지",
} as const;
type SummaryFilter = "all" | "ready" | "unread";
interface MaterialItem {
  id: string;
  title: string;
  type: keyof typeof TYPE_LABEL;
  pageCount: number | null;
  uploadedAt: string;
  hasSummary: boolean;
}

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
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SummaryFilter>("all");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { jobs: activeJobs } = useActiveJobs();
  const knownIds = new Set(materials.map((m) => m.id));
  const pendingMaterials = new Map<string, string>();
  for (const job of activeJobs) {
    if (!job.materialId || knownIds.has(job.materialId)) continue;
    if (job.courseId && job.courseId !== currentCourseId) continue;
    pendingMaterials.set(job.materialId, job.materialTitle ?? "새 자료");
  }
  const visibleMaterials = materials.filter((m) => !hiddenIds.has(m.id));
  const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");
  const filteredMaterials = visibleMaterials.filter(
    (m) =>
      m.title.toLocaleLowerCase("ko-KR").includes(normalizedQuery) &&
      (filter === "all" || (filter === "ready" ? m.hasSummary : !m.hasSummary)),
  );
  const filteredPending = Array.from(pendingMaterials.entries()).filter(
    ([, title]) => filter !== "ready" && title.toLocaleLowerCase("ko-KR").includes(normalizedQuery),
  );
  const allSelected =
    filteredMaterials.length > 0 && filteredMaterials.every((m) => selected.has(m.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }
  function resetFilters() {
    setQuery("");
    setFilter("all");
    setSelected(new Set());
  }

  async function handleBulkDelete() {
    const ids = Array.from(selected);
    setDeleteError(null);
    setHiddenIds((prev) => new Set([...prev, ...ids]));
    setConfirmDelete(false);
    exitSelectMode();
    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/materials/${id}`, { method: "DELETE" }).then(async (res) => {
          const json = await res.json();
          if (!res.ok || !json.ok) throw new Error(json.error ?? "삭제 실패");
          return id;
        }),
      ),
    );
    const failedIds = results.flatMap((result, index) =>
      result.status === "rejected" ? [ids[index]] : [],
    );
    if (failedIds.length > 0) {
      setHiddenIds((prev) => {
        const next = new Set(prev);
        for (const id of failedIds) next.delete(id);
        return next;
      });
      setDeleteError(
        `${ids.length - failedIds.length}개 삭제했어요. 삭제하지 못한 ${failedIds.length}개는 다시 표시했어요.`,
      );
    }
    pingSidebarCourses();
    router.refresh();
  }
  function hideMaterial(id: string) {
    setHiddenIds((prev) => new Set([...prev, id]));
  }
  function unhideMaterial(id: string) {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  if (visibleMaterials.length === 0 && pendingMaterials.size === 0 && !deleteError) {
    return (
      <div className={styles.emptyLibrary}>
        <span className={styles.emptyDocument} aria-hidden>
          <FileText size={30} strokeWidth={1.3} />
        </span>
        <div>
          <h3>첫 자료가 들어올 자리</h3>
          <p>강의 자료를 올리고, 핵심 요약과 연습 문제를 만들어 보세요.</p>
          <a href="#upload-zone" className={styles.textLink}>
            자료 추가하기 <Plus size={15} aria-hidden />
          </a>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.libraryToolbar}>
        <fieldset className={styles.filters} aria-label="요약 상태 필터">
          {(
            [
              { value: "all", label: "전체" },
              { value: "ready", label: "요약 완료" },
              { value: "unread", label: "요약 전" },
            ] as const
          ).map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={filter === item.value}
              onClick={() => {
                setFilter(item.value);
                setSelected(new Set());
              }}
            >
              {item.label}
              {item.value === "all" && <span>{visibleMaterials.length}</span>}
            </button>
          ))}
        </fieldset>
        <label className={styles.searchBox}>
          <Search size={15} aria-hidden />
          <input
            type="search"
            aria-label="자료 제목 검색"
            placeholder="자료 제목 검색"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(new Set());
            }}
          />
        </label>
      </div>
      <div className={styles.selectionToolbar}>
        <span className={styles.resultCount} role="status">
          {selectMode ? `${selected.size}개 선택됨` : `${filteredMaterials.length}개의 자료`}
        </span>
        <div className={styles.selectionActions}>
          {selectMode ? (
            <>
              <button
                type="button"
                disabled={filteredMaterials.length === 0}
                onClick={() =>
                  setSelected(allSelected ? new Set() : new Set(filteredMaterials.map((m) => m.id)))
                }
              >
                {allSelected ? "전체 해제" : "전체 선택"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                disabled={selected.size === 0}
                className={styles.deleteButton}
              >
                선택 삭제
              </button>
              <button type="button" onClick={exitSelectMode}>
                취소 <X size={13} aria-hidden />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setSelectMode(true)}
              disabled={filteredMaterials.length === 0}
            >
              <CheckCheck size={15} aria-hidden /> 선택 모드
            </button>
          )}
        </div>
      </div>
      {deleteError && (
        <p className={styles.deleteError} role="alert">
          {deleteError}
        </p>
      )}
      {filteredMaterials.length === 0 && filteredPending.length === 0 ? (
        <div className={styles.noResults}>
          <p>조건에 맞는 자료가 없어요.</p>
          <button type="button" onClick={resetFilters} className={styles.textLink}>
            검색과 필터 초기화
          </button>
        </div>
      ) : (
        <ul className={styles.materialGrid}>
          {filteredMaterials.map((material, index) => {
            const isSelected = selected.has(material.id);
            const cardStyle = {
              "--course-color": dotColor,
              "--card-order": Math.min(index, 5),
            } as CSSProperties;
            return (
              <li key={material.id} className={styles.materialItem} style={cardStyle}>
                {!selectMode && (
                  <div className={styles.materialMenu}>
                    <MaterialActionsMenu
                      materialId={material.id}
                      initialTitle={material.title}
                      currentCourseId={currentCourseId}
                      courses={moveTargets}
                      onDeleteOptimistic={hideMaterial}
                      onDeleteFailed={unhideMaterial}
                    />
                  </div>
                )}
                {selectMode ? (
                  <button
                    type="button"
                    onClick={() => toggle(material.id)}
                    aria-pressed={isSelected}
                    className={styles.materialCard}
                    data-selected={isSelected}
                  >
                    <CardInner material={material} selectMode />
                    <span aria-hidden className={styles.checkbox}>
                      {isSelected && <Check size={14} />}
                    </span>
                  </button>
                ) : (
                  <Link
                    href={`/dashboard/study/${encodeURIComponent(courseName)}/${material.id}`}
                    className={styles.materialCard}
                  >
                    <CardInner material={material} />
                  </Link>
                )}
              </li>
            );
          })}
          {filteredPending.map(([id, title]) => (
            <li key={`pending-${id}`}>
              <PendingCard title={title} />
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={confirmDelete}
        title={`자료 ${selected.size}개 삭제`}
        description="선택한 자료와 원본 파일이 모두 사라져요. 되돌릴 수 없어요."
        confirmLabel="삭제"
        destructive
        onConfirm={handleBulkDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  );
}

function CardInner({
  material,
  selectMode = false,
}: {
  material: MaterialItem;
  selectMode?: boolean;
}) {
  return (
    <>
      <div className={styles.materialTop}>
        <span className={styles.documentIcon} aria-hidden>
          <FileText size={21} strokeWidth={1.5} />
        </span>
        <span className={styles.materialType}>{TYPE_LABEL[material.type]}</span>
        {material.pageCount != null && (
          <span className={styles.pageCount}>{material.pageCount}쪽</span>
        )}
      </div>
      <h3>{material.title}</h3>
      <div className={styles.materialBottom}>
        <div className={styles.materialMeta}>
          <span className={styles.summaryStatus} data-ready={material.hasSummary}>
            <span />
            {material.hasSummary ? "요약 완료" : "요약 전"}
          </span>
          <time dateTime={material.uploadedAt}>{formatRelative(material.uploadedAt)}</time>
        </div>
        {!selectMode && (
          <span className={styles.materialArrow} aria-hidden>
            <ArrowUpRight size={17} />
          </span>
        )}
      </div>
    </>
  );
}

function PendingCard({ title }: { title: string }) {
  return (
    <div aria-busy="true" className={styles.pendingCard}>
      <div className={styles.pendingLabel}>
        <LoaderCircle size={17} aria-hidden /> 생성 중
      </div>
      <h3>{title}</h3>
      <p>요약·문제를 준비하고 있어요</p>
      <span className={styles.pendingProgress} aria-hidden />
    </div>
  );
}

function formatRelative(iso: string): string {
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return "";
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}일 전`;
  return `${Math.round(days / 30)}개월 전`;
}
