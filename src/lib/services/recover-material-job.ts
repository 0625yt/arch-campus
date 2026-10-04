import "server-only";
import { reserveMonthlyAiBudget } from "@/lib/data/ai-usage";
import { type JobView, markJobError, markJobRunning, recordJobCheckpoint } from "@/lib/data/jobs";
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
  const execution = { jobId: job.id, ownerId: job.ownerId, retryCount: job.retryCount };
  try {
    // 실행권 없는 중복 콜백은 예약과 AI 호출을 모두 건너뛴다.
    if (!(await markJobRunning(execution))) return;
    if (
      !(await recordJobCheckpoint({
        ...execution,
        stage: "rebuilding-input",
        progress: 25,
        message: "저장된 입력으로 작업을 복구하고 있어요.",
      }))
    )
      return;
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

    const reservation = await reserveMonthlyAiBudget({ ownerId: job.ownerId });
    if (!reservation.allowed) {
      await markJobError({
        ...execution,
        errorMessage: "월간 AI 사용 한도에 도달해 자동 재시도를 멈췄어요.",
      });
      return;
    }

    if (job.tool === "summarize") {
      if (
        !(await recordJobCheckpoint({
          ...execution,
          stage: "generating-summary",
          progress: 45,
        }))
      )
        return;
      const styles = stringsFrom(job.inputParams.styles).filter((style): style is SummaryStyle =>
        (STYLE_ORDER as readonly string[]).includes(style),
      );
      const result = await runSummarize({
        jobExecution: execution,
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
    if (
      !(await recordJobCheckpoint({
        ...execution,
        stage: "generating-quiz",
        progress: 45,
      }))
    )
      return;
    const result = await runQuizGeneration({
      jobExecution: execution,
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
  } catch (error) {
    await markJobError({
      ...execution,
      errorMessage: `자동 재시도 실패: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
