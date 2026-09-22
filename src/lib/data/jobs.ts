import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

/**
 * 이 시간(ms)을 넘긴 pending/running job은 "버려진(stale)" 작업으로 본다.
 *
 * 왜 필요한가 (2026-06-05 — "몇 시간째 생성 중" 근본 수정):
 *   모든 비동기 작업(quiz·summarize·wizard 13종)은 route에서 `after()` 콜백으로
 *   markJobDone/markJobError를 부른다. 그런데 Vercel serverless 인스턴스가 응답 직후
 *   freeze/kill되거나 함수 maxDuration(300s)을 넘기면 `after` 콜백이 끝까지 안 돌아
 *   markJobError조차 못 부른다 → job이 pending/running에 영원히 남는다.
 *   - 사용자 화면: "생성 중" 카드/스피너가 영구 표시 ("몇 시간째 생성 중")
 *   - 더 나쁜 건: enqueueJob이 그 stale job을 reuse해서, 그 자료는 새 작업을
 *     영원히 못 만든다 (항상 죽은 job을 돌려줌).
 *
 * 임계값 8분: maxDuration 300초(5분) + OCR·LLM 보충 루프 여유 + Realtime 지연.
 * 정상 작업이 8분을 넘기는 경우는 거의 없으니, 그 이상이면 죽은 작업으로 판단해
 * 새 시도를 허용하고 stale 카드를 화면에서 치운다.
 */
const STALE_JOB_MS = 8 * 60 * 1000;

function isStale(row: Pick<JobRow, "created_at" | "started_at">): boolean {
  const anchor = row.started_at ?? row.created_at;
  return Date.now() - new Date(anchor).getTime() > STALE_JOB_MS;
}

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
      // 살아있는 작업이면 그대로 재사용 (중복 호출 방지)
      if (!isStale(existing)) {
        return { job: mapJob(existing), isNew: false };
      }
      // stale(8분+ 멈춘 죽은 작업)이면 error로 닫고 새로 만든다.
      // 이 닫기가 없으면 아래 INSERT가 UNIQUE partial index에 막혀 영원히 새 작업 불가.
      const { error: staleError } = await admin
        .from("jobs")
        .update({
          status: "error",
          error_message: "작업이 중단돼 자동 정리됐어요. 다시 시도해 주세요.",
          finished_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .eq("owner_id", opts.ownerId)
        .eq("status", existing.status);
      if (staleError) throw new Error("중단된 작업 상태를 정리하지 못했어요.");
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

  if (error?.code === "23505" && opts.materialId) {
    const { data: winner, error: lookupError } = await admin
      .from("jobs")
      .select("*")
      .eq("owner_id", opts.ownerId)
      .eq("material_id", opts.materialId)
      .eq("tool", opts.tool)
      .in("status", ["pending", "running"])
      .maybeSingle();
    if (!lookupError && winner) return { job: mapJob(winner), isNew: false };
  }
  if (error || !data) throw new Error("작업을 등록하지 못했어요. 다시 시도해주세요.");
  return { job: mapJob(data), isNew: true };
}

export async function getJob(opts: { ownerId: string; jobId: string }): Promise<JobView | null> {
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
  const { data: latest } = await admin
    .from("jobs")
    .select("*")
    .eq("owner_id", opts.ownerId)
    .eq("material_id", opts.materialId)
    .eq("tool", opts.tool)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return null;
  // stale pending/running이면 자료 페이지가 "요약/추출 중"에 영구 멈추지 않게
  // error로 닫아서 그 상태로 돌려준다. (다른 도구 stale 정리와 동일 정책)
  if ((latest.status === "pending" || latest.status === "running") && isStale(latest)) {
    const errorMessage = "작업이 중단돼 자동 정리됐어요. 다시 시도해 주세요.";
    const { data: closed, error: closeError } = await admin
      .from("jobs")
      .update({
        status: "error",
        error_message: errorMessage,
        finished_at: new Date().toISOString(),
      })
      .eq("id", latest.id)
      .eq("owner_id", opts.ownerId)
      .eq("status", latest.status)
      .select("*")
      .maybeSingle();
    if (closeError) throw new Error("중단된 작업 상태를 정리하지 못했어요.");
    if (closed) return mapJob(closed);
    return getJob({ ownerId: opts.ownerId, jobId: latest.id });
  }
  return mapJob(latest);
}

// 모든 markJob* 함수는 ownerId 가드를 받아 service-role 우회 시 다른 사용자 job을 건드리지 않게 함.
// 호출처는 enqueueJob 결과의 job.owner_id를 같이 넘긴다.

/** Atomically claim pending work. A second worker must not run or bill the same job. */
export async function markJobRunning(opts: { jobId: string; ownerId: string }): Promise<boolean> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from("jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", opts.jobId)
    .eq("owner_id", opts.ownerId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) throw new Error("작업 시작 상태를 저장하지 못했어요.");
  return Boolean(data);
}

export async function markJobDone(opts: {
  jobId: string;
  ownerId: string;
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
  const { error } = await admin
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
    .eq("id", opts.jobId)
    .eq("owner_id", opts.ownerId)
    .in("status", ["pending", "running"]);
  if (error) throw new Error("작업 완료 상태를 저장하지 못했어요.");
}

export async function markJobError(opts: {
  jobId: string;
  ownerId: string;
  errorMessage: string;
}): Promise<void> {
  const admin = getAdminSupabase();
  const { error } = await admin
    .from("jobs")
    .update({
      status: "error",
      error_message: opts.errorMessage,
      finished_at: new Date().toISOString(),
    })
    .eq("id", opts.jobId)
    .eq("owner_id", opts.ownerId)
    .in("status", ["pending", "running"]);
  if (error) throw new Error("작업 오류 상태를 저장하지 못했어요.");
}

/**
 * 사용자의 active(pending/running) 작업 전체 — 사이드바·자료 페이지 진행 표시용.
 *
 * stale(8분+ 멈춘 죽은) 작업은 여기서 error로 마킹하고 결과에서 뺀다.
 * 폴링이 주기적으로 도니, 죽은 job의 "생성 중" 카드가 다음 tick에 사라진다.
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

  const live: JobRow[] = [];
  const staleIds: string[] = [];
  for (const row of data) {
    if (isStale(row)) staleIds.push(row.id);
    else live.push(row);
  }
  // 죽은 작업 일괄 정리 — 다음 폴링부터 화면에서 빠짐. ownerId 가드로 본인 것만.
  if (staleIds.length > 0) {
    await admin
      .from("jobs")
      .update({
        status: "error",
        error_message: "작업이 중단돼 자동 정리됐어요. 다시 시도해 주세요.",
        finished_at: new Date().toISOString(),
      })
      .eq("owner_id", opts.ownerId)
      .in("id", staleIds);
  }

  return live.map(mapJob);
}
