import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { enqueueJob, markJobDone, markJobError, markJobRunning } from "@/lib/data/jobs";
import { parseDocument, ParserRejectedError } from "@/lib/parsers";
import { runQuizGeneration, type Difficulty } from "@/lib/services/quiz";
import { runSummarize } from "@/lib/services/summarize";
import { convertToPdf } from "@/lib/cloudconvert";
import { createSignedReadUrl, storeMaterialFile } from "@/lib/storage";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

interface PipelineOk {
  ok: true;
  materialId: string;
  parser: string;
  pageCount: number | null;
  jobs: {
    summarize: { id: string; status: "pending" | "running" | "done" | "error" | "cancelled" };
    quiz: { id: string; status: "pending" | "running" | "done" | "error" | "cancelled" };
  };
}

interface PipelineErr {
  ok: false;
  error: string;
  reason?: string;
}

const ALLOWED_TYPES = ["lecture", "assignment", "exam", "team", "syllabus", "notice"] as const;
type MaterialType = (typeof ALLOWED_TYPES)[number];

const MetaSchema = z.object({
  courseId: z.string().optional(),
  title: z.string().max(200).optional(),
  type: z.enum(ALLOWED_TYPES).optional(),
  difficulty: z.enum(["쉬움", "보통", "어려움"]).optional(),
  count: z.coerce.number().int().min(1).max(10).optional(),
});

/**
 * 자료 업로드 단일 진입점 — 한 번의 multipart로 다음을 일괄 처리:
 *
 *   1) Storage 저장
 *   2) 파일 파싱 (실패해도 placeholder로 진행)
 *   3) materials 행 INSERT
 *   4) summarize · quiz 잡 두 개 동시 큐잉 (병렬)
 *   5) materialId + jobIds 즉시 반환
 *
 * 클라이언트는 두 jobId를 useJob으로 동시 폴링 → 끝나는 대로 화면에 흘려준다.
 * 학생이 한 번 업로드만 하면 60초 안에 요약과 10문제가 양쪽에서 도착.
 *
 * 비용:
 *   - summarize: Sonnet 4.6 ~ $0.02/회
 *   - quiz: Sonnet 4.6 ~ $0.03/회 (5~10문제)
 *   - 분류기 Haiku ~ $0.0001 × 2
 *   합계 ~ $0.05/업로드.
 *
 * 기존 /api/summarize·/api/quiz는 single-purpose 호출이 필요한 케이스를 위해 유지.
 * 새 업로드 동선은 이 라우트 하나로 통일.
 */
export async function POST(req: Request): Promise<NextResponse<PipelineOk | PipelineErr>> {
  let ownerId: string;
  try {
    ownerId = await getOwnerId();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    throw e;
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: `form-data 파싱 실패: ${detail}` },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "file 필드가 비어있어요" }, { status: 400 });
  }

  let meta: z.infer<typeof MetaSchema>;
  try {
    meta = MetaSchema.parse({
      courseId: emptyToUndef(form.get("courseId")),
      title: emptyToUndef(form.get("title")),
      type: emptyToUndef(form.get("type")),
      difficulty: emptyToUndef(form.get("difficulty")),
      count: emptyToUndef(form.get("count")),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `메타 입력 검증 실패: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 400 },
    );
  }

  // 1) Storage
  let uploaded: Awaited<ReturnType<typeof storeMaterialFile>>;
  try {
    uploaded = await storeMaterialFile({
      ownerId,
      file,
      filename: file.name,
      mimeType: file.type,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "업로드 실패" },
      { status: 500 },
    );
  }

  // 2) Parse — rejected는 placeholder로
  let parsed: Awaited<ReturnType<typeof parseDocument>>;
  try {
    parsed = await parseDocument({
      bytes: uploaded.bytes,
      filename: uploaded.filename,
      mimeType: uploaded.mimeType,
    });
  } catch (e) {
    if (e instanceof ParserRejectedError) {
      const message = e.message;
      parsed = {
        text: `[자동 추출 실패]\n파일명: ${uploaded.filename}\n사유: ${message}`,
        sanitizedText: `[자동 추출 실패]\n파일명: ${uploaded.filename}\n사유: ${message}`,
        mimeType: uploaded.mimeType,
        source: "rejected",
        warnings: [message],
      };
    } else {
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : "파싱 실패" },
        { status: 500 },
      );
    }
  }

  // 3) materials 행
  const admin = getAdminSupabase();
  const title = (meta.title ?? "").trim() || stripExt(file.name);
  const type: MaterialType = meta.type ?? "lecture";

  const { data: material, error: materialErr } = await admin
    .from("materials")
    .insert({
      owner_id: ownerId,
      course_id: meta.courseId ?? null,
      title,
      type,
      original_filename: uploaded.filename,
      mime_type: uploaded.mimeType,
      storage_path: uploaded.storagePath,
      page_count: parsed.pageCount ?? null,
      full_text: parsed.sanitizedText.slice(0, 200_000),
    })
    .select("id")
    .single();

  if (materialErr || !material) {
    return NextResponse.json(
      { ok: false, error: `materials 저장 실패: ${materialErr?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  // 4) 두 잡 큐잉 (병렬). enqueueJob의 active dedupe 덕에 race-safe.
  const [summarizeEnqueue, quizEnqueue] = await Promise.all([
    enqueueJob({
      ownerId,
      materialId: material.id,
      tool: "summarize",
      inputParams: { materialId: material.id, title, type },
    }),
    enqueueJob({
      ownerId,
      materialId: material.id,
      tool: "quiz",
      inputParams: {
        materialId: material.id,
        difficulty: meta.difficulty ?? "보통",
        count: meta.count ?? 10,
      },
    }),
  ]);

  // 5) 백그라운드 실행 — 두 잡이 동시에 돈다. 각 잡은 자기 markRunning/Done/Error.
  after(async () => {
    await Promise.all([
      runSummarizeJob({
        jobId: summarizeEnqueue.job.id,
        ownerId,
        materialId: material.id,
        title,
        type,
        fullText: parsed.text,
        sanitizedText: parsed.sanitizedText,
        pageCount: parsed.pageCount ?? null,
        parserWarnings: parsed.warnings,
      }),
      runQuizJob({
        jobId: quizEnqueue.job.id,
        ownerId,
        materialId: material.id,
        courseId: meta.courseId ?? null,
        title,
        type,
        fullText: parsed.text,
        sanitizedText: parsed.sanitizedText,
        pageCount: parsed.pageCount ?? null,
        parserWarnings: parsed.warnings,
        difficulty: (meta.difficulty ?? "보통") as Difficulty,
        requestedCount: meta.count ?? 10,
      }),
    ]);
  });

  return NextResponse.json({
    ok: true,
    materialId: material.id,
    parser: parsed.source,
    pageCount: parsed.pageCount ?? null,
    jobs: {
      summarize: { id: summarizeEnqueue.job.id, status: summarizeEnqueue.job.status },
      quiz: { id: quizEnqueue.job.id, status: quizEnqueue.job.status },
    },
  });
}

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
    await markJobRunning(opts.jobId);
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
      await markJobError({ jobId: opts.jobId, errorMessage: result.error });
      return;
    }
    await markJobDone({
      jobId: opts.jobId,
      result: { summary: result.summary },
      modelId: result.modelId,
      usage: result.usage,
      costUsd: result.costUsd,
    });
  } catch (e) {
    await markJobError({
      jobId: opts.jobId,
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
    await markJobRunning(opts.jobId);
    const result = await runQuizGeneration({
      ownerId: opts.ownerId,
      materialId: opts.materialId,
      courseId: opts.courseId,
      title: opts.title,
      type: opts.type,
      fullText: opts.fullText,
      sanitizedText: opts.sanitizedText,
      pageCount: opts.pageCount,
      parserWarnings: opts.parserWarnings,
      difficulty: opts.difficulty,
      requestedCount: opts.requestedCount,
    });
    if (!result.ok) {
      await markJobError({ jobId: opts.jobId, errorMessage: result.error });
      return;
    }
    await markJobDone({
      jobId: opts.jobId,
      result: { quizId: result.quizId },
      modelId: result.modelId,
      usage: result.usage,
      costUsd: result.costUsd,
    });
  } catch (e) {
    await markJobError({
      jobId: opts.jobId,
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
    await markJobRunning(opts.jobId);

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
    const { error: putErr } = await admin.storage
      .from("materials")
      .upload(pdfPath, pdfBytes, {
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
    await markJobError({
      jobId: opts.jobId,
      errorMessage: e instanceof Error ? e.message : String(e),
    });
  }
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

function emptyToUndef(v: FormDataEntryValue | null): string | undefined {
  if (v === null) return undefined;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length === 0 ? undefined : t;
}

export function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}
