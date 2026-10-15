"use client";

import { ArrowUpRight, Check, Clock3, Pause, Play, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { addDaysToDateKey, dateKeyToDayNumber, kstDateKey } from "@/lib/kst";
import {
  type ScheduledStudyTask,
  STUDY_SCOPE_MAX,
  type StudyAction,
  type StudyCatalog,
  type StudyPlan,
  type StudyWorkspace,
  scheduleStudyTasks,
  studyTaskHref,
} from "@/lib/study-plan";
import s from "./study-workspace.module.css";

type Loaded = { workspace: StudyWorkspace; catalog: StudyCatalog };
type Mutation = StudyAction extends infer A
  ? A extends StudyAction
    ? Omit<A, "revision">
    : never
  : never;

export function StudyWorkspacePanel({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [removeId, setRemoveId] = useState<string | null>(null);
  const focusRef = useRef<HTMLDivElement>(null);
  const today = kstDateKey(new Date());

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch("/api/study-plans", { cache: "no-store", signal });
      const result = await response.json();
      if (!response.ok || !result.ok)
        throw new Error(result.error || "공부 계획을 불러오지 못했어요.");
      if (!signal?.aborted) {
        setData(result);
        setError(null);
      }
    } catch (e) {
      if (!signal?.aborted)
        setError(e instanceof Error ? e.message : "연결을 확인하고 다시 시도해주세요.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function mutate(action: Mutation): Promise<boolean> {
    if (!data || busy) return false;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/study-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...action, revision: data.workspace.revision }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        if (response.status === 409) await load();
        throw new Error(result.error || "계획을 저장하지 못했어요.");
      }
      setData((prior) => (prior ? { ...prior, workspace: result.workspace } : prior));
      setAnnouncement(
        action.action === "defer"
          ? "내일부터 할 수 있도록 남은 공부를 다시 배치했어요."
          : action.action === "budget"
            ? "남은 공부를 새 하루 시간에 맞춰 다시 배치했어요."
            : action.action === "complete"
              ? "완료 기록을 저장했어요."
              : "공부 계획을 저장했어요.",
      );
      return true;
    } catch (e) {
      setError(
        e instanceof TypeError || e instanceof SyntaxError
          ? "연결을 확인하고 다시 시도해주세요. 입력한 내용은 유지했어요."
          : e instanceof Error
            ? e.message
            : "연결을 확인하고 다시 시도해주세요.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  const scheduled = data ? scheduleStudyTasks(data.workspace, today) : [];
  const todayTasks = scheduled.filter(
    (item) => item.date === today && item.task.status === "pending",
  );
  const overflow = scheduled.filter((item) => item.date === null && item.task.status === "pending");
  const activePlans = data?.workspace.plans.filter((plan) => !plan.archived) ?? [];
  const focus = scheduled.find(
    (item) => item.task.id === focusId && item.task.status === "pending",
  );
  const doneToday = scheduled.filter((item) => item.date === today && item.task.status === "done");

  if (loading && !data)
    return (
      <div className={s.loading} role="status">
        오늘의 공부를 불러오는 중이에요…
      </div>
    );
  return (
    <section className={s.workspace} aria-label="공부 실행 계획">
      <div className={s.heading}>
        <div>
          <p className={s.eyebrow}>시간을 정하면, 오늘 할 일이 보입니다</p>
          <h2>오늘의 공부</h2>
        </div>
        {compact && (
          <Link href="/dashboard/study/plans">
            시험 준비실 <ArrowUpRight size={15} aria-hidden />
          </Link>
        )}
      </div>
      {error && (
        <div className={s.error} role="alert">
          <p>{error}</p>
          <button type="button" disabled={busy || loading} onClick={() => void load()}>
            다시 불러오기
          </button>
        </div>
      )}
      <p className={s.live} role="status">
        {announcement}
      </p>
      {data && (
        <>
          <div className={s.budget}>
            <label htmlFor={compact ? "today-study-budget" : "study-budget"}>하루 공부 시간</label>
            <select
              id={compact ? "today-study-budget" : "study-budget"}
              value={data.workspace.dailyMinutes}
              disabled={busy}
              onChange={(event) =>
                void mutate({ action: "budget", dailyMinutes: Number(event.target.value) })
              }
            >
              {[15, 30, 45, 60, 90, 120, 180].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes}분
                </option>
              ))}
            </select>
            <span>진행 중인 모든 시험이 이 시간을 나눠 써요</span>
          </div>
          {data.catalog.dueReview.quizId && (
            <Link
              className={s.quickReview}
              href={`/dashboard/quiz/${data.catalog.dueReview.quizId}/review?limit=5`}
            >
              <RotateCcw size={19} aria-hidden />
              <div>
                <strong>최대 5문제 빠른 복습</strong>
                <span>오늘 복습할 문제 {data.catalog.dueReview.count}개 중 한 묶음부터</span>
              </div>
              <ArrowUpRight size={17} aria-hidden />
            </Link>
          )}
          {focus && (
            <div ref={focusRef}>
              <FocusSession
                key={focus.task.id}
                item={focus}
                busy={busy}
                onClose={() => setFocusId(null)}
                onComplete={async (reflection) => {
                  if (
                    await mutate({
                      action: "complete",
                      planId: focus.plan.id,
                      taskId: focus.task.id,
                      reflection,
                    })
                  )
                    setFocusId(null);
                }}
              />
            </div>
          )}
          {todayTasks.length ? (
            <ol className={s.tasks}>
              {todayTasks.map((item) => (
                <li key={item.task.id}>
                  <div className={s.taskMeta}>
                    <span>{item.plan.title}</span>
                    <span>{item.task.minutes}분</span>
                  </div>
                  <h3>{item.task.title}</h3>
                  <div className={s.taskActions}>
                    <button
                      type="button"
                      className={s.primary}
                      disabled={busy}
                      onClick={() => {
                        setFocusId(item.task.id);
                        requestAnimationFrame(() =>
                          focusRef.current?.scrollIntoView({ block: "nearest" }),
                        );
                      }}
                    >
                      <Play size={14} aria-hidden /> 집중 시작
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void mutate({
                          action: "complete",
                          planId: item.plan.id,
                          taskId: item.task.id,
                        })
                      }
                    >
                      완료
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void mutate({ action: "defer", planId: item.plan.id, taskId: item.task.id })
                      }
                    >
                      내일로
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          ) : compact || activePlans.length > 0 ? (
            <div className={s.empty}>
              <h3>
                {activePlans.length
                  ? doneToday.length
                    ? "오늘 배치된 공부를 마쳤어요"
                    : "오늘 배치된 공부가 없어요"
                  : "첫 시험의 준비 계획을 만들어보세요"}
              </h3>
              <p>
                {activePlans.length
                  ? "다가오는 작업과 기한 안에 배치되지 않은 분량도 아래에서 확인하세요."
                  : "과목, 시험 날짜, 자료를 고르면 원문 확인부터 문제 점검까지 이어집니다."}
              </p>
            </div>
          ) : null}
          {doneToday.length > 0 && (
            <details className={s.completed}>
              <summary>
                <Check size={15} aria-hidden /> 오늘 완료한 공부 {doneToday.length}개
              </summary>
              {doneToday.map((item) => (
                <div key={item.task.id}>
                  <span>
                    {item.task.title}
                    {item.task.reflection && (
                      <small className={s.reflection}>{item.task.reflection}</small>
                    )}
                  </span>
                  <button
                    type="button"
                    disabled={busy || item.plan.archived}
                    onClick={() =>
                      void mutate({ action: "undo", planId: item.plan.id, taskId: item.task.id })
                    }
                  >
                    완료 취소
                  </button>
                </div>
              ))}
            </details>
          )}
          {overflow.length > 0 && (
            <div className={s.warning} role="status">
              <strong>
                목표일까지 배치하지 못한 공부{" "}
                {overflow.reduce((sum, item) => sum + item.task.minutes, 0)}분
              </strong>
              <p>
                하루 시간을 늘리거나 시험 범위를 다시 확인하세요. 지나간 목표일의 남은 공부도 여기에
                포함돼요.
              </p>
            </div>
          )}
          {!compact && (
            <>
              <div className={s.heading}>
                <h2>준비 중인 시험</h2>
                <button type="button" disabled={busy} onClick={() => setShowForm((open) => !open)}>
                  {showForm ? "입력 닫기" : "시험 계획 추가"}
                </button>
              </div>
              {(showForm || activePlans.length === 0) && (
                <PlanForm
                  catalog={data.catalog}
                  busy={busy}
                  onCreate={async (action) => {
                    const ok = await mutate(action);
                    if (ok) setShowForm(false);
                    return ok;
                  }}
                />
              )}
              <div className={s.plans}>
                {activePlans.map((plan) => (
                  <PlanSummary
                    key={plan.id}
                    plan={plan}
                    scheduled={scheduled}
                    today={today}
                    busy={busy}
                    onArchive={() => void mutate({ action: "archive", planId: plan.id })}
                  />
                ))}
              </div>
              {data.workspace.plans.some((plan) => plan.archived) && (
                <details className={s.completed}>
                  <summary>보관한 시험 계획</summary>
                  {data.workspace.plans
                    .filter((plan) => plan.archived)
                    .map((plan) => (
                      <div key={plan.id}>
                        <span>{plan.title}</span>
                        <span>
                          {plan.tasks.filter((task) => task.status === "done").length}/
                          {plan.tasks.length} 작업 완료
                        </span>
                        {removeId === plan.id ? (
                          <span>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                if (await mutate({ action: "remove", planId: plan.id }))
                                  setRemoveId(null);
                              }}
                            >
                              이 계획과 완료 기록 삭제 확인
                            </button>
                            <button type="button" disabled={busy} onClick={() => setRemoveId(null)}>
                              취소
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setRemoveId(plan.id)}
                          >
                            기록 삭제
                          </button>
                        )}
                      </div>
                    ))}
                </details>
              )}
            </>
          )}
          <p className={s.note}>
            작업 시간은 기본 분량이며 이해도나 예상 점수를 뜻하지 않아요. 목표일 당일의 시험 시작
            시각과 실제 공부 가능한 시간은 직접 확인해주세요.
          </p>
        </>
      )}
    </section>
  );
}

function PlanForm({
  catalog,
  busy,
  onCreate,
}: {
  catalog: StudyCatalog;
  busy: boolean;
  onCreate: (action: Extract<Mutation, { action: "create" }>) => Promise<boolean>;
}) {
  const [courseId, setCourseId] = useState(catalog.courses[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(addDaysToDateKey(kstDateKey(new Date()), 7));
  const [scope, setScope] = useState("");
  const [eventId, setEventId] = useState<string | null>(null);
  const [materialIds, setMaterialIds] = useState<string[]>([]);
  const materials = catalog.materials.filter((material) => material.courseId === courseId);
  const events = catalog.events.filter((event) => event.courseId === courseId);
  if (!catalog.courses.length)
    return (
      <div className={s.empty}>
        <p>먼저 과목과 강의자료를 준비해주세요.</p>
        <Link href="/dashboard/study">
          내 과목 열기 <ArrowUpRight size={14} aria-hidden />
        </Link>
      </div>
    );
  return (
    <form
      className={s.form}
      onSubmit={async (event) => {
        event.preventDefault();
        if (
          await onCreate({
            action: "create",
            courseId,
            title,
            targetDate: date,
            scope,
            materialIds,
            eventId,
          })
        ) {
          setTitle("");
          setScope("");
          setMaterialIds([]);
          setEventId(null);
        }
      }}
    >
      <div className={s.fields}>
        <label>
          과목
          <select
            value={courseId}
            disabled={busy}
            onChange={(event) => {
              setCourseId(event.target.value);
              setMaterialIds([]);
              setEventId(null);
            }}
          >
            {catalog.courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          등록된 시험
          <select
            value={eventId ?? ""}
            disabled={busy}
            onChange={(event) => {
              const exam = events.find((item) => item.id === event.target.value);
              setEventId(exam?.id ?? null);
              if (exam) {
                setTitle(exam.title);
                setDate(exam.date);
                setScope(exam.notes.length <= STUDY_SCOPE_MAX ? exam.notes : "");
              }
            }}
          >
            <option value="">날짜 직접 정하기</option>
            {events.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.title} · {exam.date}
              </option>
            ))}
          </select>
        </label>
        <label>
          시험 이름
          <input
            required
            maxLength={120}
            placeholder="예: 자료구조 중간고사"
            value={title}
            disabled={busy}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label>
          목표 날짜
          <input
            type="date"
            required
            min={kstDateKey(new Date())}
            max={addDaysToDateKey(kstDateKey(new Date()), 90)}
            value={date}
            disabled={busy || Boolean(eventId)}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
      </div>
      <label>
        시험 범위와 제외할 부분 · 최대 200자
        <textarea
          rows={3}
          maxLength={STUDY_SCOPE_MAX}
          placeholder="예: 3~7주차, 5주차 부록 제외. 교수님 공지에서 확인한 범위를 적어주세요."
          value={scope}
          disabled={busy}
          onChange={(event) => setScope(event.target.value)}
        />
      </label>
      {eventId && events.find((exam) => exam.id === eventId)?.notes && (
        <details className={s.completed}>
          <summary>등록된 시험 일정의 메모 확인</summary>
          <p className={s.scope}>{events.find((exam) => exam.id === eventId)?.notes}</p>
          <p className={s.note}>
            공지에서 확인한 출제 범위와 제외 부분을 위 입력칸에 200자 안으로 정리해주세요.
          </p>
        </details>
      )}
      <fieldset>
        <legend>함께 공부할 강의자료 · 최대 6개</legend>
        {materials.length ? (
          materials.map((material) => (
            <label className={s.material} key={material.id}>
              <input
                type="checkbox"
                checked={materialIds.includes(material.id)}
                disabled={busy || (materialIds.length >= 6 && !materialIds.includes(material.id))}
                onChange={(event) =>
                  setMaterialIds((ids) =>
                    event.target.checked
                      ? [...ids, material.id]
                      : ids.filter((id) => id !== material.id),
                  )
                }
              />
              {material.title}
            </label>
          ))
        ) : (
          <p>
            이 과목의 강의자료가 없어요. <Link href="/dashboard/study">자료 추가하기</Link>
          </p>
        )}
      </fieldset>
      <button type="submit" className={s.primary} disabled={busy || materialIds.length === 0}>
        {busy ? "저장 중…" : "시험 준비 계획 만들기"}
      </button>
    </form>
  );
}

function PlanSummary({
  plan,
  scheduled,
  today,
  busy,
  onArchive,
}: {
  plan: StudyPlan;
  scheduled: ScheduledStudyTask[];
  today: string;
  busy: boolean;
  onArchive: () => void;
}) {
  const items = scheduled.filter((item) => item.plan.id === plan.id);
  const completed = plan.tasks.filter((task) => task.status === "done").length;
  const days = dateKeyToDayNumber(plan.targetDate) - dateKeyToDayNumber(today);
  return (
    <article className={s.plan}>
      <div className={s.taskMeta}>
        <span>{days < 0 ? "목표일 지남" : days === 0 ? "목표일 오늘" : `D-${days}`}</span>
        <span>
          {completed}/{plan.tasks.length} 작업 완료
        </span>
      </div>
      <h3>{plan.title}</h3>
      <p className={s.scope}>
        {plan.scope || "범위를 별도로 적지 않았어요. 자료와 교수님 공지를 확인해주세요."}
      </p>
      <progress value={completed} max={plan.tasks.length} aria-label={`${plan.title} 작업 완료`} />
      <details>
        <summary>남은 공부와 날짜 보기</summary>
        <ul className={s.schedule}>
          {items
            .filter((item) => item.task.status === "pending")
            .map((item) => (
              <li key={item.task.id}>
                <span>{item.date ?? "시간 부족"}</span>
                <div>
                  {item.task.title}
                  <small>{item.task.minutes}분</small>
                </div>
                <Link href={studyTaskHref(plan, item.task)} aria-label={`${item.task.title} 열기`}>
                  <ArrowUpRight size={16} aria-hidden />
                </Link>
              </li>
            ))}
        </ul>
        {completed === plan.tasks.length && (
          <p>계획의 모든 작업을 마쳤어요. 실제 시험 범위와 이해도는 마지막으로 확인해주세요.</p>
        )}
      </details>
      {completed > 0 && (
        <details>
          <summary>완료 기록과 다시 볼 개념</summary>
          <ul className={s.schedule}>
            {plan.tasks
              .filter((task) => task.status === "done")
              .map((task) => (
                <li key={task.id}>
                  <span>{task.completedAt ? kstDateKey(task.completedAt) : "완료"}</span>
                  <div>
                    {task.title}
                    {task.reflection && <small>{task.reflection}</small>}
                  </div>
                </li>
              ))}
          </ul>
        </details>
      )}
      <button type="button" className={s.archive} disabled={busy} onClick={onArchive}>
        계획 보관
      </button>
    </article>
  );
}

function FocusSession({
  item,
  busy,
  onClose,
  onComplete,
}: {
  item: ScheduledStudyTask;
  busy: boolean;
  onClose: () => void;
  onComplete: (reflection: string) => Promise<void>;
}) {
  const total = item.task.minutes * 60;
  const [remaining, setRemaining] = useState(total);
  const [running, setRunning] = useState(false);
  const [reflection, setReflection] = useState("");
  const endAt = useRef(0);
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds === 0) setRunning(false);
    };
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [running]);
  const toggle = () => {
    if (running) {
      setRemaining(Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000)));
      setRunning(false);
    } else {
      endAt.current = Date.now() + remaining * 1000;
      setRunning(true);
    }
  };
  return (
    <section className={s.focus} aria-label="집중 공부">
      <div className={s.heading}>
        <span className={s.eyebrow}>{item.plan.title}</span>
        <button type="button" onClick={onClose}>
          닫기
        </button>
      </div>
      <h3>{item.task.title}</h3>
      <p className={s.scope}>{item.plan.scope || "교수님 공지와 자료의 시험 범위를 확인하세요."}</p>
      <div className={s.timer}>
        <Clock3 size={24} aria-hidden />
        <span role="timer" aria-label="남은 집중 시간">
          {String(Math.floor(remaining / 60)).padStart(2, "0")}:
          {String(remaining % 60).padStart(2, "0")}
        </span>
        <button type="button" disabled={remaining === 0} onClick={toggle}>
          {running ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
          {running ? "일시정지" : "타이머 시작"}
        </button>
        <button
          type="button"
          onClick={() => {
            setRunning(false);
            setRemaining(total);
          }}
        >
          다시 시작
        </button>
      </div>
      {remaining === 0 && <p role="status">시간이 끝났어요. 공부를 마쳤다면 직접 완료해주세요.</p>}
      <Link
        className={s.source}
        href={studyTaskHref(item.plan, item.task)}
        target="_blank"
        rel="noopener noreferrer"
      >
        {item.task.kind === "practice" ? "범위를 확인하고 문제 만들기" : "새 탭에서 자료 열기"}
        <ArrowUpRight size={16} aria-hidden />
      </Link>
      <label>
        다음에 다시 볼 개념
        <textarea
          rows={2}
          maxLength={300}
          value={reflection}
          placeholder="예: 이진 탐색과 선형 탐색의 조건 차이"
          onChange={(event) => setReflection(event.target.value)}
        />
      </label>
      <button
        type="button"
        className={s.primary}
        disabled={busy}
        onClick={() => void onComplete(reflection)}
      >
        공부 완료하고 기록
      </button>
    </section>
  );
}
