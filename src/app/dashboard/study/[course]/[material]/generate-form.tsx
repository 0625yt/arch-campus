"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Arrow } from "@/components/primitives";
import { useJob } from "@/lib/hooks/use-job";
import { cn } from "@/lib/utils";

type Difficulty = "쉬움" | "보통" | "어려움";
type Kind = "multiple-choice" | "short-answer" | "essay";

// 1·3·5·10·20·30·50 — 50개는 시험 직전 대량 점검 유스케이스.
// 자유 입력칸으로 1~50 사이 임의 값도 허용. (50개는 청크 분할·보충 호출로 생성 2~4분 소요)
const COUNT_OPTIONS = [1, 3, 5, 10, 20, 30, 50];
const COUNT_MAX = 50;

const KIND_OPTIONS: Array<{ value: Kind; label: string; subtitle: string }> = [
  { value: "multiple-choice", label: "객관식", subtitle: "4지선다" },
  { value: "short-answer", label: "단답형", subtitle: "단어·구·수식" },
  { value: "essay", label: "서술형", subtitle: "모범답안 비교" },
];

// 의도 조정 프리셋 — 누르면 한 줄칸에 채워진다(자유 입력의 안전한 출발점).
// 자료 밖 생성이 아니라 "자료 안에서 어떻게 물을지"만 조정하는 힌트.
const INTENT_CHIPS = [
  "함정 선택지 강화",
  "개념 비교 중심",
  "계산 과정 강조",
  "정의·용어 위주",
  "예문은 원어 그대로",
];

const QUICK_PRESETS: Array<{
  label: string;
  difficulty: Difficulty;
  count: number;
  kinds: Kind[];
  intentNote: string;
}> = [
  {
    label: "시험 대비",
    difficulty: "보통",
    count: 10,
    kinds: ["multiple-choice", "short-answer"],
    intentNote: "핵심 개념과 헷갈리는 개념 비교 중심",
  },
  {
    label: "빠르게",
    difficulty: "쉬움",
    count: 5,
    kinds: ["multiple-choice"],
    intentNote: "정의·용어 위주",
  },
  {
    label: "함정 점검",
    difficulty: "어려움",
    count: 10,
    kinds: ["multiple-choice"],
    intentNote: "함정 선택지 강화",
  },
  {
    label: "서술 대비",
    difficulty: "어려움",
    count: 5,
    kinds: ["short-answer", "essay"],
    intentNote: "개념의 이유와 비교를 직접 설명하도록",
  },
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SiblingMaterialOption {
  id: string;
  title: string;
  type: string;
}

export function GenerateForm({
  courseSlug,
  materialId,
  materialType,
  siblingMaterials,
}: {
  courseSlug: string;
  materialId: string;
  /** 자료 종류. "exam"이면 AI 문제 생성 대신 자료에 실린 문제·정답·해설을 그대로 추출. */
  materialType?: string;
  /** 묶음 출제용 — 같은 강의의 다른 자료들 (현재 자료 제외). 비면 묶음 섹션 숨김. */
  siblingMaterials?: SiblingMaterialOption[];
}) {
  const router = useRouter();
  const isExamMaterial = materialType === "exam";
  const [difficulty, setDifficulty] = useState<Difficulty>("보통");
  const [count, setCount] = useState(5);
  const [kinds, setKinds] = useState<Set<Kind>>(new Set(["multiple-choice"]));
  const [scope, setScope] = useState("");
  const [intentNote, setIntentNote] = useState("");
  // 묶음 출제용 — 추가로 함께 출제할 다른 자료 ID들. 최대 5개 (서비스/route cap과 일치).
  const [extraMaterialIds, setExtraMaterialIds] = useState<Set<string>>(new Set());
  const [jobId, setJobId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { job, error: pollError } = useJob(jobId);
  const EXTRA_MAX = 5;
  // siblings에서 현재 자료·기출은 제외 (기출은 별도 추출 흐름)
  const eligibleSiblings = (siblingMaterials ?? []).filter(
    (s) => s.id !== materialId && s.type !== "exam",
  );

  function toggleKind(k: Kind) {
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      // 아무것도 선택하지 않으면 서버가 객관식으로 폴백해 화면과 결과가 어긋난다.
      // 마지막 한 종류는 항상 남겨 사용자의 선택을 그대로 보존한다.
      if (next.size === 0) return prev;
      return next;
    });
  }

  function applyPreset(preset: (typeof QUICK_PRESETS)[number]) {
    setDifficulty(preset.difficulty);
    setCount(preset.count);
    setKinds(new Set(preset.kinds));
    setIntentNote(preset.intentNote);
  }

  const isReal = UUID_RE.test(materialId);
  const busy = jobId !== null && job?.status !== "done" && job?.status !== "error";

  async function handleGenerate() {
    if (!isReal) {
      setSubmitError(
        "이 자료는 디자인 시연용 mock이라 진짜 문제는 못 만들어요. 자료를 새로 업로드해 주세요.",
      );
      return;
    }

    setSubmitError(null);
    setJobId(null);
    try {
      const endpoint = isExamMaterial
        ? `/api/materials/${materialId}/exam-extract`
        : `/api/materials/${materialId}/quiz`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: isExamMaterial
          ? undefined
          : JSON.stringify({
              difficulty,
              count,
              kinds: Array.from(kinds),
              scope: scope.trim(),
              intentNote: intentNote.trim(),
              extraMaterialIds: Array.from(extraMaterialIds),
            }),
      });
      // 응답 body가 비거나(서버 timeout·콜드스타트·502) 비-JSON이면 res.json()이 throw —
      // 그대로 catch로 떨어지면 "Unexpected end of JSON input"이 그대로 보임. text로 먼저 받고 안전 파싱.
      const raw = await res.text();
      let json: { ok?: boolean; jobId?: string; error?: string } = {};
      if (raw.trim().length > 0) {
        try {
          json = JSON.parse(raw);
        } catch {
          // body는 있는데 JSON이 아닌 케이스 — 에러 페이지 HTML 등
        }
      }
      if (!res.ok || !json.ok || !json.jobId) {
        const fallbackByStatus =
          res.status === 401
            ? "로그인이 만료됐어요. 새로고침 후 다시 시도해주세요."
            : res.status === 429
              ? "요청이 잠시 많아요. 1분 뒤 다시 시도해주세요."
              : res.status >= 500
                ? `서버 일시 오류 (${res.status}). 잠시 후 다시 시도해주세요.`
                : isExamMaterial
                  ? "기출 추출을 시작하지 못했어요."
                  : "문제로 점검할 수 없었어요.";
        setSubmitError(json.error ?? fallbackByStatus);
        return;
      }
      setJobId(json.jobId);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "네트워크 오류");
    }
  }

  // 작업 완료되면:
  //   - AI 생성: 새 퀴즈로 자동 이동
  //   - 기출 추출: 자료 페이지 새로고침해서 추출 결과 표시
  useEffect(() => {
    if (job?.status !== "done") return;
    if (isExamMaterial) {
      router.refresh();
      return;
    }
    const quizId = (job.result as { quizId?: string } | null)?.quizId;
    if (quizId) router.push(`/dashboard/quiz/${quizId}`);
  }, [job?.status, job?.result, router, isExamMaterial]);

  const errorMsg = submitError ?? pollError ?? (job?.status === "error" ? job.errorMessage : null);

  // 새 퀴즈 done 상태인데 자동 navigate가 실패했을 때 (브라우저 prefetch 취소·focus 잃음 등)
  // 사용자가 직접 클릭할 수 있는 Link도 박는다.
  const doneQuizId =
    job?.status === "done" ? ((job.result as { quizId?: string } | null)?.quizId ?? null) : null;

  void courseSlug; // future: log course context

  return (
    <div>
      {!isExamMaterial && (
        <FieldGroup label="빠른 설정" hint="나중에 아래에서 바꿀 수 있어요">
          <ul className="-mx-1 flex flex-wrap gap-x-1 gap-y-2">
            {QUICK_PRESETS.map((preset) => {
              const active =
                difficulty === preset.difficulty &&
                count === preset.count &&
                intentNote.trim() === preset.intentNote &&
                preset.kinds.length === kinds.size &&
                preset.kinds.every((kind) => kinds.has(kind));
              return (
                <li key={preset.label}>
                  <button
                    type="button"
                    onClick={() => applyPreset(preset)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-[12.5px] transition-colors",
                      active
                        ? "wght-560 bg-[var(--color-apple-action)] text-white"
                        : "wght-450 text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]",
                    )}
                  >
                    {preset.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </FieldGroup>
      )}

      {!isExamMaterial && (
        <FieldGroup label="난이도" className="mt-7">
          <ul className="-mx-1 flex flex-wrap gap-x-1 gap-y-2">
            {(["쉬움", "보통", "어려움"] as Difficulty[]).map((d) => {
              const active = difficulty === d;
              return (
                <li key={d}>
                  <button
                    type="button"
                    onClick={() => setDifficulty(d)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-[12.5px] transition-colors",
                      active
                        ? "wght-560 bg-[var(--color-apple-ink)] text-white"
                        : "wght-450 text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]",
                    )}
                  >
                    {d}
                  </button>
                </li>
              );
            })}
          </ul>
        </FieldGroup>
      )}

      {!isExamMaterial && (
        <FieldGroup label="문제 수" hint={`${expectedGenerationTime(count)} 예상`} className="mt-7">
          <ul className="-mx-1 flex flex-wrap gap-x-1 gap-y-2">
            {COUNT_OPTIONS.map((n) => {
              const active = count === n;
              return (
                <li key={n}>
                  <button
                    type="button"
                    onClick={() => setCount(n)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-[12.5px] tabular-nums transition-colors",
                      active
                        ? "wght-560 bg-[var(--color-apple-ink)] text-white"
                        : "wght-450 text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]",
                    )}
                  >
                    {n}문제
                  </button>
                </li>
              );
            })}
            {/* 자유 입력 — chip에 없는 값(예: 7·15·25)을 사용자가 직접 적을 수 있게. 1~30 범위 강제. */}
            <li className="ml-1 inline-flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                max={COUNT_MAX}
                value={count}
                onChange={(e) => {
                  const raw = parseInt(e.target.value, 10);
                  if (!Number.isFinite(raw)) return;
                  setCount(Math.min(Math.max(raw, 1), COUNT_MAX));
                }}
                aria-label={`문제 수 직접 입력 (1~${COUNT_MAX})`}
                className="w-14 rounded-full border border-[var(--color-apple-hairline)] bg-white px-2.5 py-1 text-center text-[12.5px] tabular-nums wght-560 text-[var(--color-apple-ink)] outline-none focus:border-[var(--color-apple-action)]"
                style={{ letterSpacing: "-0.012em" }}
              />
              <span className="text-[11px] wght-450 text-[var(--color-apple-muted)]">개 직접</span>
            </li>
          </ul>
        </FieldGroup>
      )}

      <FieldGroup
        label="문제 종류"
        hint={isExamMaterial ? "기출 자료 — 추출만 가능" : `${kinds.size}/3 선택`}
        className={isExamMaterial ? undefined : "mt-7"}
      >
        <ul className="-mx-1 flex flex-wrap gap-x-1 gap-y-2">
          {isExamMaterial ? (
            <li>
              <span className="inline-flex items-baseline gap-1.5 rounded-full bg-[var(--color-apple-ink)] px-3 py-1.5 text-[12.5px] wght-560 text-white">
                기출문제
                <span className="text-[10.5px] wght-450 text-white/65">자료에 실린 그대로</span>
              </span>
            </li>
          ) : (
            KIND_OPTIONS.map(({ value, label, subtitle }) => {
              const active = kinds.has(value);
              return (
                <li key={value}>
                  <button
                    type="button"
                    onClick={() => toggleKind(value)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex items-baseline gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] transition-colors",
                      active
                        ? "wght-560 bg-[var(--color-apple-ink)] text-white"
                        : "wght-450 text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]",
                    )}
                  >
                    {label}
                    <span
                      className={cn(
                        "text-[10.5px] wght-450 tabular-nums",
                        active ? "text-white/65" : "text-[var(--color-apple-muted)]/65",
                      )}
                    >
                      {subtitle}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
        {isExamMaterial && (
          <p className="mt-2.5 text-[11.5px] wght-450 leading-[1.5] text-[var(--color-apple-muted)]">
            자료에 있는 문제만큼 그대로 제출됩니다. 새 문제는 만들지 않아요.
          </p>
        )}
      </FieldGroup>

      {!isExamMaterial && (
        <FieldGroup label="출제 범위" hint="선택 — 비워두면 자료 전체" className="mt-7">
          <input
            type="text"
            value={scope}
            onChange={(e) => setScope(e.target.value.slice(0, 200))}
            placeholder="예: 1~3장만 / p.10~30 위주"
            className="w-full rounded-full border border-[var(--color-apple-hairline)] bg-white px-4 py-2 text-[13px] wght-450 text-[var(--color-apple-ink)] outline-none focus:border-[var(--color-apple-action)] placeholder:text-[var(--color-apple-muted)]/55"
            style={{ letterSpacing: "-0.012em" }}
          />
        </FieldGroup>
      )}

      {!isExamMaterial && eligibleSiblings.length > 0 && (
        <FieldGroup
          label="다른 자료 묶기"
          hint={`선택 — ${extraMaterialIds.size}/${EXTRA_MAX} 묶음, 같은 강의 자료끼리 연결 문제`}
          className="mt-7"
        >
          <ul className="-mx-1 flex flex-wrap gap-x-1 gap-y-2">
            {eligibleSiblings.slice(0, 12).map((s) => {
              const active = extraMaterialIds.has(s.id);
              const reachedMax = !active && extraMaterialIds.size >= EXTRA_MAX;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={reachedMax}
                    onClick={() => {
                      setExtraMaterialIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(s.id)) next.delete(s.id);
                        else if (next.size < EXTRA_MAX) next.add(s.id);
                        return next;
                      });
                    }}
                    aria-pressed={active}
                    title={s.title}
                    className={cn(
                      "max-w-[200px] truncate rounded-full px-3 py-1.5 text-[12px] transition-colors",
                      active
                        ? "wght-560 bg-[var(--color-apple-action)] text-white"
                        : reachedMax
                          ? "wght-450 cursor-not-allowed text-[var(--color-apple-muted)]/50"
                          : "wght-450 text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]",
                    )}
                  >
                    {active && "✓ "}
                    {s.title}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[11px] wght-450 leading-[1.5] text-[var(--color-apple-muted)]">
            여러 자료를 함께 묶으면 자료 간 연결·비교 문제가 나와요. 시험 범위 통합 점검에 좋아요.
          </p>
        </FieldGroup>
      )}

      {!isExamMaterial && (
        <FieldGroup label="추가 요청" hint="선택 — 자료 안에서 강조 방향만" className="mt-7">
          <ul className="-mx-1 flex flex-wrap gap-x-1 gap-y-2">
            {INTENT_CHIPS.map((chip) => {
              const active = intentNote.trim() === chip;
              return (
                <li key={chip}>
                  <button
                    type="button"
                    onClick={() => setIntentNote(active ? "" : chip)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-[12px] transition-colors",
                      active
                        ? "wght-560 bg-[var(--color-apple-action)] text-white"
                        : "wght-450 text-[var(--color-apple-muted)] hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]",
                    )}
                  >
                    {chip}
                  </button>
                </li>
              );
            })}
          </ul>
          <input
            type="text"
            value={intentNote}
            onChange={(e) => setIntentNote(e.target.value.slice(0, 120))}
            placeholder="예: 헷갈리는 짝 비교 위주 / 풀이 단계 묻기"
            className="mt-2.5 w-full rounded-full border border-[var(--color-apple-hairline)] bg-white px-4 py-2 text-[13px] wght-450 text-[var(--color-apple-ink)] outline-none focus:border-[var(--color-apple-action)] placeholder:text-[var(--color-apple-muted)]/55"
            style={{ letterSpacing: "-0.012em" }}
          />
          <p className="mt-2 text-[11px] wght-450 leading-[1.5] text-[var(--color-apple-muted)]">
            자료 안에서 무엇을 강조할지만 조정해요. 자료에 없는 내용은 만들지 않아요.
          </p>
        </FieldGroup>
      )}

      {errorMsg && (
        <p
          className="mt-6 text-[12.5px] wght-450 text-[var(--color-urgent)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {errorMsg}
        </p>
      )}

      <div className="-mx-5 -mb-5 mt-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--color-apple-hairline)] bg-white px-5 py-4 sm:-mx-6 sm:-mb-6 sm:px-6 sm:py-5">
        {doneQuizId && !isExamMaterial ? (
          <Link
            href={`/dashboard/quiz/${doneQuizId}`}
            className="group inline-flex items-center gap-2 rounded-full bg-[var(--color-apple-ink)] px-5 py-2.5 text-[13.5px] wght-560 text-white transition-opacity hover:opacity-90"
            style={{ letterSpacing: "-0.012em" }}
          >
            새 문제 풀러가기
            <Arrow className="text-[12px] transition-transform group-hover:translate-x-0.5" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={busy}
            className={cn(
              "group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[13.5px] wght-560 transition-all duration-[var(--duration-fast)]",
              busy
                ? "cursor-wait bg-[var(--color-apple-pearl)] text-[var(--color-apple-muted)]"
                : "bg-[var(--color-apple-ink)] text-white hover:opacity-90",
            )}
          >
            {busy && <Spinner />}
            {busy
              ? isExamMaterial
                ? "기출문제를 추출하고 있어요…"
                : "문제지를 만들고 있어요…"
              : isExamMaterial
                ? "기출문제 추출하기"
                : `${count}문제 만들기`}
            {!busy && (
              <Arrow className="text-[12px] transition-transform group-hover:translate-x-0.5" />
            )}
          </button>
        )}

        {busy ? (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] wght-450 text-[var(--color-apple-muted)]">
            <span className="tabular-nums text-[var(--color-apple-ink)]">다른 메뉴 가도</span>{" "}
            이어집니다
          </span>
        ) : (
          <span className="ml-auto hidden items-center gap-1.5 text-[11px] wght-450 text-[var(--color-apple-muted)] sm:inline-flex">
            평균{" "}
            <span className="tabular-nums text-[var(--color-apple-ink)]">
              {isExamMaterial ? "30~60초" : expectedGenerationTime(count)}
            </span>{" "}
            소요
          </span>
        )}
      </div>
    </div>
  );
}

function expectedGenerationTime(count: number): string {
  if (count <= 5) return "20~40초";
  if (count <= 10) return "30~60초";
  if (count <= 20) return "1~2분";
  if (count <= 30) return "2~3분";
  return "3~5분";
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-[var(--color-apple-muted)]/40 border-t-[var(--color-apple-ink)]"
    />
  );
}

function FieldGroup({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex items-baseline gap-2">
        <h3 className="text-[11px] wght-700 tabular-nums uppercase text-[var(--color-apple-muted)]">
          {label}
        </h3>
        {hint && (
          <span className="text-[11px] wght-450 text-[var(--color-apple-muted)]">{hint}</span>
        )}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}
