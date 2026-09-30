import "server-only";
import { reserveMonthlyAiBudget } from "@/lib/data/ai-usage";
import {
  type JobView,
  markJobDone,
  markJobError,
  markJobRunning,
  recordJobCheckpoint,
} from "@/lib/data/jobs";
import { STYLE_ORDER, type SummaryStyle } from "@/lib/material-policy";
import { runQuizGeneration } from "@/lib/services/quiz";
import { runSummarize } from "@/lib/services/summarize";
import { getAdminSupabase } from "@/lib/supabase/admin";

const DIFFICULTIES = ["쉬움", "보통", "어려움"] as const;
const KINDS = ["multiple-choice", "short-answer", "essay"] as const;

function stringsFrom(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** stale로 판정되어 retry_count=1로 선점된 요약·문제 작업을 저장 입력으로 재구성한다. */
export async function runRecoveredMaterialJob(job: JobView): Promise<void> {
  try {
    const reservation = await reserveMonthlyAiBudget({ ownerId: job.ownerId });
    if (!reservation.allowed) {
      await markJobError({
        jobId: job.id,
        ownerId: job.ownerId,
        errorMessage: "월간 AI 사용 한도에 도달해 자동 재시도를 멈췄어요.",
      });
      return;
    }
    if (!(await markJobRunning({ jobId: job.id, ownerId: job.ownerId }))) return;
    await recordJobCheckpoint({
      jobId: job.id,
      ownerId: job.ownerId,
      stage: "rebuilding-input",
      progress: 25,
      message: "저장된 입력으로 작업을 복구하고 있어요.",
    });
    if (!job.materialId) throw new Error("재시도할 자료 정보가 없어요.");

    const admin = getAdminSupabase();
    const extraIds = job.tool === "quiz" ? stringsFrom(job.inputParams.extraMaterialIds) : [];
    const materialIds = Array.from(new Set([job.materialId, ...extraIds]));
    const { data, error } = await admin
      .from("materials")
      .select("id, course_id, title, type, full_text, page_count, mime_type")
      .eq("owner_id", job.ownerId)
      .in("id", materialIds);
    if (error || !data) throw new Error("재시도할 자료를 불러오지 못했어요.");
    const primary = data.find((item) => item.id === job.materialId);
    if (!primary?.full_text?.trim()) throw new Error("재시도할 자료 본문이 비어 있어요.");

    if (job.tool === "summarize") {
      await recordJobCheckpoint({
        jobId: job.id,
        ownerId: job.ownerId,
        stage: "generating-summary",
        progress: 45,
      });
      const styles = stringsFrom(job.inputParams.styles).filter((style): style is SummaryStyle =>
        (STYLE_ORDER as readonly string[]).includes(style),
      );
      const result = await runSummarize({
        ownerId: job.ownerId,
        materialId: primary.id,
        title: primary.title,
        type: primary.type,
        fullText: primary.full_text,
        sanitizedText: primary.full_text,
        pageCount: primary.page_count,
        parserWarnings: [],
        styles,
        intentNote:
          typeof job.inputParams.intentNote === "string" ? job.inputParams.intentNote : undefined,
      });
      if (!result.ok) throw new Error(result.error);
      await recordJobCheckpoint({
        jobId: job.id,
        ownerId: job.ownerId,
        stage: "verifying-output",
        progress: 85,
      });
      await markJobDone({
        jobId: job.id,
        ownerId: job.ownerId,
        result: { summary: result.summary },
        modelId: result.modelId,
        usage: result.usage,
        costUsd: result.costUsd,
      });
      return;
    }

    const difficulty = DIFFICULTIES.includes(
      job.inputParams.difficulty as (typeof DIFFICULTIES)[number],
    )
      ? (job.inputParams.difficulty as (typeof DIFFICULTIES)[number])
      : "보통";
    const requestedCount =
      typeof job.inputParams.count === "number"
        ? Math.max(1, Math.min(50, Math.trunc(job.inputParams.count)))
        : 10;
    const kinds = stringsFrom(job.inputParams.kinds).filter(
      (kind): kind is (typeof KINDS)[number] => (KINDS as readonly string[]).includes(kind),
    );
    const materialsInOrder = [primary, ...data.filter((item) => item.id !== primary.id)];
    await recordJobCheckpoint({
      jobId: job.id,
      ownerId: job.ownerId,
      stage: "generating-quiz",
      progress: 45,
    });
    const result = await runQuizGeneration({
      ownerId: job.ownerId,
      courseId: primary.course_id,
      materials: materialsInOrder.map((item) => ({
        materialId: item.id,
        title: item.title,
        type: item.type,
        fullText: item.full_text ?? "",
        pageCount: item.page_count,
        mimeType: item.mime_type,
      })),
      parserWarnings: [],
      difficulty,
      requestedCount,
      kinds,
      scope: typeof job.inputParams.scope === "string" ? job.inputParams.scope : "",
      intentNote: typeof job.inputParams.intentNote === "string" ? job.inputParams.intentNote : "",
    });
    if (!result.ok) throw new Error(result.error);
    await recordJobCheckpoint({
      jobId: job.id,
      ownerId: job.ownerId,
      stage: "verifying-output",
      progress: 85,
    });
    await markJobDone({
      jobId: job.id,
      ownerId: job.ownerId,
      result: { quizId: result.quizId, quality: result.quality },
      modelId: result.modelId,
      usage: result.usage,
      costUsd: result.costUsd,
    });
  } catch (error) {
    await markJobError({
      jobId: job.id,
      ownerId: job.ownerId,
      errorMessage: `자동 재시도 실패: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
