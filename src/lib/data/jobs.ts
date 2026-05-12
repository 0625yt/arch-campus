import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

export type JobStatus = JobRow["status"];
export type JobTool = string;

export interface JobView {
  id: string;
  ownerId: string;
  materialId: string | null;
  tool: JobTool;
  status: JobStatus;
  inputParams: Record<string, unknown>;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  modelId: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
  generationId: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

function mapJob(row: JobRow): JobView {
  return {
    id: row.id,
    ownerId: row.owner_id,
    materialId: row.material_id,
    tool: row.tool,
    status: row.status,
    inputParams: row.input_params,
    result: row.result,
    errorMessage: row.error_message,
    modelId: row.model_id,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cacheReadTokens: row.cache_read_tokens,
    cacheCreationTokens: row.cache_creation_tokens,
    costUsd: row.cost_usd,
    generationId: row.generation_id,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

/**
 * 새 job 등록 — 같은 자료+도구에 active(pending/running) 작업 있으면 그걸 그대로 반환.
 * UNIQUE partial index가 보장하니까 race condition도 안전.
 */
export async function enqueueJob(opts: {
  ownerId: string;
  materialId?: string | null;
  tool: JobTool;
  inputParams?: Record<string, unknown>;
}): Promise<{ job: JobView; isNew: boolean }> {
  const admin = getAdminSupabase();

  // 1) 진행 중인 작업 먼저 확인 (material_id 있을 때만)
  if (opts.materialId) {
    const { data: existing } = await admin
      .from("jobs")
      .select("*")
      .eq("owner_id", opts.ownerId)
      .eq("material_id", opts.materialId)
      .eq("tool", opts.tool)
      .in("status", ["pending", "running"])
      .maybeSingle();
    if (existing) {
      return { job: mapJob(existing), isNew: false };
    }
  }

  // 2) 새로 만들기
  const { data, error } = await admin
    .from("jobs")
    .insert({
      owner_id: opts.ownerId,
      material_id: opts.materialId ?? null,
      tool: opts.tool,
      status: "pending",
      input_params: opts.inputParams ?? {},
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`jobs 생성 실패: ${error?.message ?? "unknown"}`);
  }
  return { job: mapJob(data), isNew: true };
}

export async function getJob(opts: {
  ownerId: string;
  jobId: string;
}): Promise<JobView | null> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from("jobs")
    .select("*")
    .eq("owner_id", opts.ownerId)
    .eq("id", opts.jobId)
    .maybeSingle();
  if (error || !data) return null;
  return mapJob(data);
}

/**
 * 자료 + 도구 조합으로 가장 최근 job 1개 (어떤 상태든) — 자료 페이지 진입 시 진행 중인 게 있는지 보기 위함.
 */
export async function getLatestJob(opts: {
  ownerId: string;
  materialId: string;
  tool: JobTool;
}): Promise<JobView | null> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from("jobs")
    .select("*")
    .eq("owner_id", opts.ownerId)
    .eq("material_id", opts.materialId)
    .eq("tool", opts.tool)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapJob(data);
}

export async function markJobRunning(jobId: string): Promise<void> {
  const admin = getAdminSupabase();
  await admin
    .from("jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", jobId);
}

export async function markJobDone(opts: {
  jobId: string;
  result: Record<string, unknown>;
  modelId: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
  costUsd: number;
  generationId?: string | null;
}): Promise<void> {
  const admin = getAdminSupabase();
  await admin
    .from("jobs")
    .update({
      status: "done",
      result: opts.result,
      model_id: opts.modelId,
      input_tokens: opts.usage.inputTokens,
      output_tokens: opts.usage.outputTokens,
      cache_read_tokens: opts.usage.cacheReadTokens,
      cache_creation_tokens: opts.usage.cacheCreationTokens,
      cost_usd: opts.costUsd,
      generation_id: opts.generationId ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", opts.jobId);
}

export async function markJobError(opts: {
  jobId: string;
  errorMessage: string;
}): Promise<void> {
  const admin = getAdminSupabase();
  await admin
    .from("jobs")
    .update({
      status: "error",
      error_message: opts.errorMessage,
      finished_at: new Date().toISOString(),
    })
    .eq("id", opts.jobId);
}

/**
 * 사용자의 active(pending/running) 작업 전체 — 사이드바·자료 페이지 진행 표시용.
 */
export async function listActiveJobs(opts: { ownerId: string }): Promise<JobView[]> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from("jobs")
    .select("*")
    .eq("owner_id", opts.ownerId)
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map(mapJob);
}
