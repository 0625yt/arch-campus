import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

export interface MaterialJobExecution {
  jobId: string;
  retryCount: number;
}

export async function commitMaterialJobResult(options: {
  execution: MaterialJobExecution;
  ownerId: string;
  materialId: string;
  modelId: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
  costUsd: number;
  result: Record<string, unknown>;
  quiz?: Record<string, unknown>;
  generationId?: string | null;
}): Promise<Record<string, Json | undefined> | null> {
  const { data, error } = await getAdminSupabase().rpc("commit_material_job_result", {
    p_job_id: options.execution.jobId,
    p_owner_id: options.ownerId,
    p_retry_count: options.execution.retryCount,
    p_material_id: options.materialId,
    p_model_id: options.modelId,
    p_usage: options.usage,
    p_cost_usd: options.costUsd,
    p_result: options.result as Json,
    p_quiz: (options.quiz as Json | undefined) ?? null,
    p_generation_id: options.generationId ?? null,
  });
  if (error) throw new Error("작업 결과를 저장하지 못했어요. 다시 시도해 주세요.");
  if (data === null) {
    if (options.generationId) {
      await getAdminSupabase()
        .from("generations")
        .update({
          status: "error",
          error_message: "이전 실행의 결과 저장을 취소했어요.",
        })
        .eq("id", options.generationId)
        .eq("owner_id", options.ownerId);
    }
    return null;
  }
  if (typeof data !== "object" || Array.isArray(data))
    throw new Error("작업 저장 결과를 확인하지 못했어요.");
  return data;
}
