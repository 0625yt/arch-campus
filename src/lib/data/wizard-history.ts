import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";

/**
 * 위저드별 이전 결과 — 각 위저드 페이지 상단의 history strip이 사용.
 *
 * generations 테이블의 status="ok" row 중 해당 tool 값만.
 * 결과 페이지로 가는 href는 /dashboard/history/[gid].
 */

export interface WizardHistoryItem {
  id: string;
  /** 사용자 입력 요약 (위저드별로 의미 다름) — 카드의 메인 라벨 */
  title: string;
  /** 한 줄 부가 정보 — "10분 · 동기" 같이 */
  detail: string | null;
  createdAt: string;
  href: string;
}

interface GenerationRow {
  id: string;
  tool: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

/**
 * 한 사용자의 한 tool 최근 결과 N건. status=ok만.
 */
export async function listWizardHistory(opts: {
  ownerId: string;
  tool: string;
  limit?: number;
}): Promise<WizardHistoryItem[]> {
  const limit = opts.limit ?? 6;
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from("generations")
    .select("id, tool, payload, created_at")
    .eq("owner_id", opts.ownerId)
    .eq("tool", opts.tool)
    .eq("status", "ok")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return (data as unknown as GenerationRow[]).map((row) => ({
    id: row.id,
    title: titleFor(row),
    detail: detailFor(row),
    createdAt: row.created_at,
    href: `/dashboard/history/${row.id}`,
  }));
}

function titleFor(row: GenerationRow): string {
  const p = row.payload ?? {};
  if (row.tool === "presentation") {
    const topic = typeof p.topic === "string" ? p.topic : null;
    if (topic) return topic;
  }
  if (row.tool === "wizard-cram") {
    const subject = typeof p.subject === "string" ? p.subject : null;
    if (subject) return subject;
  }
  if (row.tool === "report-checklist" || row.tool === "wizard-assignment") {
    const t = typeof p.assignmentTitle === "string" ? p.assignmentTitle : null;
    if (t) return t;
  }
  if (row.tool === "report-structure") {
    const topic = typeof p.topic === "string" ? p.topic : null;
    if (topic) return topic;
  }
  return "(제목 없음)";
}

function detailFor(row: GenerationRow): string | null {
  const p = row.payload ?? {};
  if (row.tool === "presentation") {
    const audience = typeof p.audience === "string" ? p.audience : null;
    const duration = typeof p.durationMin === "number" ? p.durationMin : null;
    if (audience && duration) return `${duration}분 · 청중 ${audience}`;
  }
  if (row.tool === "wizard-cram") {
    const remaining = typeof p.remainingMin === "number" ? p.remainingMin : null;
    if (remaining) {
      const h = Math.floor(remaining / 60);
      const m = remaining % 60;
      return `남은 ${h === 0 ? `${m}분` : m === 0 ? `${h}시간` : `${h}시간 ${m}분`} 기준`;
    }
  }
  if (row.tool === "report-structure") {
    const reportType = typeof p.reportType === "string" ? p.reportType : null;
    const pages = typeof p.targetPages === "number" ? p.targetPages : null;
    if (reportType && pages) return `${reportType} · ${pages}쪽`;
  }
  if (row.tool === "report-checklist" || row.tool === "wizard-assignment") {
    return "교수 공지 체크리스트";
  }
  return null;
}
