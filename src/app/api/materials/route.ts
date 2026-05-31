import { after, NextResponse } from "next/server";
import { convertToPdf } from "@/lib/cloudconvert";
import { enqueueJob, markJobDone, markJobError, markJobRunning } from "@/lib/data/jobs";
import { parseDocument } from "@/lib/parsers";
import { type Difficulty, runQuizGeneration } from "@/lib/services/quiz";
import { runSummarize } from "@/lib/services/summarize";
import { createSignedReadUrl } from "@/lib/storage";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

interface PipelineErr {
  ok: false;
  error: string;
  reason?: string;
}

/**
 * @deprecated 2026-05-31 — multipart 단일 업로드는 더 이상 지원하지 않음.
 *
 * 종전 흐름: file 업로드 + parseDocument 동기 호출 → materials INSERT + jobs 실행.
 * 문제:
 *   - Office 파일을 cloudconvert로 변환하기 전에 officeparser로 빈약하게 파싱 → 요약 실패
 *   - finalize / finalize-merged와 흐름이 갈라져 OCR·convert-first 가드가 두 곳만 박혀있음
 *
 * 새 흐름 (클라이언트가 사용 중):
 *   1) POST /api/materials/upload-url — signed URL 발급
 *   2) 클라이언트가 Supabase Storage에 직접 PUT
 *   3) POST /api/materials/finalize — 파싱·잡 큐잉 (Office는 cloudconvert 먼저 → Gemini OCR)
 *
 * 본 핸들러는 410 Gone — 외부에서 잘못 호출해도 새 엔드포인트로 안내.
 * export 함수(runSummarizeJob·runQuizJob·runConvertPdfJob·stripExt)는 다른 라우트에서
 * 재사용 중이라 본문 아래쪽에 그대로 유지.
 */
export async function POST(_req: Request): Promise<NextResponse<PipelineErr>> {
  return NextResponse.json(
    {
      ok: false,
      error:
        "이 엔드포인트는 더 이상 지원하지 않아요. /api/materials/upload-url → PUT → /api/materials/finalize 흐름을 사용해주세요.",
      reason: "deprecated",
    },
    { status: 410 },
  );
}

// 종전 multipart POST 본문은 제거 — git log e0e6047 이전 commit에서 확인.

export async function runSummarizeJob(opts: {
  jobId: string;
  ownerId: string;
  materialId: string;
  title: string;
  type: string;
  fullText: string;
  sanitizedText: string;
  pageCount: number | null;
  parserWarnings: string[];
}): Promise<void> {
  try {
    await markJobRunning({ jobId: opts.jobId, ownerId: opts.ownerId });
    const result = await runSummarize({
      ownerId: opts.ownerId,
      materialId: opts.materialId,
      title: opts.title,
      type: opts.type,
      fullText: opts.fullText,
      sanitizedText: opts.sanitizedText,
      pageCount: opts.pageCount,
      parserWarnings: opts.parserWarnings,
    });
    if (!result.ok) {
      await markJobError({ jobId: opts.jobId, ownerId: opts.ownerId, errorMessage: result.error });
      return;
    }
    await markJobDone({
      jobId: opts.jobId,
      ownerId: opts.ownerId,
      result: { summary: result.summary },
      modelId: result.modelId,
      usage: result.usage,
      costUsd: result.costUsd,
    });
  } catch (e) {
    await markJobError({
      jobId: opts.jobId,
      ownerId: opts.ownerId,
      errorMessage: e instanceof Error ? e.message : String(e),
    });
  }
}

export async function runQuizJob(opts: {
  jobId: string;
  ownerId: string;
  materialId: string;
  courseId: string | null;
  title: string;
  type: string;
  fullText: string;
  sanitizedText: string;
  pageCount: number | null;
  parserWarnings: string[];
  difficulty: Difficulty;
  requestedCount: number;
}): Promise<void> {
  try {
    await markJobRunning({ jobId: opts.jobId, ownerId: opts.ownerId });
    const result = await runQuizGeneration({
      ownerId: opts.ownerId,
      courseId: opts.courseId,
      materials: [
        {
          materialId: opts.materialId,
          title: opts.title,
          type: opts.type,
          fullText: opts.sanitizedText,
          pageCount: opts.pageCount,
        },
      ],
      parserWarnings: opts.parserWarnings,
      difficulty: opts.difficulty,
      requestedCount: opts.requestedCount,
    });
    if (!result.ok) {
      await markJobError({ jobId: opts.jobId, ownerId: opts.ownerId, errorMessage: result.error });
      return;
    }
    await markJobDone({
      jobId: opts.jobId,
      ownerId: opts.ownerId,
      result: { quizId: result.quizId },
      modelId: result.modelId,
      usage: result.usage,
      costUsd: result.costUsd,
    });
  } catch (e) {
    await markJobError({
      jobId: opts.jobId,
      ownerId: opts.ownerId,
      errorMessage: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Office 자료를 PDF로 변환해 Storage·DB를 교체한다.
 *
 * 흐름:
 *   1) markJobRunning
 *   2) Storage signed read URL 1h 발급 → CloudConvert에 input으로 전달
 *   3) convertToPdf → PDF 바이트 받음
 *   4) Storage에 <ownerId>/<materialId>.pdf로 PUT (admin client, upsert)
 *   5) materials UPDATE:
 *        original_storage_path = (구) storage_path
 *        storage_path          = 새 PDF 경로
 *        mime_type             = "application/pdf"
 *   6) markJobDone
 *
 * 실패 시 markJobError. materials row는 건드리지 않아 원본 그대로 남음.
 */
export async function runConvertPdfJob(opts: {
  jobId: string;
  ownerId: string;
  materialId: string;
  /** 변환 전 storage_path (원본 Office 파일) */
  sourceStoragePath: string;
  /** 원본 파일명 (확장자 + CloudConvert input_format 추정용) */
  filename: string;
}): Promise<void> {
  try {
    await markJobRunning({ jobId: opts.jobId, ownerId: opts.ownerId });

    const sourceUrl = await createSignedReadUrl({
      storagePath: opts.sourceStoragePath,
      ttlSec: 3600,
    });

    const pdfBytes = await convertToPdf({
      sourceUrl,
      filename: opts.filename,
    });

    const pdfPath = `${opts.ownerId}/${opts.materialId}.pdf`;
    const admin = getAdminSupabase();
    const { error: putErr } = await admin.storage.from("materials").upload(pdfPath, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });
    if (putErr) throw new Error(`PDF 저장 실패: ${putErr.message}`);

    const { error: updErr } = await admin
      .from("materials")
      .update({
        original_storage_path: opts.sourceStoragePath,
        storage_path: pdfPath,
        mime_type: "application/pdf",
      })
      .eq("id", opts.materialId)
      .eq("owner_id", opts.ownerId);
    if (updErr) throw new Error(`materials 갱신 실패: ${updErr.message}`);

    // markJobDone은 모델 호출용 시그니처라 더미 값 — convert-pdf는 AI 호출 없음
    await markJobDone({
      jobId: opts.jobId,
      ownerId: opts.ownerId,
      result: { pdfPath },
      modelId: "cloudconvert",
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      costUsd: 0, // 무료 한도 안 — 초과 시 별도 계측
    });

    // 변환된 PDF로 자료 본문 재추출 + summary/quiz 재실행:
    // HWP·Office 원본 파싱은 본문이 비어 placeholder만 들어가는 케이스가 잦음 (특히 HWP).
    // 변환 후 PDF는 LibreOffice 출력이라 pdfjs로 안정 추출 — 여기서 다시 돌려야
    // 사용자가 "변환은 됐는데 quiz가 망가짐" 상태를 보지 않는다.
    await reparseAndRerunAi({
      ownerId: opts.ownerId,
      materialId: opts.materialId,
      pdfPath,
      pdfBytes,
      filename: opts.filename,
    });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    // Vercel 로그에 풀 스택 — 사용자 메시지엔 친절히, 디버깅은 raw로.
    console.error("[convert-pdf] 실패:", {
      jobId: opts.jobId,
      materialId: opts.materialId,
      filename: opts.filename,
      raw,
    });
    await markJobError({
      jobId: opts.jobId,
      ownerId: opts.ownerId,
      errorMessage: humanizeConvertError(raw),
    });
  }
}

/**
 * cloudconvert raw 에러를 사용자가 알아볼 수 있는 한국어로.
 * UI에서 materials_jobs.error_message로 그대로 노출되므로 욕설·키 노출 X.
 */
function humanizeConvertError(raw: string): string {
  if (raw.includes("CLOUDCONVERT_API_KEY 미설정")) {
    return "PDF 변환 서비스가 설정되지 않았어요. 잠시 후 다시 시도해주세요.";
  }
  if (raw.includes("타임아웃")) {
    return "PDF 변환이 5분 안에 끝나지 않았어요. 자료가 너무 크거나 변환 서버가 혼잡할 수 있어요. 잠시 후 다시 올려주세요.";
  }
  if (raw.includes("확장자를 알 수 없는")) {
    return "이 파일 형식은 PDF로 자동 변환할 수 없어요. 미리 PDF로 저장해서 올려주세요.";
  }
  if (raw.includes("job 생성 실패")) {
    return "PDF 변환 서버 요청이 거부됐어요. 잠시 후 다시 시도해주세요.";
  }
  if (raw.includes("변환 실패")) {
    return "PDF로 변환하다가 실패했어요. 파일이 손상되었거나 비밀번호가 걸려있을 수 있어요. 원본을 PDF로 직접 저장해 다시 올려주세요.";
  }
  if (raw.includes("export URL 누락") || raw.includes("결과 PDF 다운로드 실패")) {
    return "PDF 변환은 됐는데 결과를 받지 못했어요. 잠시 후 다시 시도해주세요.";
  }
  if (raw.includes("SSRF guard")) {
    return "변환 결과 다운로드 경로가 차단됐어요. 운영자에게 문의해주세요.";
  }
  // 알 수 없는 케이스 — 짧게 사용자에게 보여주고 로그에서 raw 추적
  return `PDF로 바꾸지 못했어요 (${raw.slice(0, 80)})`;
}

/**
 * 변환 끝난 PDF를 다시 파싱해 materials.full_text/page_count를 갱신하고,
 * summarize·quiz 잡을 다시 큐잉한다.
 *
 * 실패해도 throw하지 않음 — 변환 잡 자체는 이미 done으로 마킹된 뒤라
 * 이 후처리가 깨져도 사용자 입장에서 "변환 OK + 옛 요약/문제 그대로"를 본다.
 * 새 잡이 만들어지면 enqueueJob의 active-dedupe 덕에 race-safe.
 */
async function reparseAndRerunAi(opts: {
  ownerId: string;
  materialId: string;
  pdfPath: string;
  pdfBytes: Uint8Array;
  filename: string;
}): Promise<void> {
  try {
    const parsed = await parseDocument({
      bytes: opts.pdfBytes,
      filename: opts.filename.replace(/\.[^.]+$/, ".pdf"),
      mimeType: "application/pdf",
    });

    const admin = getAdminSupabase();
    const { data: existing } = await admin
      .from("materials")
      .select("title, type, course_id")
      .eq("id", opts.materialId)
      .eq("owner_id", opts.ownerId)
      .maybeSingle();
    if (!existing) return;

    await admin
      .from("materials")
      .update({
        page_count: parsed.pageCount ?? null,
        full_text: parsed.sanitizedText.slice(0, 200_000),
      })
      .eq("id", opts.materialId)
      .eq("owner_id", opts.ownerId);

    const title = existing.title;
    const type = existing.type;
    const courseId = existing.course_id;

    const [reSummarize, reQuiz] = await Promise.all([
      enqueueJob({
        ownerId: opts.ownerId,
        materialId: opts.materialId,
        tool: "summarize",
        inputParams: { materialId: opts.materialId, title, type, retryAfterConvert: true },
      }),
      enqueueJob({
        ownerId: opts.ownerId,
        materialId: opts.materialId,
        tool: "quiz",
        inputParams: { materialId: opts.materialId, retryAfterConvert: true },
      }),
    ]);

    after(async () => {
      await Promise.all([
        runSummarizeJob({
          jobId: reSummarize.job.id,
          ownerId: opts.ownerId,
          materialId: opts.materialId,
          title,
          type,
          fullText: parsed.text,
          sanitizedText: parsed.sanitizedText,
          pageCount: parsed.pageCount ?? null,
          parserWarnings: parsed.warnings,
        }),
        runQuizJob({
          jobId: reQuiz.job.id,
          ownerId: opts.ownerId,
          materialId: opts.materialId,
          courseId: courseId ?? null,
          title,
          type,
          fullText: parsed.text,
          sanitizedText: parsed.sanitizedText,
          pageCount: parsed.pageCount ?? null,
          parserWarnings: parsed.warnings,
          difficulty: "보통",
          requestedCount: 10,
        }),
      ]);
    });
  } catch (e) {
    // 후처리 실패는 사용자에게 보이지 않게 로그만 — 변환은 이미 done
    console.error("[convert-pdf] reparse/rerun failed", {
      materialId: opts.materialId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

function _emptyToUndef(v: FormDataEntryValue | null): string | undefined {
  if (v === null) return undefined;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length === 0 ? undefined : t;
}

export function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}
