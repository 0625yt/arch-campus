import Link from "next/link";
import { redirect } from "next/navigation";
import { AppleEmptyState } from "@/components/apple-empty";
import { AppleShell } from "@/components/apple-shell";
import { tryGetOwnerId } from "@/lib/auth";
import { listWrongItems, type WrongItem } from "@/lib/data/attempts";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * 오답 복습 큐 — 누적된 오답을 퀴즈 단위로 묶어 복습 동선을 단일 화면에 모은다.
 *
 * 학습 루프(PRODUCT.md 기능 1)의 "오답 누적" 단계.
 * Today 카드·사이드바·시험 직전 모두 이 페이지로 들어와 다시 풀게 만든다.
 *
 * 정책:
 *   - 14일 vs 60일 두 탭은 다음 회차. 우선 60일(학기 기준)로 시작.
 *   - 같은 퀴즈에서 같은 문제를 여러 번 틀렸어도 그룹 카드에선 오답 수만 표시.
 *   - 각 카드 CTA는 "이 퀴즈 오답 N개 다시 풀기" → /dashboard/quiz/{id}/wrong
 */
export default async function ReviewPage() {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  const items = await listWrongItems({ ownerId, sinceDays: 60, limit: 200 });
  const groupsRaw = groupByQuiz(items);
  // 자료 상세 라우팅에 강의명 슬러그가 필요 — courseId 모아 한 번에 fetch (N+1 회피).
  // 종전: groupByQuiz가 courseName을 못 받아 ReviewCard에서 "자료" 하드코딩 → breadcrumb 깨짐.
  const courseIds = Array.from(
    new Set(groupsRaw.map((g) => g.courseId).filter((id): id is string => id !== null)),
  );
  const courseNameById = new Map<string, string>();
  if (courseIds.length > 0) {
    const admin = getAdminSupabase();
    const { data: courses } = await admin
      .from("courses")
      .select("id, name")
      .eq("owner_id", ownerId)
      .in("id", courseIds);
    for (const c of courses ?? []) courseNameById.set(c.id, c.name);
  }
  const groups = groupsRaw.map((g) => ({
    ...g,
    courseName: g.courseId ? (courseNameById.get(g.courseId) ?? null) : null,
  }));
  const weakTopics = computeWeakTopics(items);
  const totalWrong = items.length;
  const uniqueQuestions = new Set(items.map((i) => `${i.quizId}:${i.questionId}`)).size;

  return (
    <div>
      <AppleShell>
        <header className="fade-up flex items-baseline justify-between gap-3">
          <p
            className="text-[12px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            복습
          </p>
          <Link
            href="/dashboard"
            className="text-[12px] wght-450 text-[var(--color-apple-action)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            오늘 ›
          </Link>
        </header>

        <header className="mt-6 fade-up fade-up-1 sm:mt-8">
          <h1
            className="text-[28px] leading-[1.08] wght-700 text-[var(--color-apple-ink)] sm:text-[36px] md:text-[42px]"
            style={{ letterSpacing: "-0.022em" }}
          >
            오답 <span className="text-[var(--color-apple-muted)]">복습</span>
          </h1>
          <p
            className="mt-3 text-[13.5px] leading-[1.55] wght-450 text-[var(--color-apple-muted)] sm:text-[14.5px]"
            style={{ letterSpacing: "-0.012em" }}
          >
            최근 60일 틀린 {uniqueQuestions}문제 · 자주 틀린 자료부터
          </p>
        </header>

        {groups.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* 약점 단원 — 학생이 어디부터 다시 봐야 하는지 1차 신호.
                3개 이상 있을 때만 의미 있음 (1~2개면 통계로서 약함) */}
            {weakTopics.length >= 3 && (
              <section className="mt-6 fade-up fade-up-2 sm:mt-8">
                <h2
                  className="text-[14px] wght-620 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]"
                  style={{ letterSpacing: "0.06em" }}
                >
                  이번 학기 약점
                </h2>
                <p
                  className="mt-2 text-[13px] wght-450 text-[var(--color-apple-muted)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  같은 단원에서 반복해 틀린 문제예요. 자료를 다시 한 번 훑어보세요.
                </p>
                <ul className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {weakTopics.slice(0, 6).map((t) => (
                    <WeakTopicCard key={t.topic} topic={t} />
                  ))}
                </ul>
              </section>
            )}

            <section className="mt-6 fade-up fade-up-2 sm:mt-8">
              <h2
                className="text-[14px] wght-620 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]"
                style={{ letterSpacing: "0.06em" }}
              >
                자료별 오답
              </h2>
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {groups.map((g) => (
                  <ReviewCard key={g.quizId} group={g} />
                ))}
              </div>
            </section>
          </>
        )}

        {totalWrong > 0 && (
          <footer
            className="mt-14 text-[11.5px] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            오답 풀이도 학습 보조이며, 본인이 다시 풀고 검토해야 학습이 완성됩니다
          </footer>
        )}
      </AppleShell>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-16 fade-up fade-up-2">
      <AppleEmptyState
        eyebrow="복습 큐"
        eyebrowColor="var(--color-apple-success)"
        size="md"
        title="지금 복습할 오답이 없어요"
        sub="퀴즈를 풀고 틀린 문제가 생기면 여기로 모입니다"
        ctaPrimary={{ href: "/dashboard/study", label: "자료에서 문제 만들기 →", tone: "primary" }}
      />
    </div>
  );
}

interface QuizGroup {
  quizId: string;
  quizTitle: string;
  materialId: string | null;
  /** 자료 상세 페이지 라우팅(`/dashboard/study/[course]/[material]`)에 강의명 슬러그가 필요. */
  courseId: string | null;
  courseName: string | null;
  wrongCount: number;
  uniqueQuestionCount: number;
  lastAttemptedAt: string;
  topicSamples: string[];
}

function groupByQuiz(items: WrongItem[]): QuizGroup[] {
  const map = new Map<string, QuizGroup & { questionIds: Set<number>; topics: Set<string> }>();
  for (const it of items) {
    const cur = map.get(it.quizId);
    if (cur) {
      cur.wrongCount++;
      cur.questionIds.add(it.questionId);
      if (it.attemptedAt > cur.lastAttemptedAt) cur.lastAttemptedAt = it.attemptedAt;
    } else {
      map.set(it.quizId, {
        quizId: it.quizId,
        quizTitle: it.quizTitle,
        materialId: it.materialId,
        courseId: it.courseId,
        courseName: null, // 본체에서 한 번에 채움
        wrongCount: 1,
        uniqueQuestionCount: 0,
        lastAttemptedAt: it.attemptedAt,
        topicSamples: [],
        questionIds: new Set([it.questionId]),
        topics: new Set(),
      });
    }
  }
  return Array.from(map.values())
    .map((g) => ({
      ...g,
      uniqueQuestionCount: g.questionIds.size,
    }))
    .sort((a, b) => b.uniqueQuestionCount - a.uniqueQuestionCount);
}

/**
 * 오답 그룹 카드 — 캘린더 EventChip + Inspector 톤을 가져옴.
 *
 *  - 좌측 2.5px coral bar (DESIGN §10: 동그라미 점 금지, 얇은 bar는 허용)
 *  - 한 줄 헤드라인 "오답 {N}문제 · {N일 전}" coral 텍스트
 *  - 큰 제목 (Apple Inspector h3 자리)
 *  - hover lift + 우상단 radial wash (tools ToolCard 톤)
 */
function ReviewCard({ group }: { group: QuizGroup }) {
  const days = daysSince(group.lastAttemptedAt);
  const timeLabel = days === 0 ? "오늘" : `${days}일 전`;

  return (
    <article
      className="group card-glow-ribbon elev-hover-2 relative flex h-full flex-col overflow-hidden rounded-[16px] bg-white p-6"
      style={{ ["--ribbon-color" as string]: "var(--color-urgent)" }}
    >
      {/* hover 우상단 미세 컬러 워시 — coral tint */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(160px at 100% 0%, color-mix(in oklab, var(--color-urgent) 14%, transparent), transparent 70%)",
        }}
      />

      {/* 헤드라인 1줄 — coral 톤. 정보 위계 (캘린더 Inspector와 동일 패턴) */}
      <p
        className="relative text-[12px] wght-620 tabular-nums text-[var(--color-urgent)]"
        style={{ letterSpacing: "-0.006em" }}
      >
        오답 {group.uniqueQuestionCount}문제{" "}
        <span className="text-[var(--color-apple-muted)] wght-450">· {timeLabel}</span>
      </p>

      <h2
        className="relative mt-2 text-[18px] leading-[1.3] wght-700 text-[var(--color-apple-ink)]"
        style={{ letterSpacing: "-0.018em" }}
      >
        {group.quizTitle}
      </h2>

      <div className="relative mt-auto flex gap-2 pt-6">
        <Link
          href={`/dashboard/quiz/${group.quizId}/wrong`}
          className="inline-flex h-[38px] flex-1 items-center justify-center rounded-full bg-[var(--color-urgent)] px-4 text-[13px] wght-620 text-white transition-all hover:brightness-105"
          style={{ letterSpacing: "-0.012em" }}
        >
          오답 다시 풀기
        </Link>
        {group.materialId && (
          <Link
            // courseName이 있으면 슬러그로 사용 — 자료 상세 페이지 breadcrumb이 옳게 뜸.
            // courseName이 null이면 "자료"로 fallback (개인 자료·강의 미연결 케이스).
            href={`/dashboard/study/${encodeURIComponent(group.courseName ?? "자료")}/${group.materialId}`}
            className="inline-flex h-[38px] items-center justify-center rounded-full px-3.5 text-[12.5px] wght-450 text-[var(--color-apple-muted)] transition-colors hover:bg-[var(--color-apple-pearl)] hover:text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            자료
          </Link>
        )}
      </div>
    </article>
  );
}

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

/**
 * 단원별 약점 통계 — 같은 topic을 여러 자료에서 반복해 틀렸을 때를 잡기 위함.
 *
 * 카운팅 규칙:
 *   - 같은 quizId + questionId 조합은 한 번만 (재시도로 인한 중복 제거)
 *   - topic null은 "기타"로 묶지 않고 통계에서 제외 — 의미 없는 그룹
 *   - 정렬: 틀린 문제 수 ↓, 동률이면 가장 최근 attempt 우선
 */
interface WeakTopic {
  topic: string;
  uniqueQuestionCount: number;
  /** 이 topic이 등장한 quiz 종류 수 — 자료 여러 개에 걸친 진짜 약점인지의 신호 */
  quizCount: number;
  /** 가장 최근 attempt — "최근에도 또 틀렸다"는 신호 */
  lastAttemptedAt: string;
  /** 클릭 시 이동할 첫 자료 (가장 최근 오답 자료) */
  sampleMaterialId: string | null;
  sampleQuizId: string;
}

function computeWeakTopics(items: WrongItem[]): WeakTopic[] {
  // (topic) → { questionKeys: Set, quizIds: Set, last, lastMaterial, lastQuizId }
  const map = new Map<
    string,
    {
      topic: string;
      questionKeys: Set<string>;
      quizIds: Set<string>;
      lastAttemptedAt: string;
      sampleMaterialId: string | null;
      sampleQuizId: string;
    }
  >();
  for (const it of items) {
    if (!it.topic || it.topic.trim().length === 0) continue;
    const key = it.topic.trim();
    const existing = map.get(key);
    if (existing) {
      existing.questionKeys.add(`${it.quizId}:${it.questionId}`);
      existing.quizIds.add(it.quizId);
      if (it.attemptedAt > existing.lastAttemptedAt) {
        existing.lastAttemptedAt = it.attemptedAt;
        existing.sampleMaterialId = it.materialId;
        existing.sampleQuizId = it.quizId;
      }
    } else {
      map.set(key, {
        topic: key,
        questionKeys: new Set([`${it.quizId}:${it.questionId}`]),
        quizIds: new Set([it.quizId]),
        lastAttemptedAt: it.attemptedAt,
        sampleMaterialId: it.materialId,
        sampleQuizId: it.quizId,
      });
    }
  }
  return (
    Array.from(map.values())
      .map((g) => ({
        topic: g.topic,
        uniqueQuestionCount: g.questionKeys.size,
        quizCount: g.quizIds.size,
        lastAttemptedAt: g.lastAttemptedAt,
        sampleMaterialId: g.sampleMaterialId,
        sampleQuizId: g.sampleQuizId,
      }))
      // 같은 단원에서 1번만 틀린 건 통계로 약함 — 2번 이상만 노출
      .filter((t) => t.uniqueQuestionCount >= 2)
      .sort((a, b) => {
        if (b.uniqueQuestionCount !== a.uniqueQuestionCount) {
          return b.uniqueQuestionCount - a.uniqueQuestionCount;
        }
        return a.lastAttemptedAt < b.lastAttemptedAt ? 1 : -1;
      })
  );
}

/**
 * 약점 단원 카드 — 자료 카드보다 한 단계 작은 톤(섹션 제목이 더 위계 높음).
 * 클릭하면 가장 최근에 틀린 그 자료/퀴즈의 오답 풀이로 이동.
 */
function WeakTopicCard({ topic }: { topic: WeakTopic }) {
  return (
    <li>
      <Link
        href={`/dashboard/quiz/${topic.sampleQuizId}/wrong`}
        className="group flex h-full items-start justify-between gap-3 rounded-[14px] bg-white p-4 transition-all hover:-translate-y-px hover:shadow-[0_4px_16px_-8px_rgba(0,0,0,0.12)]"
      >
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-[14px] wght-620 text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {topic.topic}
          </p>
          <p
            className="mt-1 text-[11.5px] wght-450 tabular-nums text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.006em" }}
          >
            {topic.uniqueQuestionCount}문제
            {topic.quizCount > 1 ? ` · ${topic.quizCount}개 자료` : ""}
          </p>
        </div>
        <span
          className="shrink-0 rounded-full bg-[var(--color-urgent)]/10 px-2 py-0.5 text-[10.5px] wght-700 tabular-nums text-[var(--color-urgent)]"
          aria-hidden
        >
          {topic.uniqueQuestionCount}
        </span>
      </Link>
    </li>
  );
}
