import "server-only";
import { formatEventLabel } from "@/lib/format-event";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import { listWrongItems } from "./attempts";
import { type EventView, listUpcomingEvents } from "./events";
import { listCoursesGrouped } from "./materials";

type MaterialType = Database["public"]["Tables"]["materials"]["Row"]["type"];

export type RiskLevel = "safe" | "watch" | "danger";
export type SignalTone = "urgent" | "warn" | "calm";

export interface SafetySignal {
  id: string;
  tone: SignalTone;
  label: string;
  title: string;
  reason: string;
  evidence: string;
  href: string;
  cta: string;
}

export interface CourseRiskItem {
  courseId: string;
  courseName: string;
  color: string | null;
  professor: string | null;
  materialCount: number;
  risk: RiskLevel;
  score: number;
  reasons: string[];
  actionHref: string;
  actionLabel: string;
  counts: {
    unreadMaterials: number;
    wrongItems: number;
    upcomingChecks: number;
    unconfirmedEvents: number;
  };
}

export interface SemesterSafetySnapshot {
  signals: SafetySignal[];
  courseRisks: CourseRiskItem[];
  totals: {
    danger: number;
    watch: number;
    safe: number;
    unreadMaterials: number;
    wrongItems: number;
    upcomingChecks: number;
    unconfirmedEvents: number;
  };
}

interface MaterialRow {
  id: string;
  title: string;
  type: MaterialType;
  uploaded_at: string;
  /** summary_payload(jsonb)는 페치 비용이 커서 hasSummary boolean으로 좁힘 (P0 fix). */
  hasSummary: boolean;
  course_id: string | null;
}

export async function getSemesterSafetySnapshot(ownerId: string): Promise<SemesterSafetySnapshot> {
  const [grouped, upcoming, wrongItems, materials] = await Promise.all([
    listCoursesGrouped({ ownerId }),
    listUpcomingEvents({ ownerId, limit: 80 }),
    listWrongItems({ ownerId, sinceDays: 21, limit: 300 }),
    listRecentMaterials(ownerId),
  ]);

  const courses = [...grouped.semester, ...grouped.personal];
  const materialsByCourse = groupBy(materials, (m) => m.course_id ?? "__orphan__");
  const eventsByCourse = groupBy(upcoming, (event) => event.courseId ?? "__none__");
  const wrongByCourse = groupBy(wrongItems, (item) => item.courseId ?? "__none__");

  const courseRisks = courses
    .map((course): CourseRiskItem => {
      const courseMaterials = materialsByCourse.get(course.id) ?? [];
      const courseEvents = eventsByCourse.get(course.id) ?? [];
      const courseWrong = wrongByCourse.get(course.id) ?? [];
      const unreadMaterials = courseMaterials.filter((m) => !hasSummary(m)).length;
      const upcomingChecks = courseEvents
        .filter(isCriticalEvent)
        .filter((e) => daysUntil(e) <= 14).length;
      const unconfirmedEvents = courseEvents.filter(needsConfirmation).length;
      const wrongCount = courseWrong.length;

      let score = 0;
      const reasons: string[] = [];
      const nearestCritical = courseEvents.filter(isCriticalEvent).sort(byStartTime)[0] ?? null;
      if (nearestCritical) {
        const d = daysUntil(nearestCritical);
        if (d <= 1) score += 42;
        else if (d <= 3) score += 28;
        else if (d <= 7) score += 18;
        else if (d <= 14) score += 10;
        reasons.push(`${formatDday(d)} ${formatEventLabel(nearestCritical)}`);
      }
      if (unreadMaterials > 0) {
        score += Math.min(30, unreadMaterials * 7);
        reasons.push(`안 본 자료 ${unreadMaterials}개`);
      }
      if (wrongCount > 0) {
        score += Math.min(30, wrongCount * 5);
        reasons.push(`최근 오답 ${wrongCount}개`);
      }
      if (unconfirmedEvents > 0) {
        score += Math.min(18, unconfirmedEvents * 6);
        reasons.push(`확인 필요한 일정 ${unconfirmedEvents}개`);
      }

      const risk: RiskLevel = score >= 45 ? "danger" : score >= 15 ? "watch" : "safe";
      return {
        courseId: course.id,
        courseName: course.name,
        color: course.color,
        professor: course.professor,
        materialCount: course.materialCount,
        risk,
        score,
        reasons: reasons.length > 0 ? reasons.slice(0, 3) : ["놓친 신호 없음"],
        actionHref: `/dashboard/study/${encodeURIComponent(course.name)}`,
        actionLabel: risk === "safe" ? "자료 보기" : "지금 정리",
        counts: {
          unreadMaterials,
          wrongItems: wrongCount,
          upcomingChecks,
          unconfirmedEvents,
        },
      };
    })
    .sort((a, b) => b.score - a.score);

  const signals = buildSignals({ upcoming, materials, wrongCount: wrongItems.length });
  const totals = {
    danger: courseRisks.filter((c) => c.risk === "danger").length,
    watch: courseRisks.filter((c) => c.risk === "watch").length,
    safe: courseRisks.filter((c) => c.risk === "safe").length,
    unreadMaterials: materials.filter((m) => !hasSummary(m)).length,
    wrongItems: wrongItems.length,
    upcomingChecks: upcoming.filter(isCriticalEvent).filter((e) => daysUntil(e) <= 14).length,
    unconfirmedEvents: upcoming.filter(needsConfirmation).length,
  };

  return { signals, courseRisks, totals };
}

export async function getCourseSafetyDetail(ownerId: string, courseId: string) {
  const [upcoming, wrongItems, materials] = await Promise.all([
    listUpcomingEvents({ ownerId, limit: 80 }),
    listWrongItems({ ownerId, sinceDays: 21, limit: 300 }),
    listRecentMaterials(ownerId),
  ]);
  const courseEvents = upcoming.filter((event) => event.courseId === courseId);
  const courseWrong = wrongItems.filter((item) => item.courseId === courseId);
  const courseMaterials = materials.filter((material) => material.course_id === courseId);
  const unreadMaterials = courseMaterials.filter((m) => !hasSummary(m));
  const nextCritical = courseEvents.filter(isCriticalEvent).sort(byStartTime)[0] ?? null;
  const unconfirmedEvents = courseEvents.filter(needsConfirmation);

  let score = 0;
  const reasons: string[] = [];
  if (nextCritical) {
    const d = daysUntil(nextCritical);
    if (d <= 1) score += 42;
    else if (d <= 3) score += 28;
    else if (d <= 7) score += 18;
    else if (d <= 14) score += 10;
    reasons.push(`${formatDday(d)} ${formatEventLabel(nextCritical)}`);
  }
  if (unreadMaterials.length > 0) {
    score += Math.min(30, unreadMaterials.length * 7);
    reasons.push(`아직 정리 안 된 자료 ${unreadMaterials.length}개`);
  }
  if (courseWrong.length > 0) {
    score += Math.min(30, courseWrong.length * 5);
    reasons.push(`최근 오답 ${courseWrong.length}개`);
  }
  if (unconfirmedEvents.length > 0) {
    score += Math.min(18, unconfirmedEvents.length * 6);
    reasons.push(`확인 필요한 일정 ${unconfirmedEvents.length}개`);
  }

  return {
    risk: score >= 45 ? ("danger" as const) : score >= 15 ? ("watch" as const) : ("safe" as const),
    score,
    reasons: reasons.length > 0 ? reasons.slice(0, 4) : ["현재 크게 막힌 신호는 없어요"],
    nextCritical,
    unreadMaterials: unreadMaterials.slice(0, 4).map((m) => ({
      id: m.id,
      title: m.title,
      type: m.type,
      uploadedAt: m.uploaded_at,
    })),
    wrongCount: courseWrong.length,
    unconfirmedCount: unconfirmedEvents.length,
  };
}

async function listRecentMaterials(ownerId: string): Promise<MaterialRow[]> {
  const admin = getAdminSupabase();
  // P0: summary_payload(jsonb)는 매 dashboard 진입마다 200행 풀 페치되면 비용 큼.
  // 메타데이터 1회 + summary 있는 id 집합 1회로 분리 → jsonb 전송 0.
  const [metaRes, summaryIdRes] = await Promise.all([
    admin
      .from("materials")
      .select("id, title, type, uploaded_at, course_id")
      .eq("owner_id", ownerId)
      .neq("type", "syllabus")
      .order("uploaded_at", { ascending: false })
      .limit(200),
    admin
      .from("materials")
      .select("id")
      .eq("owner_id", ownerId)
      .neq("type", "syllabus")
      .not("summary_payload", "is", null)
      .order("uploaded_at", { ascending: false })
      .limit(200),
  ]);

  if (metaRes.error || !metaRes.data) return [];
  const summaryIds = new Set((summaryIdRes.data ?? []).map((r) => r.id));
  return metaRes.data.map((row) => ({
    id: row.id,
    title: row.title,
    type: row.type,
    uploaded_at: row.uploaded_at,
    hasSummary: summaryIds.has(row.id),
    course_id: row.course_id,
  }));
}

function buildSignals({
  upcoming,
  materials,
  wrongCount,
}: {
  upcoming: EventView[];
  materials: MaterialRow[];
  wrongCount: number;
}): SafetySignal[] {
  const signals: SafetySignal[] = [];
  const critical = upcoming.filter(isCriticalEvent).sort(byStartTime);

  for (const event of critical.slice(0, 6)) {
    const d = daysUntil(event);
    if (d > 7) continue;
    const isDueSoon = d <= 1;
    signals.push({
      id: `due:${event.id}`,
      tone: isDueSoon ? "urgent" : "warn",
      label: event.kind === "exam" ? "시험 대비" : "마감 위험",
      title: formatEventLabel(event),
      reason: `${formatDday(d)} · ${formatWhen(event)}`,
      evidence: event.notes
        ? `유의: ${event.notes}`
        : "유의: 제출 형식·범위·장소를 직접 확인하세요",
      href: "/dashboard/calendar",
      cta: "일정 확인",
    });
  }

  const unconfirmed = upcoming.find(needsConfirmation);
  if (unconfirmed) {
    signals.push({
      id: `confirm:${unconfirmed.id}`,
      tone: "warn",
      label: "확인 필요",
      title: formatEventLabel(unconfirmed),
      reason: unconfirmed.sourceMaterialTitle
        ? `${unconfirmed.sourceMaterialTitle}에서 찾은 일정`
        : "자료에서 찾은 일정",
      evidence:
        unconfirmed.confidence == null
          ? "근거를 확인하고 저장 상태를 봐야 해요"
          : `확신도 ${Math.round(unconfirmed.confidence * 100)}%`,
      href: "/dashboard/calendar",
      cta: "일정 확인",
    });
  }

  const unread = materials.find((m) => !hasSummary(m));
  if (unread) {
    signals.push({
      id: `material:${unread.id}`,
      tone: "calm",
      label: "자료 방치",
      title: unread.title,
      reason: "자료를 넣었지만 아직 학습 루프로 들어가지 않았어요",
      evidence: "요약을 읽고 문제로 점검해야 시험 전에 남습니다",
      href: "/dashboard/study",
      cta: "자료 정리",
    });
  }

  if (wrongCount > 0) {
    signals.push({
      id: "wrong-review",
      tone: wrongCount >= 5 ? "urgent" : "warn",
      label: "오답 복습",
      title: `다시 봐야 할 오답 ${wrongCount}개`,
      reason: "틀린 문제를 그대로 두면 시험 직전에 다시 틀릴 확률이 높아요",
      evidence: "새 공부보다 오답 재확인이 점수 방어에 더 빠릅니다",
      href: "/dashboard/review",
      cta: "오답만 보기",
    });
  }

  return signals.sort((a, b) => toneRank(b.tone) - toneRank(a.tone)).slice(0, 3);
}

function hasSummary(material: MaterialRow): boolean {
  return material.hasSummary;
}

function isCriticalEvent(event: EventView): boolean {
  return event.kind === "exam" || event.kind === "assignment" || event.kind === "presentation";
}

function needsConfirmation(event: EventView): boolean {
  return (
    !!event.sourceMaterialId &&
    (!event.confirmed || (event.confidence != null && event.confidence < 0.85))
  );
}

function daysUntil(event: EventView): number {
  return kstDayNumber(new Date(event.startsAt)) - kstDayNumber(new Date());
}

function byStartTime(a: EventView, b: EventView): number {
  return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
}

function formatDday(days: number): string {
  if (days === 0) return "오늘";
  if (days < 0) return `D+${Math.abs(days)}`;
  return `D-${days}`;
}

function formatWhen(event: EventView): string {
  const date = toKstDate(event.startsAt);
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  if (event.allDay) return `${month}/${day}`;
  return `${month}/${day} ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

function toKstDate(iso: string): Date {
  return new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
}

function kstDayNumber(date: Date): number {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return Math.floor(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) / 86400000);
}

function toneRank(tone: SignalTone): number {
  if (tone === "urgent") return 3;
  if (tone === "warn") return 2;
  return 1;
}

function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}
